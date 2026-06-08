/**
 * Broker OAuth 2.0 — server-only helpers.
 *
 * Supports Alpaca and OANDA OAuth flows.
 * State tokens are stored in Upstash Redis with a 10-minute TTL and are
 * consumed (deleted) on first use — preventing replay attacks.
 *
 * Required environment variables:
 *   ALPACA_OAUTH_CLIENT_ID
 *   ALPACA_OAUTH_CLIENT_SECRET
 *   OANDA_OAUTH_CLIENT_ID       (for OANDA OAuth — optional if not using OANDA)
 *   OANDA_OAUTH_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL         (e.g. http://localhost:3000 or https://yourapp.vercel.app)
 */

import type { BrokerEnvironment } from "./workspace-types";

// ── Types ──────────────────────────────────────────────────────────────────────

export type OAuthProvider = "Alpaca" | "OANDA";

type OAuthStatePayload = {
  userId: string;
  provider: OAuthProvider;
  environment: BrokerEnvironment;
  createdAt: string;
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string; // ISO string
};

// ── KV helpers (same Upstash REST approach as workspace-store.ts) ──────────────

function getKvConfig() {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function kvSet(key: string, value: string, exSeconds: number): Promise<void> {
  const cfg = getKvConfig();
  if (!cfg) throw new Error("Redis not configured — cannot create OAuth state.");

  // Upstash pipeline: SET key value EX seconds
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([["SET", key, value, "EX", String(exSeconds)]]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis SET failed: ${res.status}`);
}

async function kvGetDel(key: string): Promise<string | null> {
  const cfg = getKvConfig();
  if (!cfg) throw new Error("Redis not configured — cannot validate OAuth state.");

  // Upstash pipeline: GET then DEL (atomic-ish; GETDEL isn't available on all plans)
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([["GET", key], ["DEL", key]]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis GET/DEL failed: ${res.status}`);

  const results = (await res.json()) as Array<{ result: unknown }>;
  const value = results[0]?.result;
  return typeof value === "string" ? value : null;
}

// ── State token management ─────────────────────────────────────────────────────

const STATE_TTL_SECONDS = 600; // 10 minutes
const STATE_KEY_PREFIX = "broker_oauth_state:";

/**
 * Generates a random state token and stores the OAuth context in Redis.
 * Returns the token to embed in the authorization URL.
 */
export async function createOAuthState(
  userId: string,
  provider: OAuthProvider,
  environment: BrokerEnvironment,
): Promise<string> {
  const token = crypto.randomUUID();
  const payload: OAuthStatePayload = {
    userId,
    provider,
    environment,
    createdAt: new Date().toISOString(),
  };
  await kvSet(`${STATE_KEY_PREFIX}${token}`, JSON.stringify(payload), STATE_TTL_SECONDS);
  return token;
}

/**
 * Validates and consumes a state token. Returns the stored context or null if
 * the token is invalid, expired, or already used.
 */
export async function consumeOAuthState(
  stateToken: string,
): Promise<OAuthStatePayload | null> {
  if (!stateToken || typeof stateToken !== "string") return null;

  const raw = await kvGetDel(`${STATE_KEY_PREFIX}${stateToken}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as OAuthStatePayload;
  } catch {
    return null;
  }
}

// ── Redirect URI ───────────────────────────────────────────────────────────────

export function getOAuthRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}/api/broker-connections/oauth/callback`;
}

// ── Alpaca OAuth ───────────────────────────────────────────────────────────────

export function buildAlpacaAuthUrl(stateToken: string): string {
  const clientId = process.env.ALPACA_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("ALPACA_OAUTH_CLIENT_ID is not set.");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getOAuthRedirectUri(),
    scope: "account:write trading",
    state: stateToken,
  });

  return `https://app.alpaca.markets/oauth/authorize?${params.toString()}`;
}

export async function exchangeAlpacaCode(code: string): Promise<OAuthTokens> {
  const clientId = process.env.ALPACA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ALPACA_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Alpaca OAuth credentials not configured on this server.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getOAuthRedirectUri(),
  });

  const res = await fetch("https://api.alpaca.markets/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Alpaca token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const accessToken = data.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Alpaca did not return an access token.");
  }

  const refreshToken =
    typeof data.refresh_token === "string" ? data.refresh_token : undefined;

  // Alpaca tokens typically don't expire, but store the hint if provided
  const expiresIn =
    typeof data.expires_in === "number" ? data.expires_in : null;
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : undefined;

  return { accessToken, refreshToken, tokenExpiresAt };
}

// ── OANDA OAuth ────────────────────────────────────────────────────────────────

function oandaAuthBase(environment: BrokerEnvironment) {
  return environment === "live"
    ? "https://www.oanda.com"
    : "https://fxpractice.oanda.com";
}

export function buildOandaAuthUrl(
  stateToken: string,
  environment: BrokerEnvironment,
): string {
  const clientId = process.env.OANDA_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("OANDA_OAUTH_CLIENT_ID is not set.");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getOAuthRedirectUri(),
    state: stateToken,
  });

  return `${oandaAuthBase(environment)}/oauth2-provider/auth?${params.toString()}`;
}

export async function exchangeOandaCode(
  code: string,
  environment: BrokerEnvironment,
): Promise<OAuthTokens> {
  const clientId = process.env.OANDA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.OANDA_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("OANDA OAuth credentials not configured on this server.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getOAuthRedirectUri(),
  });

  const res = await fetch(`${oandaAuthBase(environment)}/oauth2-provider/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OANDA token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const accessToken = data.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("OANDA did not return an access token.");
  }

  const refreshToken =
    typeof data.refresh_token === "string" ? data.refresh_token : undefined;

  const expiresIn =
    typeof data.expires_in === "number" ? data.expires_in : null;
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : undefined;

  return { accessToken, refreshToken, tokenExpiresAt };
}

// ── OAuth availability checks (safe for server-side use) ──────────────────────

export function isAlpacaOAuthConfigured(): boolean {
  return Boolean(
    process.env.ALPACA_OAUTH_CLIENT_ID &&
    process.env.ALPACA_OAUTH_CLIENT_SECRET,
  );
}

export function isOandaOAuthConfigured(): boolean {
  return Boolean(
    process.env.OANDA_OAUTH_CLIENT_ID &&
    process.env.OANDA_OAUTH_CLIENT_SECRET,
  );
}
