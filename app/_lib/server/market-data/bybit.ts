import { roundPriceValue } from "@/app/_lib/market-prices";
import { getMarketDataAssetDefinition } from "./asset-catalog";
import type {
  LiveAssetQuote,
  LiveCandle,
  LiveCandleSeries,
  SupportedChartInterval,
} from "./provider-types";

const restBaseUrl = "https://api.bybit.com";
const websocketUrl = "wss://stream.bybit.com/v5/public/spot";
const instrumentCatalogTtlMs = 10 * 60_000;
const quoteCacheTtlMs = 20_000;
const chartCacheTtlMs = 55_000;
const streamFreshnessMs = 30_000;
const maxStreamPoints = 180;

type BybitInstrument = {
  symbol?: string;
  baseCoin?: string;
  quoteCoin?: string;
  status?: string;
};

type BybitInstrumentsResponse = {
  retCode?: number;
  retMsg?: string;
  result?: {
    list?: BybitInstrument[];
  };
};

type BybitTickerInfo = {
  symbol?: string;
  lastPrice?: string;
  prevPrice24h?: string;
  price24hPcnt?: string;
  highPrice24h?: string;
  lowPrice24h?: string;
  volume24h?: string;
  turnover24h?: string;
  bid1Price?: string;
  ask1Price?: string;
};

type BybitTickerResponse = {
  retCode?: number;
  retMsg?: string;
  result?: {
    list?: BybitTickerInfo[];
  };
};

type BybitKlineBucket = [string, string, string, string, string, string, string?];

type BybitKlineResponse = {
  retCode?: number;
  retMsg?: string;
  result?: {
    symbol?: string;
    category?: string;
    list?: BybitKlineBucket[];
  };
};

type BybitTickerMessage = {
  topic?: string;
  type?: string;
  ts?: number;
  data?: BybitTickerInfo;
};

type StreamQuotePoint = {
  at: string;
  price: number;
};

type StreamQuoteSnapshot = {
  price: number;
  bid: number | null;
  ask: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  turnover24h: number | null;
  changePct24h: number | null;
  prevPrice24h: number | null;
  fetchedAt: string;
};

type BybitStreamState = {
  socket: WebSocket | null;
  isOpen: boolean;
  reconnectTimeoutId: ReturnType<typeof setTimeout> | null;
  subscribedSymbols: Set<string>;
  latestQuotes: Map<string, StreamQuoteSnapshot>;
  priceHistory: Map<string, StreamQuotePoint[]>;
};

type BybitGlobalState = {
  instruments: BybitInstrument[];
  instrumentsCachedAt: number;
  instrumentsPromise: Promise<BybitInstrument[]> | null;
  quotes: Map<string, { cachedAt: number; quote: LiveAssetQuote }>;
  charts: Map<string, { cachedAt: number; chart: LiveCandleSeries }>;
  stream: BybitStreamState;
};

const globalState = (globalThis as typeof globalThis & {
  __signalibriumBybitState?: BybitGlobalState;
}).__signalibriumBybitState ??= {
  instruments: [],
  instrumentsCachedAt: 0,
  instrumentsPromise: null,
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

function buildBybitError(payload: unknown, fallbackMessage: string) {
  if (payload && typeof payload === "object") {
    if ("retMsg" in payload && typeof payload.retMsg === "string") {
      return payload.retMsg;
    }

    if ("msg" in payload && typeof payload.msg === "string") {
      return payload.msg;
    }
  }

  return fallbackMessage;
}

async function fetchBybitJson<T>(pathnameWithQuery: string) {
  const response = await fetch(`${restBaseUrl}${pathnameWithQuery}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error(buildBybitError(payload, `Bybit request failed for ${pathnameWithQuery}.`));
  }

  if (
    payload &&
    typeof payload === "object" &&
    "retCode" in payload &&
    typeof payload.retCode === "number" &&
    payload.retCode !== 0
  ) {
    throw new Error(buildBybitError(payload, `Bybit request failed for ${pathnameWithQuery}.`));
  }

  return payload;
}

async function listBybitSpotInstruments() {
  if (
    globalState.instruments.length > 0 &&
    Date.now() - globalState.instrumentsCachedAt < instrumentCatalogTtlMs
  ) {
    return globalState.instruments;
  }

  if (!globalState.instrumentsPromise) {
    globalState.instrumentsPromise = fetchBybitJson<BybitInstrumentsResponse>(
      "/v5/market/instruments-info?category=spot",
    )
      .then((payload) => {
        const instruments = payload.result?.list ?? [];
        globalState.instruments = instruments;
        globalState.instrumentsCachedAt = Date.now();
        return instruments;
      })
      .finally(() => {
        globalState.instrumentsPromise = null;
      });
  }

  return globalState.instrumentsPromise;
}

function getFallbackBybitCandidates(symbol: string) {
  const upperSymbol = symbol.toUpperCase();

  return [`${upperSymbol}USDT`, `${upperSymbol}USDC`];
}

function isBybitInstrumentTradable(instrument: BybitInstrument) {
  if (!instrument.symbol) {
    return false;
  }

  if (typeof instrument.status === "string" && instrument.status !== "Trading") {
    return false;
  }

  return instrument.quoteCoin === "USDT" || instrument.quoteCoin === "USDC";
}

async function resolveBybitSymbol(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No Bybit mapping is configured for ${symbol.toUpperCase()}.`);
  }

  const instruments = await listBybitSpotInstruments();
  const configuredSymbol =
    definition.bybitSymbol?.trim() || process.env[`SIGNALIBRIUM_BYBIT_SYMBOL_${definition.symbol}`]?.trim();

  if (configuredSymbol) {
    const exactConfigured = instruments.find(
      (instrument) =>
        isBybitInstrumentTradable(instrument) &&
        instrument.symbol?.toUpperCase() === configuredSymbol.toUpperCase(),
    );

    if (exactConfigured?.symbol) {
      return {
        definition,
        restSymbol: exactConfigured.symbol,
        streamSymbol: exactConfigured.symbol,
      };
    }
  }

  for (const candidate of getFallbackBybitCandidates(definition.symbol)) {
    const directMatch = instruments.find(
      (instrument) =>
        isBybitInstrumentTradable(instrument) && instrument.symbol?.toUpperCase() === candidate,
    );

    if (directMatch?.symbol) {
      return {
        definition,
        restSymbol: directMatch.symbol,
        streamSymbol: directMatch.symbol,
      };
    }
  }

  const heuristicMatch = instruments.find((instrument) => {
    if (!isBybitInstrumentTradable(instrument)) {
      return false;
    }

    const symbolText = `${instrument.symbol ?? ""} ${instrument.baseCoin ?? ""}`.toUpperCase();
    return definition.searchTerms.some((term) => symbolText.includes(term.toUpperCase()));
  });

  if (heuristicMatch?.symbol) {
    return {
      definition,
      restSymbol: heuristicMatch.symbol,
      streamSymbol: heuristicMatch.symbol,
    };
  }

  throw new Error(
    `Bybit does not currently expose a usable spot USDT or USDC market for ${definition.symbol}.`,
  );
}

function recordStreamPoint(symbol: string, at: string, price: number) {
  const history = globalState.stream.priceHistory.get(symbol) ?? [];
  history.push({ at, price });

  globalState.stream.priceHistory.set(symbol, history.slice(-maxStreamPoints));
}

function handleTickerMessage(message: BybitTickerMessage) {
  const payload = message.data;
  const symbol = payload?.symbol;
  const price = Number(payload?.lastPrice);

  if (!symbol || !Number.isFinite(price) || price <= 0) {
    return;
  }

  const fetchedAt = message.ts ? new Date(message.ts).toISOString() : new Date().toISOString();
  const changeRatio = Number(payload.price24hPcnt);
  globalState.stream.latestQuotes.set(symbol, {
    price,
    bid: Number(payload.bid1Price) || null,
    ask: Number(payload.ask1Price) || null,
    high24h: Number(payload.highPrice24h) || null,
    low24h: Number(payload.lowPrice24h) || null,
    volume24h: Number(payload.volume24h) || null,
    turnover24h: Number(payload.turnover24h) || null,
    changePct24h: Number.isFinite(changeRatio) ? changeRatio * 100 : null,
    prevPrice24h: Number(payload.prevPrice24h) || null,
    fetchedAt,
  });
  recordStreamPoint(symbol, fetchedAt, price);
}

function scheduleReconnect() {
  if (globalState.stream.reconnectTimeoutId) {
    return;
  }

  globalState.stream.reconnectTimeoutId = setTimeout(() => {
    globalState.stream.reconnectTimeoutId = null;
    void ensureBybitStream([...globalState.stream.subscribedSymbols]);
  }, 1_500);
}

function sendSubscribeMessage(symbols: string[]) {
  if (!globalState.stream.socket || !globalState.stream.isOpen || symbols.length === 0) {
    return;
  }

  globalState.stream.socket.send(
    JSON.stringify({
      op: "subscribe",
      args: symbols.map((symbol) => `tickers.${symbol}`),
    }),
  );
}

async function ensureBybitStream(symbols: string[]) {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];

  for (const symbol of uniqueSymbols) {
    globalState.stream.subscribedSymbols.add(symbol);
  }

  if (globalState.stream.socket && globalState.stream.isOpen) {
    sendSubscribeMessage(uniqueSymbols);
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

    const message = JSON.parse(payload) as BybitTickerMessage | { op?: string };

    if ("op" in message && message.op) {
      return;
    }

    handleTickerMessage(message as BybitTickerMessage);
  });

  socket.addEventListener("close", () => {
    globalState.stream.isOpen = false;
    globalState.stream.socket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

function getBybitInterval(interval: SupportedChartInterval) {
  switch (interval) {
    case "1min":
      return "1";
    case "15min":
      return "15";
    case "1h":
      return "60";
    case "4h":
      return "240";
    case "1day":
      return "D";
  }
}

function buildCandlesFromBuckets(
  providerSymbol: string,
  symbol: string,
  interval: SupportedChartInterval,
  buckets: BybitKlineBucket[],
  outputsize: number,
): LiveCandleSeries {
  const candles: LiveCandle[] = buckets
    .map((bucket) => {
      const [startedAt, open, high, low, close, volume] = bucket;
      const timestamp = Number(startedAt);

      if (!Number.isFinite(timestamp)) {
        return null;
      }

      return {
        datetime: new Date(timestamp).toISOString(),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume) || null,
      } satisfies LiveCandle;
    })
    .filter((candle): candle is LiveCandle => candle !== null)
    .sort((left, right) => left.datetime.localeCompare(right.datetime))
    .slice(-outputsize);

  if (candles.length < Math.min(outputsize, 8)) {
    throw new Error(`Bybit did not return enough candles for ${symbol}.`);
  }

  return {
    symbol,
    providerSymbol,
    interval,
    currency: "USD",
    candles,
    fetchedAt: new Date().toISOString(),
    chartNote:
      "Candles are sourced from Bybit spot klines so long-tail crypto names stay on an official exchange feed before falling back to aggregator data.",
  };
}

async function fetchBybitCandles(
  restSymbol: string,
  interval: SupportedChartInterval,
  outputsize: number,
) {
  const searchParams = new URLSearchParams({
    category: "spot",
    symbol: restSymbol,
    interval: getBybitInterval(interval),
    limit: String(Math.min(Math.max(outputsize, 24), 1_000)),
  });

  const payload = await fetchBybitJson<BybitKlineResponse>(
    `/v5/market/kline?${searchParams.toString()}`,
  );

  return payload.result?.list ?? [];
}

function getFreshStreamQuote(symbol: string) {
  const snapshot = globalState.stream.latestQuotes.get(symbol);

  if (!snapshot) {
    return null;
  }

  if (Date.now() - new Date(snapshot.fetchedAt).getTime() > streamFreshnessMs) {
    return null;
  }

  return snapshot;
}

function getStreamSeries(symbol: string) {
  const points = globalState.stream.priceHistory.get(symbol) ?? [];
  return points.map((point) => point.price);
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const cacheKey = symbol.toUpperCase();
  const cached = globalState.quotes.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < quoteCacheTtlMs) {
    return cached.quote;
  }

  const { definition, restSymbol, streamSymbol } = await resolveBybitSymbol(symbol);
  void ensureBybitStream([streamSymbol]);

  const streamQuote = getFreshStreamQuote(streamSymbol);
  if (streamQuote) {
    const quote: LiveAssetQuote = {
      symbol: definition.symbol,
      providerSymbol: restSymbol,
      price: roundPriceValue(streamQuote.price),
      changePercent: Number((streamQuote.changePct24h ?? 0).toFixed(2)),
      currency: "USD",
      series: getStreamSeries(streamSymbol).slice(-24),
      fetchedAt: streamQuote.fetchedAt,
    };

    globalState.quotes.set(cacheKey, {
      cachedAt: Date.now(),
      quote,
    });

    return quote;
  }

  const tickerParams = new URLSearchParams({
    category: "spot",
    symbol: restSymbol,
  });
  const [tickerPayload, buckets] = await Promise.all([
    fetchBybitJson<BybitTickerResponse>(`/v5/market/tickers?${tickerParams.toString()}`),
    fetchBybitCandles(restSymbol, "15min", 24),
  ]);

  const ticker = tickerPayload.result?.list?.[0];
  const price = Number(ticker?.lastPrice);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Bybit did not return a valid price for ${definition.symbol}.`);
  }

  const changeRatio = Number(ticker?.price24hPcnt);
  const chart = buildCandlesFromBuckets(restSymbol, definition.symbol, "15min", buckets, 24);
  const series = chart.candles.map((candle) => candle.close);
  const fetchedAt = new Date().toISOString();
  recordStreamPoint(streamSymbol, fetchedAt, price);

  const quote: LiveAssetQuote = {
    symbol: definition.symbol,
    providerSymbol: restSymbol,
    price: roundPriceValue(price),
    changePercent: Number(
      (
        Number.isFinite(changeRatio)
          ? changeRatio * 100
          : ticker?.prevPrice24h
            ? ((price - Number(ticker.prevPrice24h)) / Number(ticker.prevPrice24h)) * 100
            : 0
      ).toFixed(2),
    ),
    currency: "USD",
    series,
    fetchedAt,
  };

  globalState.quotes.set(cacheKey, {
    cachedAt: Date.now(),
    quote,
  });

  return quote;
}

export async function fetchLiveCandlesForSymbol(
  symbol: string,
  interval: SupportedChartInterval,
  outputsize = 48,
) {
  const cacheKey = `${symbol.toUpperCase()}::${interval}::${outputsize}`;
  const cached = globalState.charts.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < chartCacheTtlMs) {
    return cached.chart;
  }

  const { definition, restSymbol, streamSymbol } = await resolveBybitSymbol(symbol);
  void ensureBybitStream([streamSymbol]);

  const buckets = await fetchBybitCandles(restSymbol, interval, outputsize);
  const chart = buildCandlesFromBuckets(restSymbol, definition.symbol, interval, buckets, outputsize);

  globalState.charts.set(cacheKey, {
    cachedAt: Date.now(),
    chart,
  });

  return chart;
}
