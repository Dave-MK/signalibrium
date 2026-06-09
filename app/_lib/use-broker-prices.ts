"use client";

import { useEffect, useRef, useState } from "react";
import type { BrokerProvider } from "./server/workspace-types";

/**
 * Live price map: symbol → last price (e.g. "BTC/USDT" → 68250.10)
 */
export type PriceMap = Record<string, number>;

type Options = {
  /** Symbols to subscribe to, e.g. ["BTC/USDT", "ETH/USDT"] */
  symbols: string[];
  enabled?: boolean;
};

// ─── Binance public WebSocket ─────────────────────────────────────────────────

function binanceStreamName(symbol: string) {
  // "BTC/USDT" → "btcusdt@ticker"
  return `${symbol.toLowerCase().replace("/", "")}@ticker`;
}

function useBinancePrices({ symbols, enabled = true }: Options): PriceMap {
  const [prices, setPrices] = useState<PriceMap>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;

    const streams = symbols.map(binanceStreamName).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    let ws: WebSocket;
    let closed = false;

    function connect() {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
          const data = (msg.data ?? msg) as Record<string, unknown>;
          if (typeof data.c === "string") {
            // "c" = last price in Binance ticker stream
            const streamName = String(msg.stream ?? "");
            const symbolRaw  = streamName.split("@")[0].toUpperCase();
            // Re-insert "/" at position 3 from end to normalise back (BTCUSDT → BTC/USDT)
            const base  = symbolRaw.slice(0, -4);
            const quote = symbolRaw.slice(-4);
            const normalised = `${base}/${quote}`;
            const price = parseFloat(data.c as string);
            if (Number.isFinite(price) && price > 0) {
              setPrices((prev) => ({ ...prev, [normalised]: price }));
            }
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        if (!closed) {
          // Reconnect after 3s on unexpected close
          setTimeout(() => { if (!closed) connect(); }, 3_000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(","), enabled]);

  return prices;
}

// ─── Kraken public WebSocket ──────────────────────────────────────────────────

function toKrakenPair(symbol: string): string {
  // "BTC/USD" → "XBT/USD", "ETH/USD" → "ETH/USD"
  return symbol.replace("BTC/", "XBT/");
}

function fromKrakenPair(pair: string): string {
  return pair.replace("XBT/", "BTC/");
}

function useKrakenPrices({ symbols, enabled = true }: Options): PriceMap {
  const [prices, setPrices] = useState<PriceMap>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;

    let ws: WebSocket;
    let closed = false;

    function connect() {
      ws = new WebSocket("wss://ws.kraken.com");
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          event:       "subscribe",
          pair:        symbols.map(toKrakenPair),
          subscription: { name: "ticker" },
        }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as unknown;
          // Kraken ticker: [channelId, {c: [price, ...]}, "ticker", "XBT/USD"]
          if (Array.isArray(msg) && msg.length === 4) {
            const ticker = msg[1] as Record<string, unknown>;
            const pair   = String(msg[3]);
            const lastArr = ticker.c as [string] | undefined;
            if (Array.isArray(lastArr) && lastArr.length > 0) {
              const price = parseFloat(lastArr[0]);
              if (Number.isFinite(price) && price > 0) {
                setPrices((prev) => ({ ...prev, [fromKrakenPair(pair)]: price }));
              }
            }
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!closed) setTimeout(() => { if (!closed) connect(); }, 3_000);
      };
    }

    connect();

    return () => {
      closed = true;
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(","), enabled]);

  return prices;
}

// ─── Polling fallback (Alpaca / OANDA) ───────────────────────────────────────
// These brokers don't have public browser-accessible WebSocket streams.
// We poll the positions endpoint to get updated current prices.

function usePollingPrices({ symbols: _symbols, enabled: _enabled = true }: Options): PriceMap {
  // Prices come from the positions hook for these brokers — nothing to do here.
  return {};
}

// ─── Unified hook ─────────────────────────────────────────────────────────────

type UseBrokerPricesOptions = Options & {
  provider: BrokerProvider | null;
};

/**
 * Returns a live price map for the given symbols.
 *
 * - Binance / Kraken: native public WebSocket streams (no credentials needed)
 * - Alpaca / OANDA:   no-op (prices come from the positions polling endpoint)
 *
 * Prices update whenever the WebSocket delivers a new tick.
 */
export function useBrokerPrices({
  provider,
  symbols,
  enabled = true,
}: UseBrokerPricesOptions): PriceMap {
  const binancePrices = useBinancePrices({
    symbols,
    enabled: enabled && provider === "Binance",
  });
  const krakenPrices = useKrakenPrices({
    symbols,
    enabled: enabled && provider === "Kraken",
  });
  const pollingPrices = usePollingPrices({
    symbols,
    enabled: enabled && (provider === "Alpaca" || provider === "OANDA"),
  });

  if (provider === "Binance") return binancePrices;
  if (provider === "Kraken")  return krakenPrices;
  return pollingPrices;
}
