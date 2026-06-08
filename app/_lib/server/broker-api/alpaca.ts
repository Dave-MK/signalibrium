/**
 * Alpaca broker adapter.
 *
 * Paper (demo): https://paper-api.alpaca.markets
 * Live:         https://api.alpaca.markets
 *
 * Auth — two modes supported:
 *   OAuth:  Authorization: Bearer {accessToken}  (preferred — no manual key entry)
 *   Legacy: APCA-API-KEY-ID + APCA-API-SECRET-KEY headers
 *
 * Daily P&L: equity − last_equity (Alpaca provides both in the account object).
 */

import type { StoredBrokerCredential } from "../broker-credentials";

export type AlpacaAccountData = {
  provider: "Alpaca";
  accountNumber: string;
  accountRef: string;
  status: string;
  currency: string;
  cash: number;
  equity: number;
  lastEquity: number;
  dailyPnl: number;
  unrealizedPnl: number;
  buyingPower: number;
  fetchedAt: string;
};

function alpacaBaseUrl(environment: "demo" | "live") {
  return environment === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";
}

function alpacaAuthHeaders(
  credential: Pick<StoredBrokerCredential, "accessToken" | "apiKey" | "apiSecret">,
): Record<string, string> {
  if (credential.accessToken) {
    // OAuth Bearer token — no API keys needed
    return { Authorization: `Bearer ${credential.accessToken}` };
  }
  if (credential.apiKey && credential.apiSecret) {
    return {
      "APCA-API-KEY-ID": credential.apiKey,
      "APCA-API-SECRET-KEY": credential.apiSecret,
    };
  }
  throw new Error("Alpaca credential missing: needs either accessToken or apiKey+apiSecret.");
}

export async function verifyAlpacaCredentials(
  credential: StoredBrokerCredential,
  environment: "demo" | "live",
): Promise<{ valid: boolean; accountRef: string | null; error?: string }> {
  try {
    const res = await fetch(`${alpacaBaseUrl(environment)}/v2/account`, {
      headers: alpacaAuthHeaders(credential),
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false, accountRef: null, error: "Invalid credentials." };
    }
    if (!res.ok) {
      return { valid: false, accountRef: null, error: `Alpaca returned ${res.status}.` };
    }

    const body = await res.json() as Record<string, unknown>;
    const accountNumber = typeof body.account_number === "string" ? body.account_number : null;

    return { valid: true, accountRef: accountNumber };
  } catch (err) {
    return {
      valid: false,
      accountRef: null,
      error: err instanceof Error ? err.message : "Failed to reach Alpaca.",
    };
  }
}

export async function fetchAlpacaAccount(
  credential: StoredBrokerCredential,
  environment: "demo" | "live",
): Promise<AlpacaAccountData> {
  const res = await fetch(`${alpacaBaseUrl(environment)}/v2/account`, {
    headers: alpacaAuthHeaders(credential),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Alpaca account fetch failed: ${res.status}`);
  }

  const body = await res.json() as Record<string, unknown>;

  const equity      = parseFloat(String(body.equity      ?? "0"));
  const lastEquity  = parseFloat(String(body.last_equity ?? "0"));
  const cash        = parseFloat(String(body.cash        ?? "0"));
  const buyingPower = parseFloat(String(body.buying_power ?? "0"));
  const unrealizedPnl = parseFloat(String(body.unrealized_pl ?? "0"));
  const accountNumber = typeof body.account_number === "string" ? body.account_number : "";

  return {
    provider: "Alpaca",
    accountNumber,
    accountRef: accountNumber,
    status: typeof body.status === "string" ? body.status : "unknown",
    currency: typeof body.currency === "string" ? body.currency : "USD",
    cash,
    equity,
    lastEquity,
    dailyPnl: Number.isFinite(equity) && Number.isFinite(lastEquity) ? equity - lastEquity : 0,
    unrealizedPnl: Number.isFinite(unrealizedPnl) ? unrealizedPnl : 0,
    buyingPower,
    fetchedAt: new Date().toISOString(),
  };
}
