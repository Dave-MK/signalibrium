/**
 * Kraken broker adapter.
 *
 * Endpoint: https://api.kraken.com
 *
 * Auth: Two-pass HMAC-SHA512 signature
 *   Header: API-Key: {apiKey}
 *   Header: API-Sign: base64(HMAC-SHA512(path + SHA256(nonce + data), base64decode(secret)))
 *
 * Kraken uses their own asset codes:
 *   XXBT = Bitcoin, ZUSD = USD, ZEUR = EUR, XETH = Ethereum, etc.
 *
 * Kraken does not have an OAuth flow for third-party apps — API keys are
 * generated in the user's Kraken account settings (Security → API).
 */

import { createHmac, createHash } from "crypto";
import type { StoredBrokerCredential } from "../broker-credentials";

export type KrakenAccountData = {
  provider: "Kraken";
  /** Raw Kraken asset → balance map (e.g. { XXBT: 0.5, ZUSD: 1000 }) */
  rawBalances: Record<string, number>;
  /** Normalised display balances (BTC, USD, ETH, ...) */
  balances: Array<{ asset: string; total: number }>;
  /** USD/EUR equivalent balance for display (ZUSD → USD, ZEUR → EUR) */
  fiatBalance: number;
  /** Currency code used for fiatBalance */
  currency: "USD" | "EUR" | "GBP";
  fetchedAt: string;
};

const BASE = "https://api.kraken.com";

/** Kraken's own asset codes → friendly display names */
const KRAKEN_ASSET_MAP: Record<string, string> = {
  XXBT: "BTC", XETH: "ETH", XLTC: "LTC", XXRP: "XRP",
  XXLM: "XLM", XZEC: "ZEC", XICN: "ICN", XMLN: "MLN",
  XREP: "REP", XXMR: "XMR", ZUSD: "USD", ZEUR: "EUR",
  ZGBP: "GBP", ZCAD: "CAD", ZJPY: "JPY", SOL: "SOL",
  DOT: "DOT", ADA: "ADA", MATIC: "MATIC", LINK: "LINK",
  ATOM: "ATOM", AVAX: "AVAX",
};

function normaliseKrakenAsset(raw: string): string {
  return KRAKEN_ASSET_MAP[raw] ?? raw;
}

function krakenSign(
  path: string,
  data: string,
  nonce: string,
  secret: string,
): string {
  const msgHash = createHash("sha256")
    .update(nonce + data)
    .digest("binary");
  const hmac = createHmac("sha512", Buffer.from(secret, "base64"))
    .update(path + msgHash, "binary")
    .digest("base64");
  return hmac;
}

async function privatePost(
  path: string,
  data: Record<string, string>,
  credential: StoredBrokerCredential,
): Promise<Response> {
  const apiKey = credential.apiKey;
  const secret = credential.apiSecret;
  if (!apiKey || !secret) {
    throw new Error("Kraken requires both API Key and Private Key.");
  }

  const nonce = String(Date.now());
  const body = new URLSearchParams({ nonce, ...data });
  const signature = krakenSign(path, body.toString(), nonce, secret);

  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "API-Key":    apiKey,
      "API-Sign":   signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });
}

export async function verifyKrakenCredentials(
  credential: StoredBrokerCredential,
): Promise<{ valid: boolean; accountRef: string | null; error?: string }> {
  try {
    const res = await privatePost("/0/private/Balance", {}, credential);
    if (res.status === 401 || res.status === 403) {
      return { valid: false, accountRef: null, error: "Invalid API credentials." };
    }
    if (!res.ok) {
      return { valid: false, accountRef: null, error: `Kraken returned ${res.status}.` };
    }
    const body = await res.json() as Record<string, unknown>;
    if (Array.isArray(body.error) && body.error.length > 0) {
      return { valid: false, accountRef: null, error: String(body.error[0]) };
    }
    return { valid: true, accountRef: "kraken-spot" };
  } catch (err) {
    return {
      valid: false,
      accountRef: null,
      error: err instanceof Error ? err.message : "Failed to reach Kraken.",
    };
  }
}

export async function fetchKrakenAccount(
  credential: StoredBrokerCredential,
): Promise<KrakenAccountData> {
  const res = await privatePost("/0/private/Balance", {}, credential);
  if (!res.ok) {
    throw new Error(`Kraken balance fetch failed: ${res.status}`);
  }

  const body = await res.json() as Record<string, unknown>;
  if (Array.isArray(body.error) && body.error.length > 0) {
    throw new Error(String(body.error[0]));
  }

  const rawResult = (body.result ?? {}) as Record<string, unknown>;
  const rawBalances: Record<string, number> = {};

  for (const [asset, value] of Object.entries(rawResult)) {
    const n = parseFloat(String(value));
    if (Number.isFinite(n) && n > 0) {
      rawBalances[asset] = n;
    }
  }

  // Build display balances with normalised asset names
  const balances = Object.entries(rawBalances)
    .map(([raw, total]) => ({ asset: normaliseKrakenAsset(raw), total }))
    .sort((a, b) => {
      // Fiat first, then crypto by value
      const aFiat = ["USD", "EUR", "GBP"].includes(a.asset) ? 1 : 0;
      const bFiat = ["USD", "EUR", "GBP"].includes(b.asset) ? 1 : 0;
      if (bFiat !== aFiat) return bFiat - aFiat;
      return b.total - a.total;
    });

  // Best fiat display: USD → EUR → GBP → 0
  const usdBalance  = rawBalances["ZUSD"] ?? 0;
  const eurBalance  = rawBalances["ZEUR"] ?? 0;
  const gbpBalance  = rawBalances["ZGBP"] ?? 0;

  let fiatBalance: number;
  let currency: KrakenAccountData["currency"];

  if (usdBalance > 0) {
    fiatBalance = usdBalance;
    currency    = "USD";
  } else if (eurBalance > 0) {
    fiatBalance = eurBalance;
    currency    = "EUR";
  } else if (gbpBalance > 0) {
    fiatBalance = gbpBalance;
    currency    = "GBP";
  } else {
    fiatBalance = 0;
    currency    = "USD";
  }

  return {
    provider: "Kraken",
    rawBalances,
    balances,
    fiatBalance,
    currency,
    fetchedAt: new Date().toISOString(),
  };
}
