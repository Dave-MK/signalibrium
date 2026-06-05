import { roundPriceValue } from "@/app/_lib/market-prices";
import { getMarketDataAssetDefinition } from "./asset-catalog";
import type {
  LiveAssetQuote,
  LiveCandle,
  LiveCandleSeries,
  SupportedChartInterval,
} from "./provider-types";

const restBaseUrl = "https://api.kraken.com/0/public";
const websocketUrl = "wss://ws.kraken.com/v2";
const pairCatalogTtlMs = 10 * 60_000;
const quoteCacheTtlMs = 20_000;
const chartCacheTtlMs = 55_000;
const streamFreshnessMs = 30_000;
const maxStreamPoints = 180;

type KrakenAssetPair = {
  altname?: string;
  wsname?: string;
  base?: string;
  quote?: string;
  status?: string;
};

type KrakenTickerInfo = {
  a?: string[];
  b?: string[];
  c?: string[];
  v?: string[];
  p?: string[];
  t?: number[];
  l?: string[];
  h?: string[];
  o?: string;
};

type KrakenTickerResponse = {
  error?: string[];
  result?: Record<string, KrakenTickerInfo>;
};

type KrakenAssetPairsResponse = {
  error?: string[];
  result?: Record<string, KrakenAssetPair>;
};

type KrakenOhlcResponse = {
  error?: string[];
  result?: Record<string, Array<Array<number | string>> | number>;
};

type KrakenTickerMessage = {
  channel?: string;
  type?: string;
  data?: Array<{
    symbol?: string;
    bid?: number;
    ask?: number;
    last?: number;
    volume?: number;
    low?: number;
    high?: number;
    change_pct?: number;
    timestamp?: string;
  }>;
};

type StreamQuotePoint = {
  at: string;
  price: number;
};

type StreamQuoteSnapshot = {
  price: number;
  bid: number | null;
  ask: number | null;
  volume24h: number | null;
  low24h: number | null;
  high24h: number | null;
  changePct24h: number | null;
  fetchedAt: string;
};

type KrakenStreamState = {
  socket: WebSocket | null;
  isOpen: boolean;
  reconnectTimeoutId: ReturnType<typeof setTimeout> | null;
  subscribedSymbols: Set<string>;
  latestQuotes: Map<string, StreamQuoteSnapshot>;
  priceHistory: Map<string, StreamQuotePoint[]>;
};

type KrakenGlobalState = {
  pairs: Array<{ key: string; pair: KrakenAssetPair }>;
  pairsCachedAt: number;
  pairsPromise: Promise<Array<{ key: string; pair: KrakenAssetPair }>> | null;
  quotes: Map<string, { cachedAt: number; quote: LiveAssetQuote }>;
  charts: Map<string, { cachedAt: number; chart: LiveCandleSeries }>;
  stream: KrakenStreamState;
};

const globalState = (globalThis as typeof globalThis & {
  __signalibriumKrakenState?: KrakenGlobalState;
}).__signalibriumKrakenState ??= {
  pairs: [],
  pairsCachedAt: 0,
  pairsPromise: null,
  quotes: new Map<string, { cachedAt: number; quote: LiveAssetQuote }>(),
  charts: new Map<string, { cachedAt: number; chart: LiveCandleSeries }>(),
  stream: {
    socket: null,
    isOpen: false,
    reconnectTimeoutId: null,
    subscribedSymbols: new Set<string>(),
    latestQuotes: new Map<string, StreamQuoteSnapshot>(),
    priceHistory: new Map<string, StreamQuotePoint[]>(),
  },
};

function buildKrakenError(payload: unknown, fallbackMessage: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    Array.isArray(payload.error) &&
    payload.error.length > 0 &&
    typeof payload.error[0] === "string"
  ) {
    return payload.error[0];
  }

  return fallbackMessage;
}

async function fetchKrakenJson<T>(pathnameWithQuery: string) {
  const response = await fetch(`${restBaseUrl}${pathnameWithQuery}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error(buildKrakenError(payload, `Kraken request failed for ${pathnameWithQuery}.`));
  }

  return payload;
}

async function listKrakenPairs() {
  if (globalState.pairs.length > 0 && Date.now() - globalState.pairsCachedAt < pairCatalogTtlMs) {
    return globalState.pairs;
  }

  if (!globalState.pairsPromise) {
    globalState.pairsPromise = fetchKrakenJson<KrakenAssetPairsResponse>("/AssetPairs")
      .then((payload) => {
        const pairs = Object.entries(payload.result ?? {}).map(([key, pair]) => ({ key, pair }));
        globalState.pairs = pairs;
        globalState.pairsCachedAt = Date.now();
        return pairs;
      })
      .finally(() => {
        globalState.pairsPromise = null;
      });
  }

  return globalState.pairsPromise;
}

function isKrakenPairTradable(pair: KrakenAssetPair) {
  if (!pair.wsname && !pair.altname) {
    return false;
  }

  if (typeof pair.status === "string") {
    return pair.status === "online" || pair.status === "post_only" || pair.status === "limit_only";
  }

  return true;
}

function normalizeKrakenBaseAsset(asset: string) {
  const upperAsset = asset.toUpperCase();

  switch (upperAsset) {
    case "BTC":
      return "XBT";
    default:
      return upperAsset;
  }
}

async function resolveKrakenPair(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No Kraken mapping is configured for ${symbol.toUpperCase()}.`);
  }

  const pairs = await listKrakenPairs();
  const configuredPair =
    definition.krakenPair?.trim() || process.env[`SIGNALIBRIUM_KRAKEN_PAIR_${definition.symbol}`]?.trim();

  if (configuredPair) {
    const exactConfigured = pairs.find(
      (entry) =>
        isKrakenPairTradable(entry.pair) &&
        (entry.key.toUpperCase() === configuredPair.toUpperCase() ||
          entry.pair.altname?.toUpperCase() === configuredPair.toUpperCase() ||
          entry.pair.wsname?.toUpperCase() === configuredPair.toUpperCase()),
    );

    if (exactConfigured) {
      return {
        definition,
        restPair: exactConfigured.pair.altname ?? exactConfigured.key,
        streamSymbol: exactConfigured.pair.wsname ?? configuredPair,
      };
    }
  }

  const normalizedBase = normalizeKrakenBaseAsset(definition.symbol);
  const directUsdSymbols = [`${normalizedBase}/USD`, `${normalizedBase}/USDT`];
  const directAltNames = [`${normalizedBase}USD`, `${normalizedBase}USDT`];

  const directMatch = pairs.find((entry) => {
    if (!isKrakenPairTradable(entry.pair)) {
      return false;
    }

    const wsname = entry.pair.wsname?.toUpperCase();
    const altname = entry.pair.altname?.toUpperCase();
    return (
      (wsname && directUsdSymbols.includes(wsname)) ||
      (altname && directAltNames.includes(altname))
    );
  });

  if (directMatch) {
    return {
      definition,
      restPair: directMatch.pair.altname ?? directMatch.key,
      streamSymbol: directMatch.pair.wsname ?? `${normalizedBase}/USD`,
    };
  }

  const heuristicMatch = pairs.find((entry) => {
    if (!isKrakenPairTradable(entry.pair)) {
      return false;
    }

    const wsname = entry.pair.wsname?.toUpperCase() ?? "";
    const altname = entry.pair.altname?.toUpperCase() ?? "";
    const pairText = `${entry.key} ${wsname} ${altname}`;

    if (!(pairText.includes("/USD") || pairText.includes("USD"))) {
      return false;
    }

    return definition.searchTerms.some((term) => pairText.includes(term.toUpperCase()));
  });

  if (heuristicMatch) {
    return {
      definition,
      restPair: heuristicMatch.pair.altname ?? heuristicMatch.key,
      streamSymbol: heuristicMatch.pair.wsname ?? `${normalizedBase}/USD`,
    };
  }

  throw new Error(`Kraken does not currently expose a usable USD market for ${definition.symbol}.`);
}

function recordStreamPoint(streamSymbol: string, at: string, price: number) {
  const history = globalState.stream.priceHistory.get(streamSymbol) ?? [];
  const lastPoint = history[history.length - 1];

  if (lastPoint && lastPoint.at === at) {
    lastPoint.price = price;
  } else if (!lastPoint || Math.abs(lastPoint.price - price) >= 0.0000001 || history.length < 2) {
    history.push({ at, price });
  }

  globalState.stream.priceHistory.set(streamSymbol, history.slice(-maxStreamPoints));
}

function handleTickerMessage(message: KrakenTickerMessage) {
  if (!Array.isArray(message.data)) {
    return;
  }

  for (const item of message.data) {
    const streamSymbol = item.symbol;
    const rawPrice = item.last;

    if (!streamSymbol || typeof rawPrice !== "number" || !Number.isFinite(rawPrice) || rawPrice <= 0) {
      continue;
    }

    const safePrice: number = rawPrice;

    const fetchedAt = item.timestamp ?? new Date().toISOString();
    globalState.stream.latestQuotes.set(streamSymbol, {
      price: safePrice,
      bid: typeof item.bid === "number" ? item.bid : null,
      ask: typeof item.ask === "number" ? item.ask : null,
      volume24h: typeof item.volume === "number" ? item.volume : null,
      low24h: typeof item.low === "number" ? item.low : null,
      high24h: typeof item.high === "number" ? item.high : null,
      changePct24h: typeof item.change_pct === "number" ? item.change_pct : null,
      fetchedAt,
    });
    recordStreamPoint(streamSymbol, fetchedAt, safePrice);
  }
}

function scheduleReconnect() {
  if (globalState.stream.reconnectTimeoutId || globalState.stream.subscribedSymbols.size === 0) {
    return;
  }

  globalState.stream.reconnectTimeoutId = setTimeout(() => {
    globalState.stream.reconnectTimeoutId = null;
    void ensureKrakenStream([...globalState.stream.subscribedSymbols]);
  }, 2_000);
}

function sendSubscribeMessage(symbols: string[]) {
  if (!globalState.stream.socket || !globalState.stream.isOpen || symbols.length === 0) {
    return;
  }

  globalState.stream.socket.send(
    JSON.stringify({
      method: "subscribe",
      params: {
        channel: "ticker",
        symbol: symbols,
        snapshot: true,
      },
    }),
  );
}

async function ensureKrakenStream(symbols: string[]) {
  if (typeof WebSocket === "undefined") {
    return;
  }

  for (const symbol of symbols) {
    globalState.stream.subscribedSymbols.add(symbol);
  }

  if (globalState.stream.socket && globalState.stream.isOpen) {
    sendSubscribeMessage(symbols);
    return;
  }

  if (globalState.stream.socket) {
    return;
  }

  const socket = new WebSocket(websocketUrl);
  globalState.stream.socket = socket;

  socket.addEventListener("open", () => {
    globalState.stream.isOpen = true;
    sendSubscribeMessage([...globalState.stream.subscribedSymbols]);
  });

  socket.addEventListener("message", (event) => {
    const payload = typeof event.data === "string" ? event.data : "";

    if (!payload) {
      return;
    }

    const message = JSON.parse(payload) as KrakenTickerMessage;

    if (message.channel === "ticker" && (message.type === "snapshot" || message.type === "update")) {
      handleTickerMessage(message);
    }
  });

  socket.addEventListener("close", () => {
    globalState.stream.isOpen = false;
    globalState.stream.socket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    try {
      socket.close();
    } catch {
      // Ignore close errors during reconnect handling.
    }
  });
}

function getKrakenInterval(interval: SupportedChartInterval) {
  switch (interval) {
    case "1min":
      return 1;
    case "15min":
      return 15;
    case "1h":
      return 60;
    case "4h":
      return 240;
    case "1day":
      return 1440;
    default:
      return 15;
  }
}

function getKrakenOhlcKey(payload: KrakenOhlcResponse) {
  const result = payload.result ?? {};
  return Object.keys(result).find((key) => key !== "last") ?? null;
}

function buildCandlesFromRows(
  symbol: string,
  providerSymbol: string,
  interval: SupportedChartInterval,
  rows: Array<Array<number | string>>,
  outputsize: number,
) {
  const candles: LiveCandle[] = rows
    .map((row) => {
      const [time, open, high, low, close, , volume] = row;
      const timestamp = typeof time === "number" ? time : Number(time);
      const openPrice = Number(open);
      const highPrice = Number(high);
      const lowPrice = Number(low);
      const closePrice = Number(close);
      const volumeValue = Number(volume);

      if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(openPrice) ||
        !Number.isFinite(highPrice) ||
        !Number.isFinite(lowPrice) ||
        !Number.isFinite(closePrice)
      ) {
        return null;
      }

      return {
        datetime: new Date(timestamp * 1000).toISOString().slice(0, 19).replace("T", " "),
        open: roundPriceValue(openPrice),
        high: roundPriceValue(highPrice),
        low: roundPriceValue(lowPrice),
        close: roundPriceValue(closePrice),
        volume: Number.isFinite(volumeValue) ? volumeValue : null,
      } satisfies LiveCandle;
    })
    .filter((value): value is LiveCandle => Boolean(value));

  if (candles.length < 2) {
    throw new Error(`Kraken did not return enough candles for ${symbol}.`);
  }

  return {
    symbol,
    providerSymbol,
    interval,
    currency: "USD",
    candles: candles.slice(-outputsize),
    fetchedAt: new Date().toISOString(),
  } satisfies LiveCandleSeries;
}

function getStreamSeries(streamSymbol: string) {
  const points = globalState.stream.priceHistory.get(streamSymbol) ?? [];
  return points.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
}

function getFreshStreamQuote(streamSymbol: string) {
  const snapshot = globalState.stream.latestQuotes.get(streamSymbol);

  if (!snapshot) {
    return null;
  }

  if (Date.now() - new Date(snapshot.fetchedAt).getTime() > streamFreshnessMs) {
    return null;
  }

  return snapshot;
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const { definition, restPair, streamSymbol } = await resolveKrakenPair(symbol);
  const cachedQuote = globalState.quotes.get(definition.symbol);

  if (cachedQuote && Date.now() - cachedQuote.cachedAt < quoteCacheTtlMs) {
    return cachedQuote.quote;
  }

  void ensureKrakenStream([streamSymbol]);

  const streamQuote = getFreshStreamQuote(streamSymbol);

  if (streamQuote) {
    const quote: LiveAssetQuote = {
      symbol: definition.symbol,
      providerSymbol: streamSymbol,
      price: roundPriceValue(streamQuote.price),
      changePercent: Number((streamQuote.changePct24h ?? 0).toFixed(2)),
      currency: "USD",
      series: getStreamSeries(streamSymbol).slice(-24),
      fetchedAt: streamQuote.fetchedAt,
    };

    globalState.quotes.set(definition.symbol, {
      cachedAt: Date.now(),
      quote,
    });

    return quote;
  }

  const searchParams = new URLSearchParams({ pair: restPair });
  const payload = await fetchKrakenJson<KrakenTickerResponse>(`/Ticker?${searchParams.toString()}`);
  const result = payload.result ?? {};
  const tickerKey = Object.keys(result)[0];
  const ticker = tickerKey ? result[tickerKey] : null;

  if (!ticker) {
    throw new Error(`Kraken did not return ticker data for ${definition.symbol}.`);
  }

  const price = Number(ticker.c?.[0] ?? "");
  const openingPrice = Number(ticker.o ?? "");

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Kraken did not return a valid price for ${definition.symbol}.`);
  }

  const changePercent =
    Number.isFinite(openingPrice) && openingPrice > 0
      ? ((price - openingPrice) / openingPrice) * 100
      : 0;
  const fetchedAt = new Date().toISOString();
  const quote: LiveAssetQuote = {
    symbol: definition.symbol,
    providerSymbol: streamSymbol,
    price: roundPriceValue(price),
    changePercent: Number(changePercent.toFixed(2)),
    currency: "USD",
    series: [],
    fetchedAt,
  };

  globalState.quotes.set(definition.symbol, {
    cachedAt: Date.now(),
    quote,
  });
  recordStreamPoint(streamSymbol, fetchedAt, quote.price);

  return quote;
}

export async function fetchLiveCandlesForSymbol(
  symbol: string,
  interval: SupportedChartInterval,
  outputsize = 48,
) {
  const { definition, restPair, streamSymbol } = await resolveKrakenPair(symbol);
  const cacheKey = `${definition.symbol}:${interval}:${outputsize}`;
  const cachedChart = globalState.charts.get(cacheKey);

  if (cachedChart && Date.now() - cachedChart.cachedAt < chartCacheTtlMs) {
    return cachedChart.chart;
  }

  void ensureKrakenStream([streamSymbol]);

  const searchParams = new URLSearchParams({
    pair: restPair,
    interval: String(getKrakenInterval(interval)),
  });
  const payload = await fetchKrakenJson<KrakenOhlcResponse>(`/OHLC?${searchParams.toString()}`);
  const ohlcKey = getKrakenOhlcKey(payload);

  if (!ohlcKey) {
    throw new Error(`Kraken did not return OHLC data for ${definition.symbol}.`);
  }

  const rows = payload.result?.[ohlcKey];

  if (!Array.isArray(rows)) {
    throw new Error(`Kraken returned invalid OHLC data for ${definition.symbol}.`);
  }

  const chart = buildCandlesFromRows(definition.symbol, streamSymbol, interval, rows, outputsize);
  globalState.charts.set(cacheKey, {
    cachedAt: Date.now(),
    chart,
  });

  return chart;
}
