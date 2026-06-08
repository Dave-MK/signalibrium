/**
 * Binance broker adapter.
 *
 * Endpoint: https://api.binance.com (SPOT)
 *
 * Auth: HMAC-SHA256 signed requests
 *   Header:  X-MBX-APIKEY: {apiKey}
 *   Param:   signature=HMAC-SHA256(queryString, apiSecret)
 *   Param:   timestamp={ms since epoch}
 *
 * Account endpoint: GET /api/v3/account?timestamp=...&signature=...
 * Returns SPOT account with per-asset free/locked balances.
 *
 * Binance does not have an OAuth flow for third-party apps — API keys
 * are generated in the user's Binance account settings.
 */

import { createHmac } from "crypto";
import type { StoredBrokerCredential } from "../broker-credentials";

export type BinanceAccountData = {
  provider: "Binance";
  accountType: string;        // "SPOT", "MARGIN", "FUTURES"
  canTrade: boolean;
  balances: Array<{
    asset: string;
    free: number;
    locked: number;
    total: number;
  }>;
  /** USDT (or BUSD/FDUSD) free balance — used as the "cash" display. */
  usdtBalance: number;
  /** Total count of assets with non-zero balance. */
  assetCount: number;
  currency: "USDT";
  fetchedAt: string;
};

const BASE = "https://api.binance.com";

/** Stable coin symbols we treat as USD-equivalent for display */
const STABLE_COINS = new Set(["USDT", "BUSD", "FDUSD", "USDC", "TUSD"]);

function sign(queryString: string, secret: string): string {
  return createHmac("sha256", secret).update(queryString).digest("hex");
}

function binanceHeaders(apiKey: string): Record<string, string> {
  return { "X-MBX-APIKEY": apiKey };
}

async function signedGet(path: string, credential: StoredBrokerCredential): Promise<Response> {
  const apiKey = credential.apiKey;
  const secret = credential.apiSecret;
  if (!apiKey || !secret) {
    throw new Error("Binance requires both API Key and Secret Key.");
  }
  const timestamp = Date.now();
  const qs = `timestamp=${timestamp}`;
  const signature = sign(qs, secret);
  return fetch(`${BASE}${path}?${qs}&signature=${signature}`, {
    headers: binanceHeaders(apiKey),
    cache: "no-store",
  });
}

export async function verifyBinanceCredentials(
  credential: StoredBrokerCredential,
): Promise<{ valid: boolean; accountRef: string | null; error?: string }> {
  try {
    const res = await signedGet("/api/v3/account", credential);
    if (res.status === 401 || res.status === 403) {
      return { valid: false, accountRef: null, error: "Invalid API credentials." };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = typeof body.msg === "string" ? body.msg : `Binance returned ${res.status}.`;
      return { valid: false, accountRef: null, error: msg };
    }
    const body = await res.json() as Record<string, unknown>;
    const accountType = typeof body.accountType === "string" ? body.accountType : "SPOT";
    return { valid: true, accountRef: accountType };
  } catch (err) {
    return {
      valid: false,
      accountRef: null,
      error: err instanceof Error ? err.message : "Failed to reach Binance.",
    };
  }
}

export async function fetchBinanceAccount(
  credential: StoredBrokerCredential,
): Promise<BinanceAccountData> {
  const res = await signedGet("/api/v3/account", credential);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(
      typeof body.msg === "string" ? body.msg : `Binance account fetch failed: ${res.status}`,
    );
  }

  const body = await res.json() as Record<string, unknown>;
  const rawBalances = Array.isArray(body.balances) ? body.balances : [];

  const balances = (rawBalances as Array<Record<string, unknown>>)
    .map((b) => {
      const free   = parseFloat(String(b.free   ?? "0"));
      const locked = parseFloat(String(b.locked ?? "0"));
      return {
        asset:  typeof b.asset === "string" ? b.asset : "",
        free:   Number.isFinite(free)   ? free   : 0,
        locked: Number.isFinite(locked) ? locked : 0,
        total:  Number.isFinite(free + locked) ? free + locked : 0,
      };
    })
    .filter((b) => b.total > 0 && b.asset.length > 0)
    .sort((a, b) => {
      // Sort: stable coins first, then by total descending
      const aStable = STABLE_COINS.has(a.asset) ? 1 : 0;
      const bStable = STABLE_COINS.has(b.asset) ? 1 : 0;
      if (bStable !== aStable) return bStable - aStable;
      return b.total - a.total;
    });

  // Sum of all stable-coin balances as USDT-equivalent display value
  const usdtBalance = balances
    .filter((b) => STABLE_COINS.has(b.asset))
    .reduce((sum, b) => sum + b.free, 0);

  return {
    provider: "Binance",
    accountType: typeof body.accountType === "string" ? body.accountType : "SPOT",
    canTrade: Boolean(body.canTrade),
    balances,
    usdtBalance,
    assetCount: balances.length,
    currency: "USDT",
    fetchedAt: new Date().toISOString(),
  };
}
