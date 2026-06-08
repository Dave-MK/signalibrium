/**
 * GET /api/broker-connections/oauth/callback?code=...&state=...
 *
 * Handles the OAuth 2.0 callback from Alpaca or OANDA after the user authorises.
 * This route runs in a popup window opened by the app.
 *
 * Steps:
 *   1. Validate + consume the state token from Redis (prevents replay attacks).
 *   2. Exchange the authorization code for access + refresh tokens.
 *   3. Verify the tokens work by fetching account info.
 *   4. Create a broker connection record in KV.
 *   5. Store the tokens in Clerk privateMetadata (encrypted, server-only).
 *   6. Return an HTML page that postMessages the connection back to the opener
 *      and closes the popup.
 *
 * Security:
 *   - State token is a UUID; deleted from Redis immediately on first use.
 *   - Access/refresh tokens are NEVER echoed in the response body or logged.
 *   - Clerk stores tokens encrypted at rest.
 */

import { NextResponse } from "next/server";
import {
  consumeOAuthState,
  exchangeAlpacaCode,
  exchangeOandaCode,
} from "@/app/_lib/server/broker-oauth";
import { storeBrokerCredential } from "@/app/_lib/server/broker-credentials";
import { verifyBrokerCredential } from "@/app/_lib/server/broker-api";
import {
  createBrokerConnection,
  deleteBrokerConnection,
} from "@/app/_lib/server/repositories/broker-connections";

/** Returns an HTML page that posts a message to the opener and closes the popup. */
function callbackPage(payload: Record<string, unknown>, title = "Connecting…") {
  const json = JSON.stringify(payload);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #06101a; color: #94a3b8;
           display: flex; align-items: center; justify-content: center; min-height: 100vh;
           margin: 0; font-size: 0.875rem; }
    .card { text-align: center; padding: 2rem; }
    .icon { font-size: 2rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon" id="icon">⏳</div>
    <p id="msg">Completing connection…</p>
  </div>
  <script>
    try {
      const payload = ${json};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
      }
      if (payload.type === 'broker-oauth-success') {
        document.getElementById('icon').textContent = '✅';
        document.getElementById('msg').textContent = 'Connected! Closing…';
      } else {
        document.getElementById('icon').textContent = '❌';
        document.getElementById('msg').textContent = payload.error || 'Something went wrong.';
      }
    } catch (e) {
      document.getElementById('msg').textContent = String(e);
    }
    // Auto-close after a short delay so the user can see confirmation
    setTimeout(() => window.close(), 1200);
  </script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Broker denied / user cancelled
  if (error) {
    const description = url.searchParams.get("error_description") ?? error;
    return callbackPage({
      type: "broker-oauth-error",
      error: `Authorization denied: ${description}`,
    }, "Cancelled");
  }

  if (!code || !state) {
    return callbackPage({
      type: "broker-oauth-error",
      error: "Missing code or state parameter.",
    }, "Error");
  }

  // ── 1. Validate state ────────────────────────────────────────────────────────
  let oauthState;
  try {
    oauthState = await consumeOAuthState(state);
  } catch (e) {
    console.error("[broker-oauth callback] state validation error:", e);
    return callbackPage({
      type: "broker-oauth-error",
      error: "Could not validate session. Please try again.",
    });
  }

  if (!oauthState) {
    return callbackPage({
      type: "broker-oauth-error",
      error: "Session expired or invalid. Please start the connection again.",
    });
  }

  const { userId, provider, environment } = oauthState;

  // ── 2. Exchange code for tokens ──────────────────────────────────────────────
  let tokens;
  try {
    if (provider === "Alpaca") {
      tokens = await exchangeAlpacaCode(code);
    } else {
      tokens = await exchangeOandaCode(code, environment);
    }
  } catch (e) {
    console.error("[broker-oauth callback] token exchange failed:", e);
    return callbackPage({
      type: "broker-oauth-error",
      error: e instanceof Error ? e.message : "Token exchange failed.",
    });
  }

  const credential = {
    provider,
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    ...(tokens.tokenExpiresAt ? { tokenExpiresAt: tokens.tokenExpiresAt } : {}),
  };

  // ── 3. Verify tokens + discover account ref ──────────────────────────────────
  let accountRef: string | null = null;
  try {
    const verifyResult = await verifyBrokerCredential(provider, environment, credential);
    if (!verifyResult.valid) {
      return callbackPage({
        type: "broker-oauth-error",
        error: verifyResult.error ?? "Token verification failed.",
      });
    }
    accountRef = verifyResult.accountRef ?? null;
  } catch (e) {
    console.error("[broker-oauth callback] verify failed:", e);
    return callbackPage({
      type: "broker-oauth-error",
      error: "Could not verify account access. Please try again.",
    });
  }

  // ── 4. Create KV connection ──────────────────────────────────────────────────
  let connectionId: string | null = null;
  try {
    const envLabel = environment === "live" ? "Live" : (provider === "Alpaca" ? "Paper" : "Demo");
    const connection = await createBrokerConnection({
      provider,
      environment,
      label: `${provider} ${envLabel}`,
      accountRef,
      status: "connected",
    });
    connectionId = connection.id;

    // ── 5. Store tokens in Clerk (atomic — rollback KV if Clerk fails) ──────────
    try {
      await storeBrokerCredential(userId, connection.id, credential);
    } catch (clerkError) {
      console.error("[broker-oauth callback] Clerk storage failed — rolling back:", clerkError);
      await deleteBrokerConnection(connection.id).catch(() => {});
      return callbackPage({
        type: "broker-oauth-error",
        error: "Failed to store credentials securely. Please try again.",
      });
    }

    // ── 6. Return success page with connection data (NO tokens in payload) ───────
    return callbackPage({
      type: "broker-oauth-success",
      connection: {
        id: connection.id,
        provider: connection.provider,
        environment: connection.environment,
        label: connection.label,
        status: connection.status,
        accountRef: connection.accountRef,
        executionModes: connection.executionModes,
        lastError: null,
        lastSyncedAt: null,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    }, "Connected!");
  } catch (e) {
    console.error("[broker-oauth callback] connection creation failed:", e);
    // Clean up if we got a connectionId before the error
    if (connectionId) await deleteBrokerConnection(connectionId).catch(() => {});
    return callbackPage({
      type: "broker-oauth-error",
      error: e instanceof Error ? e.message : "Failed to create connection.",
    });
  }
}
