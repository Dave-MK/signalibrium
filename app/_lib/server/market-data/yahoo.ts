import { getMarketDataAssetDefinition } from "./asset-catalog";
import type {
  LiveAssetQuote,
  LiveCandle,
  LiveCandleSeries,
  SupportedChartInterval,
} from "./provider-types";

const baseUrl = "https://query1.finance.yahoo.com";
const quoteCacheTtlMs = 55_000;
const chartCacheTtlMs = 55_000;

const quoteCache = new Map<
  string,
  {
    cachedAt: number;
    quote: LiveAssetQuote;
  }
>();
const chartCache = new Map<
  string,
  {
    cachedAt: number;
    chart: LiveCandleSeries;
  }
>();

type YahooChartMeta = {
  currency?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  symbol?: string;
};

type YahooChartQuote = {
  close?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  open?: Array<number | null>;
  volume?: Array<number | null>;
};

type YahooChartResult = {
  meta?: YahooChartMeta;
  timestamp?: number[];
  indicators?: {
    quote?: YahooChartQuote[];
  };
};

type YahooChartPayload = {
  chart?: {
    error?: {
      description?: string;
    } | null;
    result?: YahooChartResult[];
  };
};

function resolveYahooSymbol(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition?.yahooSymbol) {
    throw new Error(`No Yahoo Finance mapping is configured for ${symbol.toUpperCase()}.`);
  }

  return {
    definition,
    yahooSymbol: definition.yahooSymbol,
  };
}

function buildYahooError(payload: YahooChartPayload, fallbackMessage: string) {
  return payload.chart?.error?.description ?? fallbackMessage;
}

async function fetchYahooChart(
  yahooSymbol: string,
  query: {
    interval: string;
    range: string;
  },
) {
  const searchParams = new URLSearchParams({
    interval: query.interval,
    range: query.range,
    includePrePost: "false",
    events: "div,splits",
  });
  const response = await fetch(
    `${baseUrl}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${searchParams.toString()}`,
    {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as YahooChartPayload;

  if (!response.ok || payload.chart?.error) {
    throw new Error(
      buildYahooError(payload, `Yahoo Finance request failed for ${yahooSymbol}.`),
    );
  }

  const result = payload.chart?.result?.[0];

  if (!result) {
    throw new Error(`Yahoo Finance did not return chart data for ${yahooSymbol}.`);
  }

  return result;
}

function getSeriesCloses(result: YahooChartResult) {
  const closes = result.indicators?.quote?.[0]?.close ?? [];

  return closes.filter((value): value is number => typeof value === "number" && value > 0);
}

function getPriceChangePercent(meta: YahooChartMeta, latestClose: number) {
  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? latestClose;

  if (!previousClose || previousClose <= 0) {
    return 0;
  }

  return ((latestClose - previousClose) / previousClose) * 100;
}

function formatChartTimestamp(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function buildCandlesFromResult(
  symbol: string,
  providerSymbol: string,
  interval: SupportedChartInterval,
  result: YahooChartResult,
  outputsize: number,
) {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];

  const candles: LiveCandle[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    const open = opens[index];
    const high = highs[index];
    const low = lows[index];
    const close = closes[index];
    const volume = volumes[index];

    if (
      typeof timestamp !== "number" ||
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number"
    ) {
      continue;
    }

    candles.push({
      datetime: formatChartTimestamp(timestamp),
      open: Number(open.toFixed(6)),
      high: Number(high.toFixed(6)),
      low: Number(low.toFixed(6)),
      close: Number(close.toFixed(6)),
      volume: typeof volume === "number" && Number.isFinite(volume) ? volume : null,
    });
  }

  if (candles.length < 2) {
    throw new Error(`Yahoo Finance did not return enough candles for ${symbol}.`);
  }

  const chart: LiveCandleSeries = {
    symbol,
    providerSymbol,
    interval,
    currency: result.meta?.currency ?? "USD",
    candles: candles.slice(-outputsize),
    fetchedAt: new Date().toISOString(),
  };

  return chart;
}

function getChartQuery(interval: SupportedChartInterval, outputsize: number) {
  switch (interval) {
    case "15min":
      return { interval: "15m", range: "5d" };
    case "1h":
      return { interval: "60m", range: outputsize > 96 ? "6mo" : "1mo" };
    case "4h":
      return { interval: "1d", range: "6mo" };
    case "1day":
      return { interval: "1d", range: outputsize > 90 ? "1y" : "6mo" };
    default:
      return { interval: "60m", range: "1mo" };
  }
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const { definition, yahooSymbol } = resolveYahooSymbol(symbol);
  const cachedQuote = quoteCache.get(definition.symbol);

  if (cachedQuote && Date.now() - cachedQuote.cachedAt < quoteCacheTtlMs) {
    return cachedQuote.quote;
  }

  const [intradayResult, dailyResult] = await Promise.all([
    fetchYahooChart(yahooSymbol, { interval: "5m", range: "1d" }),
    fetchYahooChart(yahooSymbol, { interval: "1d", range: "1mo" }),
  ]);
  const intradayCloses = getSeriesCloses(intradayResult);
  const latestPrice =
    intradayResult.meta?.regularMarketPrice ??
    intradayCloses[intradayCloses.length - 1] ??
    0;

  if (!latestPrice || latestPrice <= 0) {
    throw new Error(`Yahoo Finance did not return a usable live quote for ${definition.symbol}.`);
  }

  const dailySeries = getSeriesCloses(dailyResult).slice(-12).map((value) => Number(value.toFixed(6)));
  const quote = {
    symbol: definition.symbol,
    providerSymbol: yahooSymbol,
    price: Number(latestPrice.toFixed(6)),
    changePercent: Number(
      getPriceChangePercent(intradayResult.meta ?? {}, latestPrice).toFixed(2),
    ),
    currency: intradayResult.meta?.currency ?? "USD",
    series: dailySeries,
    fetchedAt: new Date().toISOString(),
  } satisfies LiveAssetQuote;

  quoteCache.set(definition.symbol, {
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
  const { definition, yahooSymbol } = resolveYahooSymbol(symbol);
  const cacheKey = `${definition.symbol}:${interval}:${outputsize}`;
  const cachedChart = chartCache.get(cacheKey);

  if (cachedChart && Date.now() - cachedChart.cachedAt < chartCacheTtlMs) {
    return cachedChart.chart;
  }

  const result = await fetchYahooChart(yahooSymbol, getChartQuery(interval, outputsize));
  const chart = buildCandlesFromResult(
    definition.symbol,
    yahooSymbol,
    interval,
    result,
    outputsize,
  );

  if (definition.proxyNote) {
    chart.proxyNote = definition.proxyNote;
  }

  chartCache.set(cacheKey, {
    cachedAt: Date.now(),
    chart,
  });

  return chart;
}
