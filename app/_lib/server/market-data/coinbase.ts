import { getMarketDataAssetDefinition } from "./asset-catalog";
import type {
  LiveAssetQuote,
  LiveCandle,
  LiveCandleSeries,
  SupportedChartInterval,
} from "./provider-types";

const restBaseUrl = "https://api.exchange.coinbase.com";
const websocketUrl = "wss://ws-feed.exchange.coinbase.com";
const productCatalogTtlMs = 10 * 60_000;
const quoteCacheTtlMs = 20_000;
const chartCacheTtlMs = 55_000;
const streamFreshnessMs = 30_000;
const maxStreamPoints = 180;

type CoinbaseProduct = {
  id?: string;
  base_currency?: string;
  quote_currency?: string;
  display_name?: string;
  status?: string;
  trading_disabled?: boolean;
  cancel_only?: boolean;
  limit_only?: boolean;
  post_only?: boolean;
};

type CoinbaseTickerResponse = {
  trade_id?: number;
  price?: string;
  bid?: string;
  ask?: string;
  time?: string;
  volume?: string;
};

type CoinbaseStatsResponse = {
  open?: string;
  high?: string;
  low?: string;
  last?: string;
  volume?: string;
  volume_30day?: string;
};

type CoinbaseCandleBucket = [number, number, number, number, number, number?];

type CoinbaseTickerMessage = {
  type?: string;
  product_id?: string;
  price?: string;
  open_24h?: string;
  volume_24h?: string;
  low_24h?: string;
  high_24h?: string;
  best_bid?: string;
  best_ask?: string;
  time?: string;
};

type StreamQuotePoint = {
  at: string;
  price: number;
};

type StreamQuoteSnapshot = {
  price: number;
  open24h: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  bid: number | null;
  ask: number | null;
  fetchedAt: string;
};

type CoinbaseStreamState = {
  socket: WebSocket | null;
  isOpen: boolean;
  reconnectTimeoutId: ReturnType<typeof setTimeout> | null;
  subscribedProductIds: Set<string>;
  latestQuotes: Map<string, StreamQuoteSnapshot>;
  priceHistory: Map<string, StreamQuotePoint[]>;
};

type CoinbaseGlobalState = {
  products: CoinbaseProduct[];
  productsCachedAt: number;
  productsPromise: Promise<CoinbaseProduct[]> | null;
  quotes: Map<string, { cachedAt: number; quote: LiveAssetQuote }>;
  charts: Map<string, { cachedAt: number; chart: LiveCandleSeries }>;
  stream: CoinbaseStreamState;
};

const globalState = (globalThis as typeof globalThis & {
  __signalibriumCoinbaseState?: CoinbaseGlobalState;
}).__signalibriumCoinbaseState ??= {
  products: [],
  productsCachedAt: 0,
  productsPromise: null,
  quotes: new Map<string, { cachedAt: number; quote: LiveAssetQuote }>(),
  charts: new Map<string, { cachedAt: number; chart: LiveCandleSeries }>(),
  stream: {
    socket: null,
    isOpen: false,
    reconnectTimeoutId: null,
    subscribedProductIds: new Set<string>(),
    latestQuotes: new Map<string, StreamQuoteSnapshot>(),
    priceHistory: new Map<string, StreamQuotePoint[]>(),
  },
};

function buildCoinbaseError(payload: unknown, fallbackMessage: string) {
  if (payload && typeof payload === "object") {
    if ("message" in payload && typeof payload.message === "string") {
      return payload.message;
    }

    if ("error" in payload && typeof payload.error === "string") {
      return payload.error;
    }
  }

  return fallbackMessage;
}

async function fetchCoinbaseJson<T>(pathname: string) {
  const response = await fetch(`${restBaseUrl}${pathname}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error(buildCoinbaseError(payload, `Coinbase request failed for ${pathname}.`));
  }

  return payload;
}

async function listCoinbaseProducts() {
  if (
    globalState.products.length > 0 &&
    Date.now() - globalState.productsCachedAt < productCatalogTtlMs
  ) {
    return globalState.products;
  }

  if (!globalState.productsPromise) {
    globalState.productsPromise = fetchCoinbaseJson<CoinbaseProduct[]>("/products")
      .then((products) => {
        globalState.products = products;
        globalState.productsCachedAt = Date.now();
        return products;
      })
      .finally(() => {
        globalState.productsPromise = null;
      });
  }

  return globalState.productsPromise;
}

function parseCoinbaseWidgetProductId(widgetSymbol: string | null | undefined) {
  if (!widgetSymbol?.startsWith("COINBASE:")) {
    return null;
  }

  const suffix = widgetSymbol.split(":")[1]?.trim();

  if (!suffix || suffix.length < 4) {
    return null;
  }

  if (suffix.endsWith("USDC")) {
    return `${suffix.slice(0, -4)}-USDC`;
  }

  if (suffix.endsWith("USD")) {
    return `${suffix.slice(0, -3)}-USD`;
  }

  return null;
}

function getFallbackCoinbaseProductCandidates(symbol: string) {
  const upperSymbol = symbol.toUpperCase();

  return [`${upperSymbol}-USD`, `${upperSymbol}-USDC`];
}

function isCoinbaseProductTradable(product: CoinbaseProduct) {
  if (!product.id) {
    return false;
  }

  if (typeof product.status === "string" && product.status.toLowerCase() !== "online") {
    return false;
  }

  return !product.trading_disabled && !product.cancel_only;
}

async function resolveCoinbaseProduct(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No Coinbase mapping is configured for ${symbol.toUpperCase()}.`);
  }

  const products = await listCoinbaseProducts();
  const productsById = new Map(
    products
      .filter((product): product is CoinbaseProduct & { id: string } => typeof product.id === "string")
      .map((product) => [product.id.toUpperCase(), product]),
  );
  const configuredProductId =
    definition.coinbaseProductId?.trim() ||
    process.env[`SIGNALIBRIUM_COINBASE_PRODUCT_${definition.symbol}`]?.trim() ||
    parseCoinbaseWidgetProductId(
      "widgetSymbol" in definition && typeof (definition as { widgetSymbol?: string }).widgetSymbol === "string"
        ? (definition as { widgetSymbol?: string }).widgetSymbol!
        : null,
    );

  if (configuredProductId) {
    const product = productsById.get(configuredProductId.toUpperCase());

    if (product && isCoinbaseProductTradable(product)) {
      return {
        definition,
        productId: product.id!,
      };
    }
  }

  for (const candidate of getFallbackCoinbaseProductCandidates(definition.symbol)) {
    const product = productsById.get(candidate.toUpperCase());

    if (product && isCoinbaseProductTradable(product)) {
      return {
        definition,
        productId: product.id!,
      };
    }
  }

  const exactBaseProduct = products.find(
    (product) =>
      isCoinbaseProductTradable(product) &&
      product.base_currency?.toUpperCase() === definition.symbol.toUpperCase() &&
      (product.quote_currency === "USD" || product.quote_currency === "USDC"),
  );

  if (exactBaseProduct?.id) {
    return {
      definition,
      productId: exactBaseProduct.id,
    };
  }

  const heuristicProduct = products.find((product) => {
    if (!isCoinbaseProductTradable(product)) {
      return false;
    }

    const productText = `${product.id ?? ""} ${product.display_name ?? ""}`.toUpperCase();
    return definition.searchTerms.some((term) => productText.includes(term.toUpperCase()));
  });

  if (heuristicProduct?.id) {
    return {
      definition,
      productId: heuristicProduct.id,
    };
  }

  throw new Error(
    `Coinbase Exchange does not currently expose a tradable USD product for ${definition.symbol}.`,
  );
}

function recordStreamPoint(productId: string, at: string, price: number) {
  const history = globalState.stream.priceHistory.get(productId) ?? [];
  const lastPoint = history[history.length - 1];

  if (lastPoint && lastPoint.at === at) {
    lastPoint.price = price;
  } else if (!lastPoint || Math.abs(lastPoint.price - price) >= 0.0000001 || history.length < 2) {
    history.push({ at, price });
  }

  globalState.stream.priceHistory.set(productId, history.slice(-maxStreamPoints));
}

function handleTickerMessage(message: CoinbaseTickerMessage) {
  const productId = message.product_id;
  const price = Number(message.price);

  if (!productId || !Number.isFinite(price) || price <= 0) {
    return;
  }

  const fetchedAt = message.time ?? new Date().toISOString();
  globalState.stream.latestQuotes.set(productId, {
    price,
    open24h: Number(message.open_24h ?? ""),
    high24h: Number(message.high_24h ?? ""),
    low24h: Number(message.low_24h ?? ""),
    volume24h: Number(message.volume_24h ?? ""),
    bid: Number(message.best_bid ?? ""),
    ask: Number(message.best_ask ?? ""),
    fetchedAt,
  });
  recordStreamPoint(productId, fetchedAt, price);
}

function scheduleReconnect() {
  if (globalState.stream.reconnectTimeoutId || globalState.stream.subscribedProductIds.size === 0) {
    return;
  }

  globalState.stream.reconnectTimeoutId = setTimeout(() => {
    globalState.stream.reconnectTimeoutId = null;
    void ensureCoinbaseStream([...globalState.stream.subscribedProductIds]);
  }, 2_000);
}

function sendSubscribeMessage(productIds: string[]) {
  if (!globalState.stream.socket || !globalState.stream.isOpen || productIds.length === 0) {
    return;
  }

  globalState.stream.socket.send(
    JSON.stringify({
      type: "subscribe",
      product_ids: productIds,
      channels: ["ticker", "heartbeat"],
    }),
  );
}

async function ensureCoinbaseStream(productIds: string[]) {
  if (typeof WebSocket === "undefined") {
    return;
  }

  for (const productId of productIds) {
    globalState.stream.subscribedProductIds.add(productId);
  }

  if (globalState.stream.socket && globalState.stream.isOpen) {
    sendSubscribeMessage(productIds);
    return;
  }

  if (globalState.stream.socket) {
    return;
  }

  const socket = new WebSocket(websocketUrl);
  globalState.stream.socket = socket;

  socket.addEventListener("open", () => {
    globalState.stream.isOpen = true;
    sendSubscribeMessage([...globalState.stream.subscribedProductIds]);
  });

  socket.addEventListener("message", (event) => {
    const payload = typeof event.data === "string" ? event.data : "";

    if (!payload) {
      return;
    }

    const message = JSON.parse(payload) as CoinbaseTickerMessage;

    if (message.type === "ticker") {
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

function getGranularityForInterval(interval: SupportedChartInterval) {
  switch (interval) {
    case "1min":
      return 60;
    case "15min":
      return 900;
    case "1h":
      return 3600;
    case "4h":
      return 3600;
    case "1day":
      return 86400;
    default:
      return 900;
  }
}

function getBucketCountForInterval(interval: SupportedChartInterval, outputsize: number) {
  if (interval === "4h") {
    return Math.min(300, outputsize * 4);
  }

  return Math.min(300, Math.max(outputsize, 24));
}

function formatCandleTimestamp(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function buildCandlesFromBuckets(
  productId: string,
  symbol: string,
  interval: SupportedChartInterval,
  buckets: CoinbaseCandleBucket[],
  outputsize: number,
) {
  const orderedBuckets = [...buckets].sort((left, right) => left[0] - right[0]);
  let candles: LiveCandle[] = orderedBuckets
    .map((bucket) => {
      const [timestamp, low, high, open, close, volume] = bucket;

      if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(low) ||
        !Number.isFinite(high) ||
        !Number.isFinite(open) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      return {
        datetime: formatCandleTimestamp(timestamp),
        open: Number(open.toFixed(6)),
        high: Number(high.toFixed(6)),
        low: Number(low.toFixed(6)),
        close: Number(close.toFixed(6)),
        volume: typeof volume === "number" && Number.isFinite(volume) ? volume : null,
      } satisfies LiveCandle;
    })
    .filter((value): value is LiveCandle => Boolean(value));

  if (interval === "4h") {
    const aggregated: LiveCandle[] = [];

    for (let index = 0; index < candles.length; index += 4) {
      const bucket = candles.slice(index, index + 4);

      if (bucket.length === 0) {
        continue;
      }

      aggregated.push({
        datetime: bucket[0].datetime,
        open: bucket[0].open,
        high: Math.max(...bucket.map((entry) => entry.high)),
        low: Math.min(...bucket.map((entry) => entry.low)),
        close: bucket[bucket.length - 1].close,
        volume: bucket.reduce((total, entry) => total + (entry.volume ?? 0), 0),
      });
    }

    candles = aggregated;
  }

  if (candles.length < 2) {
    throw new Error(`Coinbase did not return enough candles for ${symbol}.`);
  }

  const chart: LiveCandleSeries = {
    symbol,
    providerSymbol: productId,
    interval,
    currency: "USD",
    candles: candles.slice(-outputsize),
    fetchedAt: new Date().toISOString(),
  };

  return chart;
}

async function fetchCoinbaseCandles(
  productId: string,
  interval: SupportedChartInterval,
  outputsize: number,
) {
  const bucketCount = getBucketCountForInterval(interval, outputsize);
  const granularity = getGranularityForInterval(interval);
  const end = new Date();
  const start = new Date(end.getTime() - bucketCount * granularity * 1000);
  const searchParams = new URLSearchParams({
    granularity: String(granularity),
    start: start.toISOString(),
    end: end.toISOString(),
  });

  return fetchCoinbaseJson<CoinbaseCandleBucket[]>(
    `/products/${encodeURIComponent(productId)}/candles?${searchParams.toString()}`,
  );
}

function getStreamSeries(productId: string) {
  const points = globalState.stream.priceHistory.get(productId) ?? [];
  return points.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0);
}

function getFreshStreamQuote(productId: string) {
  const snapshot = globalState.stream.latestQuotes.get(productId);

  if (!snapshot) {
    return null;
  }

  if (Date.now() - new Date(snapshot.fetchedAt).getTime() > streamFreshnessMs) {
    return null;
  }

  return snapshot;
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const { definition, productId } = await resolveCoinbaseProduct(symbol);
  const cachedQuote = globalState.quotes.get(definition.symbol);

  if (cachedQuote && Date.now() - cachedQuote.cachedAt < quoteCacheTtlMs) {
    return cachedQuote.quote;
  }

  void ensureCoinbaseStream([productId]);

  const streamQuote = getFreshStreamQuote(productId);

  if (streamQuote) {
    const openingPrice = streamQuote.open24h && streamQuote.open24h > 0 ? streamQuote.open24h : streamQuote.price;
    const changePercent = openingPrice > 0
      ? ((streamQuote.price - openingPrice) / openingPrice) * 100
      : 0;
    const quote: LiveAssetQuote = {
      symbol: definition.symbol,
      providerSymbol: productId,
      price: Number(streamQuote.price.toFixed(6)),
      changePercent: Number(changePercent.toFixed(2)),
      currency: "USD",
      series: getStreamSeries(productId).slice(-24),
      fetchedAt: streamQuote.fetchedAt,
    };

    globalState.quotes.set(definition.symbol, {
      cachedAt: Date.now(),
      quote,
    });

    return quote;
  }

  const [ticker, stats, candles] = await Promise.all([
    fetchCoinbaseJson<CoinbaseTickerResponse>(`/products/${encodeURIComponent(productId)}/ticker`),
    fetchCoinbaseJson<CoinbaseStatsResponse>(`/products/${encodeURIComponent(productId)}/stats`),
    fetchCoinbaseCandles(productId, "15min", 24),
  ]);

  const price = Number(ticker.price ?? stats.last ?? "");

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Coinbase did not return a valid price for ${definition.symbol}.`);
  }

  const openingPrice = Number(stats.open ?? "");
  const changePercent =
    Number.isFinite(openingPrice) && openingPrice > 0
      ? ((price - openingPrice) / openingPrice) * 100
      : 0;
  const series = buildCandlesFromBuckets(productId, definition.symbol, "15min", candles, 24).candles.map(
    (candle) => candle.close,
  );
  const fetchedAt = ticker.time ?? new Date().toISOString();
  const quote: LiveAssetQuote = {
    symbol: definition.symbol,
    providerSymbol: productId,
    price: Number(price.toFixed(6)),
    changePercent: Number(changePercent.toFixed(2)),
    currency: "USD",
    series,
    fetchedAt,
  };

  globalState.quotes.set(definition.symbol, {
    cachedAt: Date.now(),
    quote,
  });
  recordStreamPoint(productId, fetchedAt, quote.price);

  return quote;
}

export async function fetchLiveCandlesForSymbol(
  symbol: string,
  interval: SupportedChartInterval,
  outputsize = 48,
) {
  const { definition, productId } = await resolveCoinbaseProduct(symbol);
  const cacheKey = `${definition.symbol}:${interval}:${outputsize}`;
  const cachedChart = globalState.charts.get(cacheKey);

  if (cachedChart && Date.now() - cachedChart.cachedAt < chartCacheTtlMs) {
    return cachedChart.chart;
  }

  void ensureCoinbaseStream([productId]);

  const buckets = await fetchCoinbaseCandles(productId, interval, outputsize);
  const chart = buildCandlesFromBuckets(productId, definition.symbol, interval, buckets, outputsize);

  globalState.charts.set(cacheKey, {
    cachedAt: Date.now(),
    chart,
  });

  return chart;
}
