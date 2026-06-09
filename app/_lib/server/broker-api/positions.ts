/**
 * Broker positions / open-holdings adapters — server-side only.
 *
 * Supported brokers:
 *   Alpaca  — GET /v2/positions (long/short equity positions)
 *   OANDA   — GET /v3/accounts/{id}/openTrades (open forex trades)
 *   Binance — non-zero spot balances treated as positions
 *   Kraken  — non-zero spot balances + POST /0/private/OpenPositions (margin)
 */

import { createHmac, createHash } from "crypto";
import type { BrokerEnvironment } from "../workspace-types";
import type { StoredBrokerCredential } from "../broker-credentials";

// ─── Common types ─────────────────────────────────────────────────────────────

export type BrokerPosition = {
  /** Broker-specific position/trade ID */
  id: string;
  /** Display symbol (normalised) */
  symbol: string;
  side: "long" | "short";
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  marketValue: number;
  currency: string;
};

export type BrokerPositionsResult = {
  provider: "Alpaca" | "OANDA" | "Binance" | "Kraken";
  positions: BrokerPosition[];
  fetchedAt: string;
};

// ─── Alpaca ───────────────────────────────────────────────────────────────────

function alpacaBase(env: BrokerEnvironment) {
  return env === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
}

function alpacaAuthHeaders(
  credential: Pick<StoredBrokerCredential, "accessToken" | "apiKey" | "apiSecret">,
): Record<string, string> {
  if (credential.accessToken) return { Authorization: `Bearer ${credential.accessToken}` };
  if (credential.apiKey && credential.apiSecret) {
    return {
      "APCA-API-KEY-ID": credential.apiKey,
      "APCA-API-SECRET-KEY": credential.apiSecret,
    };
  }
  throw new Error("Alpaca credential missing.");
}

export async function fetchAlpacaPositions(
  credential: StoredBrokerCredential,
  environment: BrokerEnvironment,
): Promise<BrokerPositionsResult> {
  const res = await fetch(`${alpacaBase(environment)}/v2/positions`, {
    headers: alpacaAuthHeaders(credential),
    cache:   "no-store",
  });

  if (!res.ok) throw new Error(`Alpaca positions fetch failed: ${res.status}`);

  const raw = await res.json() as Array<Record<string, unknown>>;
  if (!Array.isArray(raw)) throw new Error("Unexpected Alpaca positions response.");

  const positions: BrokerPosition[] = raw.map((p) => {
    const qty        = parseFloat(String(p.qty ?? "0"));
    const entry      = parseFloat(String(p.avg_entry_price ?? "0"));
    const current    = parseFloat(String(p.current_price ?? entry));
    const uPnl       = parseFloat(String(p.unrealized_pl ?? "0"));
    const uPnlPct    = parseFloat(String(p.unrealized_plpc ?? "0"));
    const mktVal     = parseFloat(String(p.market_value ?? "0"));

    return {
      id:               String(p.asset_id ?? p.symbol ?? ""),
      symbol:           String(p.symbol ?? ""),
      side:             String(p.side ?? "long") === "short" ? "short" : "long",
      quantity:         Math.abs(Number.isFinite(qty) ? qty : 0),
      avgEntryPrice:    Number.isFinite(entry) ? entry : 0,
      currentPrice:     Number.isFinite(current) ? current : 0,
      unrealizedPnl:    Number.isFinite(uPnl) ? uPnl : 0,
      unrealizedPnlPct: Number.isFinite(uPnlPct) ? uPnlPct * 100 : 0,
      marketValue:      Number.isFinite(mktVal) ? mktVal : 0,
      currency:         String(p.currency ?? "USD"),
    };
  });

  return { provider: "Alpaca", positions, fetchedAt: new Date().toISOString() };
}

// ─── OANDA ────────────────────────────────────────────────────────────────────

function oandaBase(env: BrokerEnvironment) {
  return env === "live" ? "https://api-trade.oanda.com" : "https://api-fxpractice.oanda.com";
}

function oandaBearer(credential: StoredBrokerCredential): string {
  if (credential.accessToken) return credential.accessToken;
  if (credential.apiKey) return credential.apiKey;
  throw new Error("OANDA credential missing.");
}

/** Format OANDA instrument "EUR_USD" → "EUR/USD" for display */
function fromOandaInstrument(inst: string): string {
  return inst.replace("_", "/");
}

export async function fetchOandaPositions(
  credential: StoredBrokerCredential,
  environment: BrokerEnvironment,
  accountRef: string,
): Promise<BrokerPositionsResult> {
  const res = await fetch(
    `${oandaBase(environment)}/v3/accounts/${accountRef}/openTrades`,
    {
      headers: { Authorization: `Bearer ${oandaBearer(credential)}` },
      cache:   "no-store",
    },
  );

  if (!res.ok) throw new Error(`OANDA open trades fetch failed: ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const trades = Array.isArray(data.trades) ? data.trades as Array<Record<string, unknown>> : [];

  const positions: BrokerPosition[] = trades.map((t, i) => {
    const units  = parseFloat(String(t.currentUnits ?? t.initialUnits ?? "0"));
    const entry  = parseFloat(String(t.price ?? "0"));
    const uPnl   = parseFloat(String(t.unrealizedPL ?? "0"));
    const side: "long" | "short" = units > 0 ? "long" : "short";
    const qty    = Math.abs(units);
    const instrument = String(t.instrument ?? "");

    return {
      id:               String(t.id ?? String(i)),
      symbol:           fromOandaInstrument(instrument),
      side,
      quantity:         Number.isFinite(qty) ? qty : 0,
      avgEntryPrice:    Number.isFinite(entry) ? entry : 0,
      currentPrice:     Number.isFinite(entry) ? entry : 0,    // will be updated by price stream
      unrealizedPnl:    Number.isFinite(uPnl) ? uPnl : 0,
      unrealizedPnlPct: qty > 0 && entry > 0 && Number.isFinite(uPnl)
        ? (uPnl / (qty * entry)) * 100
        : 0,
      marketValue: Number.isFinite(qty) && Number.isFinite(entry) ? qty * entry : 0,
      currency:    "USD",
    };
  });

  return { provider: "OANDA", positions, fetchedAt: new Date().toISOString() };
}

// ─── Binance (SPOT) ───────────────────────────────────────────────────────────

function binanceSign(params: string, secret: string): string {
  return createHmac("sha256", secret).update(params).digest("hex");
}

/** Stable coins we don't treat as "positions" */
const STABLE_COINS = new Set(["USDT", "BUSD", "FDUSD", "USDC", "TUSD"]);

export async function fetchBinancePositions(
  credential: StoredBrokerCredential,
): Promise<BrokerPositionsResult> {
  const { apiKey, apiSecret } = credential;
  if (!apiKey || !apiSecret) throw new Error("Binance requires API Key and Secret Key.");

  const timestamp = Date.now();
  const qs        = `timestamp=${timestamp}`;
  const signature = binanceSign(qs, apiSecret);

  const res = await fetch(`https://api.binance.com/api/v3/account?${qs}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
    cache:   "no-store",
  });

  if (!res.ok) throw new Error(`Binance account fetch failed: ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const rawBalances = Array.isArray(data.balances) ? data.balances as Array<Record<string, unknown>> : [];

  const positions: BrokerPosition[] = rawBalances
    .filter((b) => {
      const asset = String(b.asset ?? "");
      const total = parseFloat(String(b.free ?? "0")) + parseFloat(String(b.locked ?? "0"));
      return total > 0 && !STABLE_COINS.has(asset);
    })
    .map((b, i) => {
      const asset  = String(b.asset ?? "");
      const free   = parseFloat(String(b.free   ?? "0"));
      const locked = parseFloat(String(b.locked ?? "0"));
      const total  = (Number.isFinite(free) ? free : 0) + (Number.isFinite(locked) ? locked : 0);

      return {
        id:               `binance-${asset}-${i}`,
        symbol:           `${asset}/USDT`,
        side:             "long" as const,
        quantity:         total,
        avgEntryPrice:    0,     // Binance spot doesn't expose avg entry price via this endpoint
        currentPrice:     0,     // will be updated by price stream
        unrealizedPnl:    0,
        unrealizedPnlPct: 0,
        marketValue:      0,     // will be updated by price stream
        currency:         "USDT",
      };
    });

  return { provider: "Binance", positions, fetchedAt: new Date().toISOString() };
}

// ─── Kraken (SPOT + margin) ───────────────────────────────────────────────────

function krakenSign(path: string, data: string, nonce: string, secret: string): string {
  const msgHash = createHash("sha256").update(nonce + data).digest("binary");
  return createHmac("sha512", Buffer.from(secret, "base64"))
    .update(path + msgHash, "binary")
    .digest("base64");
}

async function krakenPrivatePost(
  path: string,
  params: Record<string, string>,
  credential: StoredBrokerCredential,
): Promise<Response> {
  const { apiKey, apiSecret } = credential;
  if (!apiKey || !apiSecret) throw new Error("Kraken requires API Key and Private Key.");
  const nonce     = String(Date.now());
  const body      = new URLSearchParams({ nonce, ...params }).toString();
  const signature = krakenSign(path, body, nonce, apiSecret);

  return fetch(`https://api.kraken.com${path}`, {
    method:  "POST",
    headers: {
      "API-Key":      apiKey,
      "API-Sign":     signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
}

const KRAKEN_ASSET_MAP: Record<string, string> = {
  XXBT: "BTC", XETH: "ETH", XLTC: "LTC", XXRP: "XRP",
  XXLM: "XLM", XZEC: "ZEC", XICN: "ICN", XMLN: "MLN",
  XREP: "REP", XXMR: "XMR", ZUSD: "USD", ZEUR: "EUR",
  ZGBP: "GBP", ZCAD: "CAD", ZJPY: "JPY", SOL:  "SOL",
  DOT:  "DOT", ADA:  "ADA", MATIC: "MATIC", LINK: "LINK",
  ATOM: "ATOM", AVAX: "AVAX",
};

const FIAT_CODES = new Set(["USD", "EUR", "GBP", "CAD", "JPY", "ZUSD", "ZEUR", "ZGBP"]);

function normaliseKrakenAsset(raw: string): string {
  return KRAKEN_ASSET_MAP[raw] ?? raw;
}

export async function fetchKrakenPositions(
  credential: StoredBrokerCredential,
): Promise<BrokerPositionsResult> {
  // 1. Spot balances (acts as "spot positions")
  const balRes = await krakenPrivatePost("/0/private/Balance", {}, credential);
  if (!balRes.ok) throw new Error(`Kraken balance fetch failed: ${balRes.status}`);

  const balData  = await balRes.json() as Record<string, unknown>;
  if (Array.isArray(balData.error) && balData.error.length > 0) {
    throw new Error(String(balData.error[0]));
  }

  const rawResult = (balData.result ?? {}) as Record<string, unknown>;
  const spotPositions: BrokerPosition[] = [];

  let idx = 0;
  for (const [rawAsset, rawVal] of Object.entries(rawResult)) {
    const qty = parseFloat(String(rawVal));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (FIAT_CODES.has(rawAsset)) continue;   // skip fiat balances

    const asset = normaliseKrakenAsset(rawAsset);
    spotPositions.push({
      id:               `kraken-spot-${rawAsset}-${idx++}`,
      symbol:           `${asset}/USD`,
      side:             "long",
      quantity:         qty,
      avgEntryPrice:    0,
      currentPrice:     0,
      unrealizedPnl:    0,
      unrealizedPnlPct: 0,
      marketValue:      0,
      currency:         "USD",
    });
  }

  // 2. Open margin positions (best-effort — may return empty for spot-only accounts)
  let marginPositions: BrokerPosition[] = [];
  try {
    const posRes = await krakenPrivatePost("/0/private/OpenPositions", { docalcs: "true" }, credential);
    if (posRes.ok) {
      const posData = await posRes.json() as Record<string, unknown>;
      if (!Array.isArray(posData.error) || posData.error.length === 0) {
        const posResult = (posData.result ?? {}) as Record<string, unknown>;
        marginPositions = Object.entries(posResult).map(([txid, p]) => {
          const pos    = p as Record<string, unknown>;
          const vol    = parseFloat(String(pos.vol ?? "0"));
          const closed = parseFloat(String(pos.vol_closed ?? "0"));
          const open   = vol - closed;
          const type   = String(pos.type ?? "buy");
          const cost   = parseFloat(String(pos.cost ?? "0"));
          const value  = parseFloat(String(pos.value ?? cost));
          const net    = parseFloat(String(pos.net ?? "0"));
          const pair   = String(pos.pair ?? "");
          const base   = pair.length >= 3 ? normaliseKrakenAsset(pair.slice(0, pair.length - 3)) : pair;

          return {
            id:               txid,
            symbol:           `${base}/USD`,
            side:             type === "buy" ? "long" : "short",
            quantity:         Number.isFinite(open) ? open : 0,
            avgEntryPrice:    Number.isFinite(cost) && open > 0 ? cost / open : 0,
            currentPrice:     Number.isFinite(value) && open > 0 ? value / open : 0,
            unrealizedPnl:    Number.isFinite(net) ? net : 0,
            unrealizedPnlPct: Number.isFinite(net) && cost > 0 ? (net / cost) * 100 : 0,
            marketValue:      Number.isFinite(value) ? value : 0,
            currency:         "USD",
          } satisfies BrokerPosition;
        }).filter((p) => p.quantity > 0);
      }
    }
  } catch {
    // Margin positions are optional — swallow errors for spot-only accounts
  }

  const positions = [...marginPositions, ...spotPositions];

  return { provider: "Kraken", positions, fetchedAt: new Date().toISOString() };
}
