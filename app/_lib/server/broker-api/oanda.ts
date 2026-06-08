/**
 * OANDA broker adapter.
 *
 * Demo: https://api-fxpractice.oanda.com
 * Live: https://api-trade.oanda.com
 *
 * Auth: "Authorization: Bearer {token}"
 *   OAuth:  accessToken from OAuth flow (preferred — no manual entry)
 *   Legacy: apiKey (personal access token manually generated in OANDA portal)
 *
 * Flow:
 *   1. GET /v3/accounts — list accounts (returns array, take first).
 *   2. GET /v3/accounts/{id}/summary — balance, NAV, P&L.
 */

import type { StoredBrokerCredential } from "../broker-credentials";

export type OandaAccountData = {
  provider: "OANDA";
  accountRef: string;
  accountNumber: string;
  currency: string;
  balance: number;
  nav: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openTradeCount: number;
  fetchedAt: string;
};

function oandaBaseUrl(environment: "demo" | "live") {
  return environment === "live"
    ? "https://api-trade.oanda.com"
    : "https://api-fxpractice.oanda.com";
}

function oandaBearerToken(credential: StoredBrokerCredential): string {
  if (credential.accessToken) return credential.accessToken;
  if (credential.apiKey) return credential.apiKey;
  throw new Error("OANDA credential missing: needs either accessToken or apiKey.");
}

function oandaHeaders(credential: StoredBrokerCredential): Record<string, string> {
  return { Authorization: `Bearer ${oandaBearerToken(credential)}` };
}

export async function verifyOandaCredentials(
  credential: StoredBrokerCredential,
  environment: "demo" | "live",
): Promise<{ valid: boolean; accountRef: string | null; error?: string }> {
  try {
    const res = await fetch(`${oandaBaseUrl(environment)}/v3/accounts`, {
      headers: oandaHeaders(credential),
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false, accountRef: null, error: "Invalid token." };
    }
    if (!res.ok) {
      return { valid: false, accountRef: null, error: `OANDA returned ${res.status}.` };
    }

    const body = await res.json() as Record<string, unknown>;
    const accounts = body.accounts;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return { valid: false, accountRef: null, error: "No accounts found on this token." };
    }

    const firstAccount = accounts[0] as Record<string, unknown>;
    const accountId = typeof firstAccount.id === "string" ? firstAccount.id : null;

    return { valid: true, accountRef: accountId };
  } catch (err) {
    return {
      valid: false,
      accountRef: null,
      error: err instanceof Error ? err.message : "Failed to reach OANDA.",
    };
  }
}

export async function fetchOandaAccount(
  credential: StoredBrokerCredential,
  environment: "demo" | "live",
  accountRef: string,
): Promise<OandaAccountData> {
  const res = await fetch(
    `${oandaBaseUrl(environment)}/v3/accounts/${accountRef}/summary`,
    { headers: oandaHeaders(credential), cache: "no-store" },
  );

  if (!res.ok) throw new Error(`OANDA account fetch failed: ${res.status}`);

  const body = await res.json() as Record<string, unknown>;
  const account = (body.account ?? {}) as Record<string, unknown>;

  const balance       = parseFloat(String(account.balance ?? "0"));
  const nav           = parseFloat(String(account.NAV ?? account.nav ?? "0"));
  const unrealizedPnl = parseFloat(String(account.unrealizedPL ?? "0"));
  const realizedPnl   = parseFloat(String(account.pl ?? "0"));
  const openTradeCount =
    typeof account.openTradeCount === "number" ? account.openTradeCount : 0;
  const currency  = typeof account.currency === "string" ? account.currency : "USD";
  const accountId = typeof account.id === "string" ? account.id : accountRef;

  return {
    provider: "OANDA",
    accountRef: accountId,
    accountNumber: accountId,
    currency,
    balance:       Number.isFinite(balance) ? balance : 0,
    nav:           Number.isFinite(nav) ? nav : 0,
    unrealizedPnl: Number.isFinite(unrealizedPnl) ? unrealizedPnl : 0,
    realizedPnl:   Number.isFinite(realizedPnl) ? realizedPnl : 0,
    openTradeCount,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchOandaAccountAutoDiscover(
  credential: StoredBrokerCredential,
  environment: "demo" | "live",
): Promise<OandaAccountData> {
  const listRes = await fetch(`${oandaBaseUrl(environment)}/v3/accounts`, {
    headers: oandaHeaders(credential),
    cache: "no-store",
  });

  if (!listRes.ok) throw new Error(`OANDA accounts list failed: ${listRes.status}`);

  const listBody = await listRes.json() as Record<string, unknown>;
  const accounts = listBody.accounts;

  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("No OANDA accounts found.");
  }

  const firstAccount = accounts[0] as Record<string, unknown>;
  const accountId = String(firstAccount.id ?? "");

  return fetchOandaAccount(credential, environment, accountId);
}
