/**
 * Broker order status polling — server-side only.
 *
 * Fetches the current status of a submitted order from the broker.
 * Used by the broker-fills cron to update ticket statuses.
 */

import { createHash, createHmac } from "crypto";
import type { BrokerEnvironment } from "../workspace-types";
import type { StoredBrokerCredential } from "../broker-credentials";
import type { BrokerOrderResult } from "./orders";

export type OrderStatusResult = Pick<
  BrokerOrderResult,
  "orderId" | "status" | "symbol" | "side" | "quantity" | "filledQuantity" | "filledPrice"
>;

// ─── Alpaca ───────────────────────────────────────────────────────────────────

function alpacaBase(env: BrokerEnvironment) {
  return env === "live" ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
}

function alpacaAuthHeaders(
  cred: Pick<StoredBrokerCredential, "accessToken" | "apiKey" | "apiSecret">,
): Record<string, string> {
  if (cred.accessToken) return { Authorization: `Bearer ${cred.accessToken}` };
  if (cred.apiKey && cred.apiSecret)
    return { "APCA-API-KEY-ID": cred.apiKey, "APCA-API-SECRET-KEY": cred.apiSecret };
  throw new Error("Alpaca credential missing.");
}

function alpacaStatus(raw: string): BrokerOrderResult["status"] {
  if (raw === "filled") return "filled";
  if (raw === "new" || raw === "accepted") return "submitted";
  if (raw === "partially_filled" || raw === "held") return "working";
  return "pending";
}

export async function fetchAlpacaOrderStatus(
  orderId: string,
  credential: StoredBrokerCredential,
  environment: BrokerEnvironment,
): Promise<OrderStatusResult> {
  const res = await fetch(`${alpacaBase(environment)}/v2/orders/${orderId}`, {
    headers: alpacaAuthHeaders(credential),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Alpaca order status failed: ${res.status}`);
  const d = await res.json() as Record<string, unknown>;
  const filledQty = parseFloat(String(d.filled_qty ?? "0"));
  const filledAvg = d.filled_avg_price != null ? parseFloat(String(d.filled_avg_price)) : undefined;
  return {
    orderId,
    status: alpacaStatus(String(d.status ?? "")),
    symbol: String(d.symbol ?? ""),
    side: String(d.side ?? "") === "sell" ? "sell" : "buy",
    quantity: parseFloat(String(d.qty ?? "0")),
    filledQuantity: filledQty > 0 ? filledQty : undefined,
    filledPrice: filledAvg != null && Number.isFinite(filledAvg) ? filledAvg : undefined,
  };
}

// ─── OANDA ────────────────────────────────────────────────────────────────────

function oandaBase(env: BrokerEnvironment) {
  return env === "live" ? "https://api-trade.oanda.com" : "https://api-fxpractice.oanda.com";
}

export async function fetchOandaOrderStatus(
  orderId: string,
  credential: StoredBrokerCredential,
  environment: BrokerEnvironment,
  accountRef: string | null,
): Promise<OrderStatusResult> {
  if (!accountRef) throw new Error("OANDA order status requires accountRef.");
  const bearer = credential.accessToken ?? credential.apiKey ?? "";
  const res = await fetch(
    `${oandaBase(environment)}/v3/accounts/${accountRef}/orders/${orderId}`,
    {
      headers: { Authorization: `Bearer ${bearer}` },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`OANDA order status failed: ${res.status}`);
  const d = await res.json() as Record<string, unknown>;
  const order = (d.order ?? {}) as Record<string, unknown>;
  const state = String(order.state ?? "");
  const status: BrokerOrderResult["status"] =
    state === "FILLED" ? "filled" : state === "PENDING" ? "pending" : "submitted";
  const units = parseFloat(String(order.units ?? "0"));
  return {
    orderId,
    status,
    symbol: String(order.instrument ?? ""),
    side: units >= 0 ? "buy" : "sell",
    quantity: Math.abs(units),
    filledQuantity: undefined,
    filledPrice: undefined,
  };
}

// ─── Binance ──────────────────────────────────────────────────────────────────

function binanceStatus(raw: string): BrokerOrderResult["status"] {
  if (raw === "FILLED") return "filled";
  if (raw === "NEW") return "submitted";
  if (raw === "PARTIALLY_FILLED") return "working";
  return "pending";
}

export async function fetchBinanceOrderStatus(
  orderId: string,
  symbol: string,
  credential: StoredBrokerCredential,
): Promise<OrderStatusResult> {
  const { apiKey, apiSecret } = credential;
  if (!apiKey || !apiSecret) throw new Error("Binance requires API Key and Secret Key.");

  const normalizedSymbol = symbol.toUpperCase().replace("/", "");
  const timestamp = String(Date.now());
  const params = `symbol=${normalizedSymbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = createHmac("sha256", apiSecret).update(params).digest("hex");

  const res = await fetch(
    `https://api.binance.com/api/v3/order?${params}&signature=${signature}`,
    { headers: { "X-MBX-APIKEY": apiKey }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Binance order status failed: ${res.status}`);
  const d = await res.json() as Record<string, unknown>;
  const filledQty = parseFloat(String(d.executedQty ?? "0"));
  const cummQty   = parseFloat(String(d.cummulativeQuoteQty ?? "0"));
  const filledAvg = filledQty > 0 && Number.isFinite(cummQty) ? cummQty / filledQty : undefined;
  return {
    orderId,
    status: binanceStatus(String(d.status ?? "")),
    symbol,
    side: String(d.side ?? "").toLowerCase() === "sell" ? "sell" : "buy",
    quantity: parseFloat(String(d.origQty ?? "0")),
    filledQuantity: filledQty > 0 ? filledQty : undefined,
    filledPrice: filledAvg != null && Number.isFinite(filledAvg) ? filledAvg : undefined,
  };
}

// ─── Kraken ───────────────────────────────────────────────────────────────────

function krakenSign(path: string, data: string, nonce: string, secret: string): string {
  const msgHash = createHash("sha256").update(nonce + data).digest("binary");
  return createHmac("sha512", Buffer.from(secret, "base64"))
    .update(path + msgHash, "binary")
    .digest("base64");
}

export async function fetchKrakenOrderStatus(
  orderId: string,
  credential: StoredBrokerCredential,
): Promise<OrderStatusResult> {
  const { apiKey, apiSecret } = credential;
  if (!apiKey || !apiSecret) throw new Error("Kraken requires API Key and Private Key.");

  const path  = "/0/private/QueryOrders";
  const nonce = String(Date.now());
  const body  = new URLSearchParams({ nonce, txid: orderId }).toString();
  const sig   = krakenSign(path, body, nonce, apiSecret);

  const res = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": sig,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kraken order status failed: ${res.status}`);
  const d = await res.json() as Record<string, unknown>;
  const result = ((d.result ?? {}) as Record<string, unknown>)[orderId] as Record<string, unknown> | undefined;
  if (!result) throw new Error(`Kraken: order ${orderId} not found.`);

  const st = String(result.status ?? "");
  const status: BrokerOrderResult["status"] =
    st === "closed" ? "filled" : st === "open" ? "working" : "submitted";
  const vol    = parseFloat(String(result.vol ?? "0"));
  const volExec = parseFloat(String(result.vol_exec ?? "0"));
  const price  = parseFloat(String(result.price ?? "0"));
  return {
    orderId,
    status,
    symbol: String(result.descr ? (result.descr as Record<string,unknown>).pair ?? "" : ""),
    side: String(result.descr ? (result.descr as Record<string,unknown>).type ?? "buy" : "buy") === "sell" ? "sell" : "buy",
    quantity: vol,
    filledQuantity: volExec > 0 ? volExec : undefined,
    filledPrice: price > 0 ? price : undefined,
  };
}
