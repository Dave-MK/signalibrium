/**
 * Broker order submission adapters — server-side only.
 *
 * Supports:
 *   Alpaca  — POST /v2/orders (Bearer token or API key)
 *   OANDA   — POST /v3/accounts/{id}/orders (Bearer token or access token)
 *   Binance — POST /api/v3/order (HMAC-SHA256 signed)
 *   Kraken  — POST /0/private/AddOrder (HMAC-SHA512 signed)
 *
 * NEVER log credentials — all signing happens server-side.
 */

import { createHmac, createHash } from "crypto";
import type { BrokerEnvironment } from "../workspace-types";
import type { StoredBrokerCredential } from "../broker-credentials";

// ─── Common types ─────────────────────────────────────────────────────────────

export type BrokerOrderRequest = {
  /** Normalised symbol as stored on the ticket — brokers receive it mapped below. */
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop";
  quantity: number;
  /** Limit or stop-limit price */
  price?: number;
  /** Stop trigger price (for stop/stop-limit orders) */
  stopPrice?: number;
  timeInForce?: "DAY" | "GTC" | "IOC" | "FOK";
  /** OANDA account ID — required for OANDA orders */
  accountRef?: string | null;
};

export type BrokerOrderResult = {
  orderId: string;
  /** High-level status — maps the broker-specific state to a common value */
  status: "submitted" | "filled" | "working" | "pending";
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  filledQuantity?: number;
  filledPrice?: number;
  submittedAt: string;
};

// ─── Alpaca ───────────────────────────────────────────────────────────────────

function alpacaBase(environment: BrokerEnvironment) {
  return environment === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";
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
  throw new Error("Alpaca credential missing: needs accessToken or apiKey+apiSecret.");
}

const ALPACA_TIF: Record<string, string> = {
  DAY: "day", GTC: "gtc", IOC: "ioc", FOK: "fok",
};

const ALPACA_ORDER_TYPE: Record<BrokerOrderRequest["type"], string> = {
  market: "market",
  limit:  "limit",
  stop:   "stop",
};

function alpacaOrderStatus(raw: string): BrokerOrderResult["status"] {
  if (raw === "filled") return "filled";
  if (raw === "new" || raw === "accepted") return "submitted";
  if (raw === "partially_filled" || raw === "held") return "working";
  return "pending";
}

export async function submitAlpacaOrder(
  request: BrokerOrderRequest,
  credential: StoredBrokerCredential,
  environment: BrokerEnvironment,
): Promise<BrokerOrderResult> {
  const tif = ALPACA_TIF[request.timeInForce ?? "DAY"] ?? "day";

  const body: Record<string, unknown> = {
    symbol:         request.symbol.toUpperCase().replace("/", ""),
    qty:            String(request.quantity),
    side:           request.side,
    type:           ALPACA_ORDER_TYPE[request.type],
    time_in_force:  tif,
  };
  if (request.type === "limit" && request.price != null) {
    body.limit_price = String(request.price);
  }
  if ((request.type === "stop") && request.price != null) {
    body.stop_price = String(request.price);
  }

  const res = await fetch(`${alpacaBase(environment)}/v2/orders`, {
    method:  "POST",
    headers: { ...alpacaAuthHeaders(credential), "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    cache:   "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(
      typeof err.message === "string" ? err.message : `Alpaca order failed: ${res.status}`,
    );
  }

  const data = await res.json() as Record<string, unknown>;
  const filledQty = parseFloat(String(data.filled_qty ?? "0"));
  const filledAvg = data.filled_avg_price != null
    ? parseFloat(String(data.filled_avg_price))
    : undefined;

  return {
    orderId:       String(data.id ?? ""),
    status:        alpacaOrderStatus(String(data.status ?? "")),
    symbol:        request.symbol,
    side:          request.side,
    quantity:      request.quantity,
    filledQuantity: Number.isFinite(filledQty) && filledQty > 0 ? filledQty : undefined,
    filledPrice:   filledAvg != null && Number.isFinite(filledAvg) ? filledAvg : undefined,
    submittedAt:   new Date().toISOString(),
  };
}

// ─── OANDA ────────────────────────────────────────────────────────────────────

function oandaBase(environment: BrokerEnvironment) {
  return environment === "live"
    ? "https://api-trade.oanda.com"
    : "https://api-fxpractice.oanda.com";
}

function oandaBearer(credential: StoredBrokerCredential): string {
  if (credential.accessToken) return credential.accessToken;
  if (credential.apiKey) return credential.apiKey;
  throw new Error("OANDA credential missing: needs accessToken or apiKey.");
}

/** Map a generic symbol like "EURUSD" or "EUR/USD" to OANDA's "EUR_USD" format */
function toOandaInstrument(symbol: string): string {
  // If it already has underscores, use as-is
  if (symbol.includes("_")) return symbol.toUpperCase();
  // Strip slashes then insert underscore at the 3-char boundary
  const cleaned = symbol.toUpperCase().replace("/", "");
  if (cleaned.length === 6) return `${cleaned.slice(0, 3)}_${cleaned.slice(3)}`;
  return cleaned;
}

const OANDA_TIF: Record<string, string> = {
  DAY: "GFD", GTC: "GTC", IOC: "IOC", FOK: "FOK",
};

function oandaOrderStatus(raw: string): BrokerOrderResult["status"] {
  if (raw === "FILLED") return "filled";
  if (raw === "PENDING") return "pending";
  if (raw === "TRIGGERED") return "working";
  return "submitted";
}

export async function submitOandaOrder(
  request: BrokerOrderRequest,
  credential: StoredBrokerCredential,
  environment: BrokerEnvironment,
): Promise<BrokerOrderResult> {
  const accountId = request.accountRef;
  if (!accountId) throw new Error("OANDA order requires an accountRef (account ID).");

  const instrument = toOandaInstrument(request.symbol);
  // OANDA uses signed units: positive = buy, negative = sell
  const units = String(request.side === "buy" ? request.quantity : -request.quantity);
  const tif   = OANDA_TIF[request.timeInForce ?? "FOK"] ?? "FOK";

  let orderSpec: Record<string, unknown>;

  if (request.type === "market") {
    orderSpec = { type: "MARKET", instrument, units, timeInForce: "FOK" };
  } else if (request.type === "limit") {
    orderSpec = {
      type:        "LIMIT",
      instrument,
      units,
      price:       String(request.price ?? 0),
      timeInForce: tif === "FOK" ? "GTC" : tif,
    };
  } else {
    // stop
    orderSpec = {
      type:        "STOP",
      instrument,
      units,
      price:       String(request.price ?? request.stopPrice ?? 0),
      timeInForce: tif === "FOK" ? "GTC" : tif,
    };
  }

  const res = await fetch(
    `${oandaBase(environment)}/v3/accounts/${accountId}/orders`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${oandaBearer(credential)}`,
        "Content-Type": "application/json",
      },
      body:  JSON.stringify({ order: orderSpec }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = typeof err.errorMessage === "string" ? err.errorMessage : `OANDA order failed: ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json() as Record<string, unknown>;

  // OANDA returns either orderFillTransaction (immediate fill) or orderCreateTransaction (working)
  const fill   = data.orderFillTransaction as Record<string, unknown> | undefined;
  const create = data.orderCreateTransaction as Record<string, unknown> | undefined;

  const txn    = fill ?? create ?? {};
  const txnId  = String(txn.id ?? txn.orderID ?? "");
  const status = fill ? "filled" : oandaOrderStatus(String(txn.type ?? ""));
  const filledPrice = fill?.price != null ? parseFloat(String(fill.price)) : undefined;
  const filledQty   = fill?.units != null ? Math.abs(parseFloat(String(fill.units))) : undefined;

  return {
    orderId:        txnId,
    status,
    symbol:         request.symbol,
    side:           request.side,
    quantity:       request.quantity,
    filledQuantity: filledQty != null && Number.isFinite(filledQty) ? filledQty : undefined,
    filledPrice:    filledPrice != null && Number.isFinite(filledPrice) ? filledPrice : undefined,
    submittedAt:    new Date().toISOString(),
  };
}

// ─── Binance ──────────────────────────────────────────────────────────────────

function binanceSign(params: string, secret: string): string {
  return createHmac("sha256", secret).update(params).digest("hex");
}

const BINANCE_SIDE: Record<BrokerOrderRequest["side"], string> = {
  buy: "BUY", sell: "SELL",
};

const BINANCE_TYPE: Record<BrokerOrderRequest["type"], string> = {
  market: "MARKET",
  limit:  "LIMIT",
  stop:   "STOP_LOSS_LIMIT",
};

const BINANCE_TIF: Record<string, string> = {
  DAY: "DAY", GTC: "GTC", IOC: "IOC", FOK: "FOK",
};

function binanceOrderStatus(raw: string): BrokerOrderResult["status"] {
  if (raw === "FILLED") return "filled";
  if (raw === "NEW") return "submitted";
  if (raw === "PARTIALLY_FILLED") return "working";
  if (raw === "PENDING_NEW") return "pending";
  return "submitted";
}

export async function submitBinanceOrder(
  request: BrokerOrderRequest,
  credential: StoredBrokerCredential,
): Promise<BrokerOrderResult> {
  const { apiKey, apiSecret } = credential;
  if (!apiKey || !apiSecret) throw new Error("Binance requires API Key and Secret Key.");

  const symbol = request.symbol.toUpperCase().replace("/", "");
  const tif    = BINANCE_TIF[request.timeInForce ?? "GTC"] ?? "GTC";

  const params: Record<string, string> = {
    symbol,
    side:      BINANCE_SIDE[request.side],
    type:      BINANCE_TYPE[request.type],
    quantity:  String(request.quantity),
    timestamp: String(Date.now()),
  };

  if (request.type === "limit") {
    params.timeInForce = tif;
    params.price       = String(request.price ?? 0);
  }
  if (request.type === "stop") {
    params.timeInForce = tif;
    params.price       = String(request.price ?? request.stopPrice ?? 0);
    params.stopPrice   = String(request.stopPrice ?? request.price ?? 0);
  }

  const qs        = new URLSearchParams(params).toString();
  const signature = binanceSign(qs, apiSecret);
  const body      = `${qs}&signature=${signature}`;

  const res = await fetch("https://api.binance.com/api/v3/order", {
    method:  "POST",
    headers: {
      "X-MBX-APIKEY":  apiKey,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof err.msg === "string" ? err.msg : `Binance order failed: ${res.status}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const filledQty = parseFloat(String(data.executedQty ?? "0"));
  const cummQty   = parseFloat(String(data.cummulativeQuoteQty ?? "0"));
  const filledAvg = filledQty > 0 && Number.isFinite(cummQty) ? cummQty / filledQty : undefined;

  return {
    orderId:        String(data.orderId ?? ""),
    status:         binanceOrderStatus(String(data.status ?? "")),
    symbol:         request.symbol,
    side:           request.side,
    quantity:       request.quantity,
    filledQuantity: Number.isFinite(filledQty) && filledQty > 0 ? filledQty : undefined,
    filledPrice:    filledAvg != null && Number.isFinite(filledAvg) ? filledAvg : undefined,
    submittedAt:    new Date().toISOString(),
  };
}

// ─── Kraken ───────────────────────────────────────────────────────────────────

function krakenSign(path: string, data: string, nonce: string, secret: string): string {
  const msgHash = createHash("sha256").update(nonce + data).digest("binary");
  return createHmac("sha512", Buffer.from(secret, "base64"))
    .update(path + msgHash, "binary")
    .digest("base64");
}

const KRAKEN_ORDER_TYPE: Record<BrokerOrderRequest["type"], string> = {
  market: "market",
  limit:  "limit",
  stop:   "stop-loss",
};

function krakenOrderStatus(raw: string): BrokerOrderResult["status"] {
  if (raw === "closed" || raw === "filled") return "filled";
  if (raw === "open") return "working";
  if (raw === "pending") return "pending";
  return "submitted";
}

export async function submitKrakenOrder(
  request: BrokerOrderRequest,
  credential: StoredBrokerCredential,
): Promise<BrokerOrderResult> {
  const { apiKey, apiSecret } = credential;
  if (!apiKey || !apiSecret) throw new Error("Kraken requires API Key and Private Key.");

  const path   = "/0/private/AddOrder";
  const nonce  = String(Date.now());

  const params: Record<string, string> = {
    nonce,
    ordertype: KRAKEN_ORDER_TYPE[request.type],
    type:      request.side,
    volume:    String(request.quantity),
    pair:      request.symbol.toUpperCase().replace("/", ""),
  };

  if (request.type !== "market" && request.price != null) {
    params.price = String(request.price);
  }
  if (request.timeInForce === "GTC") params.timeinforce = "GTC";
  if (request.timeInForce === "IOC") params.timeinforce = "IOC";

  const body      = new URLSearchParams(params).toString();
  const signature = krakenSign(path, body, nonce, apiSecret);

  const res = await fetch(`https://api.kraken.com${path}`, {
    method:  "POST",
    headers: {
      "API-Key":      apiKey,
      "API-Sign":     signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Kraken order failed: ${res.status}`);
  }

  const data = await res.json() as Record<string, unknown>;
  if (Array.isArray(data.error) && data.error.length > 0) {
    throw new Error(String(data.error[0]));
  }

  const result = (data.result ?? {}) as Record<string, unknown>;
  const txids  = Array.isArray(result.txid) ? result.txid : [];
  const txid   = txids.length > 0 ? String(txids[0]) : "";

  return {
    orderId:    txid,
    status:     "submitted",
    symbol:     request.symbol,
    side:       request.side,
    quantity:   request.quantity,
    submittedAt: new Date().toISOString(),
  };
}
