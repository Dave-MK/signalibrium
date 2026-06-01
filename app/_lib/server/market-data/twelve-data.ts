import { getMarketDataAssetDefinition } from "./asset-catalog";
import type {
  LiveAssetQuote,
  LiveCandleSeries,
  MarketDataAssetDefinition,
  SupportedChartInterval,
} from "./provider-types";

const baseUrl = "https://api.twelvedata.com";
const chartCacheTtlMs = 55_000;
const liveChartCache = new Map<
  string,
  {
    cachedAt: number;
    chart: LiveCandleSeries;
  }
>();

type TwelveDataErrorResponse = {
  code?: number;
  status?: string;
  message?: string;
};

type TwelveDataQuoteResponse = TwelveDataErrorResponse & {
  symbol?: string;
  currency?: string;
  datetime?: string;
  close?: string;
  percent_change?: string;
};

type TwelveDataTimeSeriesResponse = TwelveDataErrorResponse & {
  meta?: {
    currency?: string;
  };
  values?: Array<{
    datetime?: string;
    open?: string;
    high?: string;
    low?: string;
    close?: string;
    volume?: string;
  }>;
};

function getApiKey() {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "TWELVE_DATA_API_KEY is not configured. Add it to your local environment before syncing live market data.",
    );
  }

  return apiKey;
}

async function fetchTwelveData<T>(
  endpoint: string,
  params: Record<string, string>,
) {
  const apiKey = getApiKey();
  const searchParams = new URLSearchParams({
    ...params,
    apikey: apiKey,
  });
  const response = await fetch(`${baseUrl}${endpoint}?${searchParams.toString()}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as T & TwelveDataErrorResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? "Twelve Data request failed.");
  }

  if (payload.status === "error" || payload.code) {
    throw new Error(payload.message ?? "Twelve Data returned an error.");
  }

  return payload;
}

function parseNumericString(value: string | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSeries(values: TwelveDataTimeSeriesResponse["values"]) {
  return (values ?? [])
    .map((value) => parseNumericString(value.close))
    .filter((value) => value > 0);
}

function parseCandles(values: TwelveDataTimeSeriesResponse["values"]) {
  return (values ?? [])
    .map((value) => {
      const open = parseNumericString(value.open);
      const high = parseNumericString(value.high);
      const low = parseNumericString(value.low);
      const close = parseNumericString(value.close);

      if (!value.datetime || open <= 0 || high <= 0 || low <= 0 || close <= 0) {
        return null;
      }

      return {
        datetime: value.datetime,
        open,
        high,
        low,
        close,
        volume:
          typeof value.volume === "string" && value.volume.length > 0
            ? parseNumericString(value.volume)
            : null,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
}

function buildLiveSeriesQuote(
  definition: MarketDataAssetDefinition,
  response: TwelveDataTimeSeriesResponse,
) {
  const series = parseSeries(response.values);
  const price = series[series.length - 1] ?? 0;
  const previous = series[series.length - 2] ?? price;
  const changePercent =
    previous > 0 ? ((price - previous) / previous) * 100 : 0;

  if (price <= 0 || series.length < 2) {
    throw new Error(`No usable time series was returned for ${definition.providerSymbol}.`);
  }

  return {
    symbol: definition.symbol,
    providerSymbol: definition.providerSymbol ?? definition.symbol,
    price,
    changePercent,
    currency: response.meta?.currency ?? "USD",
    series,
    fetchedAt:
      response.values?.[response.values.length - 1]?.datetime ?? new Date().toISOString(),
  };
}

function buildLiveCandleSeries(
  definition: MarketDataAssetDefinition,
  interval: SupportedChartInterval,
  response: TwelveDataTimeSeriesResponse,
): LiveCandleSeries {
  const candles = parseCandles(response.values);

  if (candles.length < 2) {
    throw new Error(`No usable candle data was returned for ${definition.providerSymbol}.`);
  }

  return {
    symbol: definition.symbol,
    providerSymbol: definition.providerSymbol ?? definition.symbol,
    interval,
    currency: response.meta?.currency ?? "USD",
    candles,
    fetchedAt: candles[candles.length - 1]?.datetime ?? new Date().toISOString(),
    proxyNote: definition.proxyNote,
  };
}

export async function fetchTwelveDataQuote(
  definition: MarketDataAssetDefinition,
): Promise<LiveAssetQuote> {
  if (!definition.providerSymbol || !definition.providerType) {
    throw new Error(`No live provider mapping exists for ${definition.symbol}.`);
  }

  const quote = await fetchTwelveData<TwelveDataQuoteResponse>("/quote", {
    symbol: definition.providerSymbol,
    type: definition.providerType,
    interval: "1day",
  });

  const price = parseNumericString(quote.close);
  const changePercent = parseNumericString(quote.percent_change);

  if (price <= 0) {
    throw new Error(`No price was returned for ${definition.providerSymbol}.`);
  }

  return {
    symbol: definition.symbol,
    providerSymbol: definition.providerSymbol,
    price,
    changePercent,
    currency: quote.currency ?? "USD",
    series: [],
    fetchedAt: quote.datetime ?? new Date().toISOString(),
  };
}

export async function fetchTwelveDataSeries(
  definition: MarketDataAssetDefinition,
): Promise<LiveAssetQuote> {
  if (!definition.providerSymbol || !definition.providerType) {
    throw new Error(`No live provider mapping exists for ${definition.symbol}.`);
  }

  const response = await fetchTwelveData<TwelveDataTimeSeriesResponse>("/time_series", {
    symbol: definition.providerSymbol,
    type: definition.providerType,
    interval: "1day",
    outputsize: "12",
    order: "asc",
  });

  return buildLiveSeriesQuote(definition, response);
}

export async function fetchTwelveDataCandles(
  definition: MarketDataAssetDefinition,
  interval: SupportedChartInterval,
  outputsize = 48,
): Promise<LiveCandleSeries> {
  if (!definition.providerSymbol || !definition.providerType) {
    throw new Error(`No live provider mapping exists for ${definition.symbol}.`);
  }

  const response = await fetchTwelveData<TwelveDataTimeSeriesResponse>("/time_series", {
    symbol: definition.providerSymbol,
    type: definition.providerType,
    interval,
    outputsize: String(outputsize),
    order: "asc",
  });

  return buildLiveCandleSeries(definition, interval, response);
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No provider mapping is configured for ${symbol.toUpperCase()}.`);
  }

  return fetchTwelveDataQuote(definition);
}

export async function fetchLiveSeriesForSymbol(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No provider mapping is configured for ${symbol.toUpperCase()}.`);
  }

  return fetchTwelveDataSeries(definition);
}

export async function fetchLiveCandlesForSymbol(
  symbol: string,
  interval: SupportedChartInterval,
  outputsize = 48,
) {
  const cacheKey = `${symbol.toUpperCase()}:${interval}:${outputsize}`;
  const cachedChart = liveChartCache.get(cacheKey);

  if (cachedChart && Date.now() - cachedChart.cachedAt < chartCacheTtlMs) {
    return cachedChart.chart;
  }

  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No provider mapping is configured for ${symbol.toUpperCase()}.`);
  }

  try {
    const chart = await fetchTwelveDataCandles(definition, interval, outputsize);
    liveChartCache.set(cacheKey, {
      cachedAt: Date.now(),
      chart,
    });

    return chart;
  } catch (error) {
    if (cachedChart) {
      return cachedChart.chart;
    }

    throw error;
  }
}
