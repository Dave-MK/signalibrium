import { roundPriceValue } from "@/app/_lib/market-prices";
import { getMarketDataAssetDefinition } from "./asset-catalog";
import type {
  LiveAssetQuote,
  LiveCandle,
  LiveCandleSeries,
  SupportedChartInterval,
} from "./provider-types";

const restBaseUrl = "https://api.kucoin.com";
const symbolCatalogTtlMs = 10 * 60_000;
const tickerCacheTtlMs = 12_000;
const chartCacheTtlMs = 55_000;

type KucoinSymbol = {
  symbol?: string;
  baseCurrency?: string;
  quoteCurrency?: string;
  enableTrading?: boolean;
};

type KucoinSymbolsResponse = {
  code?: string;
  data?: KucoinSymbol[];
};

type KucoinTicker = {
  symbol?: string;
  last?: string;
  changeRate?: string;
  high?: string;
  low?: string;
  vol?: string;
  buy?: string;
  sell?: string;
};

type KucoinAllTickersResponse = {
  code?: string;
  data?: {
    time?: number;
    ticker?: KucoinTicker[];
  };
};

type KucoinCandlesResponse = {
  code?: string;
  data?: Array<[string, string, string, string, string, string, string]>;
};

type KucoinGlobalState = {
  symbols: KucoinSymbol[];
  symbolsCachedAt: number;
  symbolsPromise: Promise<KucoinSymbol[]> | null;
  tickerSnapshot: { cachedAt: number; tickers: Map<string, KucoinTicker> } | null;
  tickerPromise: Promise<Map<string, KucoinTicker>> | null;
  quotes: Map<string, { cachedAt: number; quote: LiveAssetQuote }>;
  charts: Map<string, { cachedAt: number; chart: LiveCandleSeries }>;
};

const globalState = (globalThis as typeof globalThis & {
  __signalibriumKucoinState?: KucoinGlobalState;
}).__signalibriumKucoinState ??= {
  symbols: [],
  symbolsCachedAt: 0,
  symbolsPromise: null,
  tickerSnapshot: null,
  tickerPromise: null,
  quotes: new Map<string, { cachedAt: number; quote: LiveAssetQuote }>(),
  charts: new Map<string, { cachedAt: number; chart: LiveCandleSeries }>(),
};

function buildKucoinError(payload: unknown, fallbackMessage: string) {
  if (payload && typeof payload === "object") {
    if ("msg" in payload && typeof payload.msg === "string") {
      return payload.msg;
    }

    if ("message" in payload && typeof payload.message === "string") {
      return payload.message;
    }
  }

  return fallbackMessage;
}

async function fetchKucoinJson<T>(pathnameWithQuery: string) {
  const response = await fetch(`${restBaseUrl}${pathnameWithQuery}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error(buildKucoinError(payload, `KuCoin request failed for ${pathnameWithQuery}.`));
  }

  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    typeof payload.code === "string" &&
    payload.code !== "200000"
  ) {
    throw new Error(buildKucoinError(payload, `KuCoin request failed for ${pathnameWithQuery}.`));
  }

  return payload;
}

async function listKucoinSymbols() {
  if (globalState.symbols.length > 0 && Date.now() - globalState.symbolsCachedAt < symbolCatalogTtlMs) {
    return globalState.symbols;
  }

  if (!globalState.symbolsPromise) {
    globalState.symbolsPromise = fetchKucoinJson<KucoinSymbolsResponse>("/api/v2/symbols")
      .then((payload) => {
        const symbols = payload.data ?? [];
        globalState.symbols = symbols;
        globalState.symbolsCachedAt = Date.now();
        return symbols;
      })
      .finally(() => {
        globalState.symbolsPromise = null;
      });
  }

  return globalState.symbolsPromise;
}

async function fetchKucoinTickerSnapshot() {
  if (globalState.tickerSnapshot && Date.now() - globalState.tickerSnapshot.cachedAt < tickerCacheTtlMs) {
    return globalState.tickerSnapshot.tickers;
  }

  if (!globalState.tickerPromise) {
    globalState.tickerPromise = fetchKucoinJson<KucoinAllTickersResponse>("/api/v1/market/allTickers")
      .then((payload) => {
        const tickers = new Map(
          (payload.data?.ticker ?? [])
            .filter((ticker): ticker is KucoinTicker & { symbol: string } => typeof ticker.symbol === "string")
            .map((ticker) => [ticker.symbol.toUpperCase(), ticker]),
        );

        globalState.tickerSnapshot = {
          cachedAt: Date.now(),
          tickers,
        };

        return tickers;
      })
      .finally(() => {
        globalState.tickerPromise = null;
      });
  }

  return globalState.tickerPromise;
}

function getFallbackKucoinCandidates(symbol: string) {
  const upperSymbol = symbol.toUpperCase();
  return [`${upperSymbol}-USDT`, `${upperSymbol}-USDC`];
}

function isKucoinSymbolTradable(symbol: KucoinSymbol) {
  if (!symbol.symbol) {
    return false;
  }

  return Boolean(symbol.enableTrading) && (symbol.quoteCurrency === "USDT" || symbol.quoteCurrency === "USDC");
}

async function resolveKucoinSymbol(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No KuCoin mapping is configured for ${symbol.toUpperCase()}.`);
  }

  const symbols = await listKucoinSymbols();
  const configuredSymbol =
    definition.kucoinSymbol?.trim() || process.env[`SIGNALIBRIUM_KUCOIN_SYMBOL_${definition.symbol}`]?.trim();

  if (configuredSymbol) {
    const exactConfigured = symbols.find(
      (candidate) =>
        isKucoinSymbolTradable(candidate) &&
        candidate.symbol?.toUpperCase() === configuredSymbol.toUpperCase(),
    );

    if (exactConfigured?.symbol) {
      return {
        definition,
        providerSymbol: exactConfigured.symbol,
      };
    }
  }

  for (const candidate of getFallbackKucoinCandidates(definition.symbol)) {
    const directMatch = symbols.find(
      (instrument) =>
        isKucoinSymbolTradable(instrument) && instrument.symbol?.toUpperCase() === candidate,
    );

    if (directMatch?.symbol) {
      return {
        definition,
        providerSymbol: directMatch.symbol,
      };
    }
  }

  throw new Error(`KuCoin does not currently expose a tradable USDT or USDC spot market for ${definition.symbol}.`);
}

function getKucoinInterval(interval: SupportedChartInterval) {
  switch (interval) {
    case "1min":
      return "1min";
    case "15min":
      return "15min";
    case "1h":
      return "1hour";
    case "4h":
      return "4hour";
    case "1day":
      return "1day";
  }
}

async function fetchKucoinCandles(
  providerSymbol: string,
  interval: SupportedChartInterval,
  outputsize: number,
) {
  const searchParams = new URLSearchParams({
    symbol: providerSymbol,
    type: getKucoinInterval(interval),
  });

  const payload = await fetchKucoinJson<KucoinCandlesResponse>(
    `/api/v1/market/candles?${searchParams.toString()}`,
  );

  return (payload.data ?? []).slice(0, outputsize);
}

function buildCandlesFromBuckets(
  providerSymbol: string,
  symbol: string,
  interval: SupportedChartInterval,
  buckets: Array<[string, string, string, string, string, string, string]>,
  outputsize: number,
): LiveCandleSeries {
  const candles: LiveCandle[] = buckets
    .map((bucket) => {
      const [startedAt, open, high, low, close, volume] = bucket;
      const timestampSeconds = Number(startedAt);

      if (!Number.isFinite(timestampSeconds)) {
        return null;
      }

      return {
        datetime: new Date(timestampSeconds * 1000).toISOString(),
        open: roundPriceValue(Number(open)),
        high: roundPriceValue(Number(high)),
        low: roundPriceValue(Number(low)),
        close: roundPriceValue(Number(close)),
        volume: Number(volume) || null,
      } satisfies LiveCandle;
    })
    .filter((candle): candle is LiveCandle => candle !== null)
    .sort((left, right) => left.datetime.localeCompare(right.datetime))
    .slice(-outputsize);

  if (candles.length < Math.min(outputsize, 8)) {
    throw new Error(`KuCoin did not return enough candles for ${symbol}.`);
  }

  return {
    symbol,
    providerSymbol,
    interval,
    currency: "USD",
    candles,
    fetchedAt: new Date().toISOString(),
    chartNote:
      "Candles are sourced from KuCoin spot klines so uncovered crypto names stay on an official exchange feed before aggregator fallback.",
  };
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const cacheKey = symbol.toUpperCase();
  const cached = globalState.quotes.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < tickerCacheTtlMs) {
    return cached.quote;
  }

  const { definition, providerSymbol } = await resolveKucoinSymbol(symbol);
  const tickerMap = await fetchKucoinTickerSnapshot();
  const ticker = tickerMap.get(providerSymbol.toUpperCase());
  const price = Number(ticker?.last);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`KuCoin did not return a valid price for ${definition.symbol}.`);
  }

  const buckets = await fetchKucoinCandles(providerSymbol, "15min", 24);
  const chart = buildCandlesFromBuckets(providerSymbol, definition.symbol, "15min", buckets, 24);
  const series = chart.candles.map((candle) => candle.close);
  const fetchedAt = new Date().toISOString();
  const changePercent = Number(ticker?.changeRate ?? 0) * 100;

  const quote: LiveAssetQuote = {
    symbol: definition.symbol,
    providerSymbol,
    price: roundPriceValue(price),
    changePercent: Number(changePercent.toFixed(2)),
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

  const { definition, providerSymbol } = await resolveKucoinSymbol(symbol);
  const buckets = await fetchKucoinCandles(providerSymbol, interval, outputsize);
  const chart = buildCandlesFromBuckets(providerSymbol, definition.symbol, interval, buckets, outputsize);

  globalState.charts.set(cacheKey, {
    cachedAt: Date.now(),
    chart,
  });

  return chart;
}
