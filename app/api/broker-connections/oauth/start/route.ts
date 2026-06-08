/**
 * GET /api/broker-connections/oauth/start?provider=Alpaca&environment=demo
 *
 * Initiates an OAuth 2.0 authorization flow for the given broker.
 * Returns { authUrl } — the client opens this in a popup window.
 *
 * A short-lived state token is stored in Redis to:
 *   1. Tie the callback to the authenticated user (CSRF protection).
 *   2. Carry the provider + environment through the redirect.
 *
 * The state token is consumed (deleted) on first use in the callback route.
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import {
  createOAuthState,
  buildAlpacaAuthUrl,
  buildOandaAuthUrl,
  isAlpacaOAuthConfigured,
  isOandaOAuthConfigured,
  type OAuthProvider,
} from "@/app/_lib/server/broker-oauth";
import type { BrokerEnvironment } from "@/app/_lib/server/workspace-types";

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser();
    const url = new URL(request.url);

    const provider = url.searchParams.get("provider") as OAuthProvider | null;
    const environment = url.searchParams.get("environment") as BrokerEnvironment | null;

    if (provider !== "Alpaca" && provider !== "OANDA") {
      return NextResponse.json(
        { error: "provider must be Alpaca or OANDA." },
        { status: 400 },
      );
    }

    if (environment !== "demo" && environment !== "live") {
      return NextResponse.json(
        { error: "environment must be demo or live." },
        { status: 400 },
      );
    }

    if (provider === "Alpaca" && !isAlpacaOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "Alpaca OAuth is not configured on this server. " +
            "Set ALPACA_OAUTH_CLIENT_ID and ALPACA_OAUTH_CLIENT_SECRET.",
          code: "oauth_not_configured",
        },
        { status: 503 },
      );
    }

    if (provider === "OANDA" && !isOandaOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "OANDA OAuth is not configured on this server. " +
            "Set OANDA_OAUTH_CLIENT_ID and OANDA_OAUTH_CLIENT_SECRET.",
          code: "oauth_not_configured",
        },
        { status: 503 },
      );
    }

    const stateToken = await createOAuthState(user.userId, provider, environment);

    let authUrl: string;
    if (provider === "Alpaca") {
      authUrl = buildAlpacaAuthUrl(stateToken);
    } else {
      authUrl = buildOandaAuthUrl(stateToken, environment);
    }

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error("[broker-oauth start]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start OAuth flow." },
      { status: 500 },
    );
  }
}
