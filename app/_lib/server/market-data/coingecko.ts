import {
  getMarketDataAssetDefinition,
  listMarketDataAssetDefinitions,
} from "./asset-catalog";
import type {
  LiveAssetQuote,
  LiveCandle,
  LiveCandleSeries,
  SupportedChartInterval,
} from "./provider-types";

const baseUrl = "https://api.coingecko.com/api/v3";
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
let quoteBatchPromise: Promise<Map<string, LiveAssetQuote>> | null = null;

type CoinGeckoSimplePricePayload = Record<
  string,
  {
    usd?: number;
    usd_24h_change?: number;
  }
>;

type CoinGeckoMarketChartPayload = {
  prices?: Array<[number, number]>;
  total_volumes?: Array<[number, number]>;
};

type PricePoint = {
  price: number;
  timestampMs: number;
  volume: number | null;
};

function normalizeTimestamp(timestampMs: number) {
  return new Date(timestampMs).toISOString();
}

function formatChartTimestamp(timestampMs: number) {
  return normalizeTimestamp(timestampMs).slice(0, 19).replace("T", " ");
}

function getBucketStart(timestampMs: number, interval: SupportedChartInterval) {
  const date = new Date(timestampMs);

  switch (interval) {
    case "1min":
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        Math.floor(date.getUTCMinutes() / 5) * 5,
        0,
        0,
      );
    case "15min":
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        Math.floor(date.getUTCMinutes() / 15) * 15,
        0,
        0,
      );
    case "1h":
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        0,
        0,
        0,
      );
    case "4h":
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        Math.floor(date.getUTCHours() / 4) * 4,
        0,
        0,
        0,
      );
    case "1day":
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
        0,
      );
    default:
      return timestampMs;
  }
}

function buildCoinGeckoError(payload: unknown, fallbackMessage: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "status" in payload &&
    payload.status &&
    typeof payload.status === "object" &&
    "error_message" in payload.status &&
    typeof payload.status.error_message === "string"
  ) {
    return payload.status.error_message;
  }

  return fallbackMessage;
}

async function fetchCoinGeckoJson<T>(pathname: string) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error(
      buildCoinGeckoError(payload, `CoinGecko request failed for ${pathname}.`),
    );
  }

  return payload;
}

function getCoinId(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition?.coingeckoCoinId) {
    throw new Error(`No CoinGecko mapping is configured for ${symbol.toUpperCase()}.`);
  }

  return {
    coinId: definition.coingeckoCoinId,
    definition,
  };
}

async function fetchQuoteBatch() {
  const cryptoDefinitions = listMarketDataAssetDefinitions().filter(
    (definition) => definition.marketDataSource === "coingecko" && definition.coingeckoCoinId,
  );
  const coinIds = cryptoDefinitions
    .map((definition) => definition.coingeckoCoinId!)
    .join(",");
  const fetchedAt = new Date().toISOString();
  const payload = await fetchCoinGeckoJson<CoinGeckoSimplePricePayload>(
    `/simple/price?ids=${encodeURIComponent(coinIds)}&vs_currencies=usd&include_24hr_change=true`,
  );
  const quotes = new Map<string, LiveAssetQuote>();

  for (const definition of cryptoDefinitions) {
    const coinId = definition.coingeckoCoinId!;
    const quoteEntry = payload[coinId];

    if (!quoteEntry || typeof quoteEntry.usd !== "number" || quoteEntry.usd <= 0) {
      continue;
    }

    const quote = {
      symbol: definition.symbol,
      providerSymbol: coinId,
      price: Number(quoteEntry.usd.toFixed(6)),
      changePercent: Number((quoteEntry.usd_24h_change ?? 0).toFixed(2)),
      currency: "USD",
      series: [],
      fetchedAt,
    } satisfies LiveAssetQuote;

    quoteCache.set(definition.symbol, {
      cachedAt: Date.now(),
      quote,
    });
    quotes.set(definition.symbol, quote);
  }

  return quotes;
}

function getChartRequest(interval: SupportedChartInterval, outputsize: number) {
  switch (interval) {
    case "1min":
      return { days: 1 };
    case "15min":
      return { days: 1 };
    case "1h":
      return { days: Math.max(2, Math.ceil(outputsize / 24)) };
    case "4h":
      return { days: Math.max(14, Math.ceil(outputsize / 6)) };
    case "1day":
      return { days: Math.min(365, Math.max(30, outputsize + 14)) };
    default:
      return { days: 2 };
  }
}

function normalizePricePoints(
  payload: CoinGeckoMarketChartPayload,
  minimumLength = 2,
) {
  const prices = payload.prices ?? [];
  const totalVolumes = payload.total_volumes ?? [];
  const volumeByTimestamp = new Map<number, number>();

  for (const [timestampMs, volume] of totalVolumes) {
    if (Number.isFinite(timestampMs) && Number.isFinite(volume)) {
      volumeByTimestamp.set(timestampMs, volume);
    }
  }

  const points = prices
    .map(([timestampMs, price]) => {
      if (!Number.isFinite(timestampMs) || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      return {
        price,
        timestampMs,
        volume: volumeByTimestamp.get(timestampMs) ?? null,
      } satisfies PricePoint;
    })
    .filter((value): value is PricePoint => Boolean(value));

  if (points.length < minimumLength) {
    throw new Error("CoinGecko did not return enough price points.");
  }

  return points;
}

function buildCandlesFromPoints(
  symbol: string,
  providerSymbol: string,
  interval: SupportedChartInterval,
  points: PricePoint[],
  outputsize: number,
) {
  const buckets = new Map<number, LiveCandle>();

  for (const point of points) {
    const bucketStart = getBucketStart(point.timestampMs, interval);
    const existing = buckets.get(bucketStart);

    if (!existing) {
      buckets.set(bucketStart, {
        datetime: formatChartTimestamp(bucketStart),
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
        volume: point.volume,
      });
      continue;
    }

    existing.high = Math.max(existing.high, point.price);
    existing.low = Math.min(existing.low, point.price);
    existing.close = point.price;
    existing.volume =
      existing.volume !== null || point.volume !== null
        ? (existing.volume ?? 0) + (point.volume ?? 0)
        : null;
  }

  const candles = [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, candle]) => ({
      ...candle,
      open: Number(candle.open.toFixed(6)),
      high: Number(candle.high.toFixed(6)),
      low: Number(candle.low.toFixed(6)),
      close: Number(candle.close.toFixed(6)),
      volume:
        candle.volume !== null && Number.isFinite(candle.volume)
          ? Number(candle.volume.toFixed(0))
          : null,
    }))
    .slice(-outputsize);

  if (candles.length < 2) {
    throw new Error(`CoinGecko did not return enough ${interval} candles for ${symbol}.`);
  }

  return candles;
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const { coinId, definition } = getCoinId(symbol);
  const cachedQuote = quoteCache.get(definition.symbol);

  if (cachedQuote && Date.now() - cachedQuote.cachedAt < quoteCacheTtlMs) {
    return cachedQuote.quote;
  }

  if (!quoteBatchPromise) {
    quoteBatchPromise = fetchQuoteBatch().finally(() => {
      quoteBatchPromise = null;
    });
  }

  const quotes = await quoteBatchPromise;
  const quote = quotes.get(definition.symbol);

  if (!quote) {
    throw new Error(`CoinGecko did not return a usable live quote for ${definition.symbol}.`);
  }

  return quote.providerSymbol === coinId ? quote : {
    ...quote,
    providerSymbol: coinId,
  };
}

export async function fetchLiveCandlesForSymbol(
  symbol: string,
  interval: SupportedChartInterval,
  outputsize = 48,
) {
  const { coinId, definition } = getCoinId(symbol);
  const cacheKey = `${definition.symbol}:${interval}:${outputsize}`;
  const cachedChart = chartCache.get(cacheKey);

  if (cachedChart && Date.now() - cachedChart.cachedAt < chartCacheTtlMs) {
    return cachedChart.chart;
  }

  const { days } = getChartRequest(interval, outputsize);
  const payload = await fetchCoinGeckoJson<CoinGeckoMarketChartPayload>(
    `/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`,
  );
  const points = normalizePricePoints(payload);
  const candles = buildCandlesFromPoints(
    definition.symbol,
    coinId,
    interval,
    points,
    outputsize,
  );
  const latestPoint = points[points.length - 1];

  const chart = {
    symbol: definition.symbol,
    providerSymbol: coinId,
    interval,
    currency: "USD",
    candles,
    fetchedAt: normalizeTimestamp(latestPoint.timestampMs),
    chartNote:
      "Candles are derived from CoinGecko live spot-price points so crypto charts stay current even when broker snapshots are unavailable.",
  } satisfies LiveCandleSeries;

  chartCache.set(cacheKey, {
    cachedAt: Date.now(),
    chart,
  });

  return chart;
}
