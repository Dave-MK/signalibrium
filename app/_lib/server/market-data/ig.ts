import { getMarketDataAssetDefinition } from "./asset-catalog";
import type {
  LiveAssetQuote,
  LiveCandle,
  LiveCandleSeries,
  MarketDataAssetDefinition,
  MarketDataProviderName,
  SupportedChartInterval,
} from "./provider-types";

const chartSeedTtlMs = 6 * 60 * 60 * 1000;
const dailySeriesTtlMs = 6 * 60 * 60 * 1000;
const sessionTtlMs = 11 * 60 * 60 * 1000;

const chartCache = new Map<
  string,
  {
    cachedAt: number;
    chart: LiveCandleSeries;
  }
>();
const daySeriesCache = new Map<
  string,
  {
    cachedAt: number;
    quote: LiveAssetQuote;
  }
>();
const epicCache = new Map<string, string>();

let sessionPromise: Promise<IgSession> | null = null;
let cachedSession: IgSession | null = null;

type IgConfig = {
  accountId?: string;
  apiKey: string;
  baseUrl: string;
  identifier: string;
  password: string;
};

type IgSession = {
  accountId: string;
  cst: string;
  securityToken: string;
  expiresAt: number;
};

type IgErrorPayload = {
  errorCode?: string;
  message?: string;
};

type IgPriceValue = {
  ask?: number | null;
  bid?: number | null;
  lastTraded?: number | null;
};

type IgPriceRecord = {
  closePrice?: IgPriceValue;
  highPrice?: IgPriceValue;
  lastTradedVolume?: number | null;
  lowPrice?: IgPriceValue;
  openPrice?: IgPriceValue;
  snapshotTime?: string;
  snapshotTimeUTC?: string;
};

type IgPricesResponse = IgErrorPayload & {
  metadata?: {
    allowance?: {
      allowanceExpiry?: number;
      remainingAllowance?: number;
      totalAllowance?: number;
    };
  };
  prices?: IgPriceRecord[];
};

type IgMarketSearchResult = {
  delayTime?: number;
  epic?: string;
  expiry?: string;
  instrumentName?: string;
  instrumentType?: string;
  marketStatus?: string;
};

type IgMarketSearchResponse = IgErrorPayload & {
  markets?: IgMarketSearchResult[];
};

type IgMarketDetailsResponse = IgErrorPayload & {
  instrument?: {
    currencies?: Array<{
      code?: string;
      isDefault?: boolean;
    }>;
    epic?: string;
    marketId?: string;
    name?: string;
  };
  snapshot?: {
    bid?: number | null;
    high?: number | null;
    low?: number | null;
    marketStatus?: string;
    netChange?: number | null;
    offer?: number | null;
    percentageChange?: number | null;
    updateTime?: string;
  };
};

type IgSessionResponse = IgErrorPayload & {
  accounts?: Array<{
    accountId?: string;
    preferred?: boolean;
  }>;
  currentAccountId?: string;
};

function getConfiguredProviderName(): MarketDataProviderName {
  return "ig";
}

function getIgConfig(): IgConfig {
  const missingVariables: string[] = [];
  const apiKey = process.env.SIGNALIBRIUM_IG_API_KEY?.trim();
  const identifier = process.env.SIGNALIBRIUM_IG_IDENTIFIER?.trim();
  const password = process.env.SIGNALIBRIUM_IG_PASSWORD?.trim();
  const environment =
    process.env.SIGNALIBRIUM_IG_ENVIRONMENT?.trim().toLowerCase() ?? "demo";
  const explicitBaseUrl = process.env.SIGNALIBRIUM_IG_BASE_URL?.trim();
  const accountId = process.env.SIGNALIBRIUM_IG_ACCOUNT_ID?.trim();

  if (!apiKey) {
    missingVariables.push("SIGNALIBRIUM_IG_API_KEY");
  }

  if (!identifier) {
    missingVariables.push("SIGNALIBRIUM_IG_IDENTIFIER");
  }

  if (!password) {
    missingVariables.push("SIGNALIBRIUM_IG_PASSWORD");
  }

  if (missingVariables.length > 0) {
    throw new Error(
      `IG market data is not configured. Add ${missingVariables.join(", ")} to your local environment.`,
    );
  }

  const baseUrl =
    explicitBaseUrl ||
    (environment === "live"
      ? "https://api.ig.com/gateway/deal"
      : "https://demo-api.ig.com/gateway/deal");

  return {
    accountId,
    apiKey: apiKey!,
    baseUrl,
    identifier: identifier!,
    password: password!,
  };
}

function normalizeComparableValue(value: string) {
  return value.replace(/[^A-Z0-9]+/g, "").trim();
}

function parseIgTimestamp(value: string | undefined) {
  if (!value) {
    return null;
  }

  const directTimestamp = Date.parse(value);

  if (Number.isFinite(directTimestamp)) {
    return new Date(directTimestamp).toISOString();
  }

  const normalized = value.replace(/\//g, "-").replace(" ", "T");
  const utcCandidate = normalized.endsWith("Z") ? normalized : `${normalized}Z`;
  const utcTimestamp = Date.parse(utcCandidate);

  if (Number.isFinite(utcTimestamp)) {
    return new Date(utcTimestamp).toISOString();
  }

  return null;
}

function formatChartTimestamp(value: number) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
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
        date.getUTCMinutes(),
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

function getResolutionForInterval(interval: SupportedChartInterval) {
  switch (interval) {
    case "1min":
      return "MINUTE";
    case "15min":
      return "MINUTE_15";
    case "1h":
      return "HOUR";
    case "4h":
      return "HOUR_4";
    case "1day":
      return "DAY";
    default:
      return "HOUR";
  }
}

function resolvePricePoint(value: IgPriceValue | undefined) {
  if (!value) {
    return null;
  }

  const bid =
    typeof value.bid === "number" && Number.isFinite(value.bid) ? value.bid : null;
  const ask =
    typeof value.ask === "number" && Number.isFinite(value.ask) ? value.ask : null;
  const lastTraded =
    typeof value.lastTraded === "number" && Number.isFinite(value.lastTraded)
      ? value.lastTraded
      : null;

  if (bid !== null && ask !== null) {
    return Number(((bid + ask) / 2).toFixed(6));
  }

  return bid ?? ask ?? lastTraded;
}

function resolveQuoteCurrency(
  currencies:
    | Array<{
        code?: string;
        isDefault?: boolean;
      }>
    | undefined,
) {
  const defaultCurrency = currencies?.find(
    (currency: { code?: string; isDefault?: boolean }) => currency.isDefault,
  );
  return defaultCurrency?.code ?? currencies?.[0]?.code ?? "USD";
}

function buildIgError(payload: unknown, fallbackMessage: string) {
  const candidate = (payload ?? {}) as IgErrorPayload;
  return candidate.errorCode ?? candidate.message ?? fallbackMessage;
}

function clearCachedSession() {
  cachedSession = null;
  sessionPromise = null;
}

async function createIgSession() {
  const config = getIgConfig();
  const response = await fetch(`${config.baseUrl}/session`, {
    method: "POST",
    headers: {
      Accept: "application/json; charset=UTF-8",
      "Content-Type": "application/json; charset=UTF-8",
      Version: "2",
      "X-IG-API-KEY": config.apiKey,
    },
    body: JSON.stringify({
      identifier: config.identifier,
      password: config.password,
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as IgSessionResponse;

  if (!response.ok) {
    throw new Error(buildIgError(payload, "IG session login failed."));
  }

  const cst = response.headers.get("CST");
  const securityToken = response.headers.get("X-SECURITY-TOKEN");
  const accountId =
    config.accountId ||
    payload.currentAccountId ||
    payload.accounts?.find((account) => account.preferred)?.accountId ||
    payload.accounts?.[0]?.accountId;

  if (!cst || !securityToken || !accountId) {
    throw new Error(
      "IG session login succeeded but did not return the account tokens required for market-data requests.",
    );
  }

  const nextSession: IgSession = {
    accountId,
    cst,
    securityToken,
    expiresAt: Date.now() + sessionTtlMs,
  };

  cachedSession = nextSession;
  return nextSession;
}

async function getIgSession() {
  if (cachedSession && cachedSession.expiresAt > Date.now()) {
    return cachedSession;
  }

  if (!sessionPromise) {
    sessionPromise = createIgSession().finally(() => {
      sessionPromise = null;
    });
  }

  return sessionPromise;
}

async function fetchIgJson<T>(
  pathname: string,
  {
    authenticated = true,
    body,
    method = "GET",
    retry = true,
    version = "1",
  }: {
    authenticated?: boolean;
    body?: unknown;
    method?: "GET" | "POST";
    retry?: boolean;
    version?: string;
  } = {},
) {
  const config = getIgConfig();
  const headers = new Headers({
    Accept: "application/json; charset=UTF-8",
    "Content-Type": "application/json; charset=UTF-8",
    Version: version,
    "X-IG-API-KEY": config.apiKey,
  });

  if (authenticated) {
    const session = await getIgSession();
    headers.set("CST", session.cst);
    headers.set("X-SECURITY-TOKEN", session.securityToken);
  }

  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & IgErrorPayload;

  if (!response.ok) {
    const isAuthFailure =
      authenticated &&
      (response.status === 401 ||
        response.status === 403 ||
        response.status === 504);

    if (retry && isAuthFailure) {
      clearCachedSession();
      return fetchIgJson<T>(pathname, {
        authenticated,
        body,
        method,
        retry: false,
        version,
      });
    }

    throw new Error(buildIgError(payload, `IG request failed for ${pathname}.`));
  }

  return payload;
}

function scoreMarketMatch(
  definition: MarketDataAssetDefinition,
  market: IgMarketSearchResult,
  searchTerm: string,
) {
  const epic = normalizeComparableValue(market.epic?.toUpperCase() ?? "");
  const name = normalizeComparableValue(market.instrumentName?.toUpperCase() ?? "");
  const marketType = normalizeComparableValue(market.instrumentType?.toUpperCase() ?? "");
  const expiry = normalizeComparableValue(market.expiry?.toUpperCase() ?? "");
  const normalizedSymbol = normalizeComparableValue(definition.symbol.toUpperCase());
  const normalizedSearchTerm = normalizeComparableValue(searchTerm.toUpperCase());

  let score = 0;

  if (epic === normalizedSearchTerm || epic === normalizedSymbol) {
    score += 140;
  }

  if (name === normalizedSearchTerm || name === normalizedSymbol) {
    score += 120;
  }

  if (name.includes(normalizedSearchTerm) || name.includes(normalizedSymbol)) {
    score += 65;
  }

  if (epic.includes(normalizedSymbol)) {
    score += 40;
  }

  if (market.marketStatus === "TRADEABLE") {
    score += 6;
  }

  if (expiry === "" || expiry === "-" || expiry === "DFB" || expiry === "TODAY") {
    score += 10;
  }

  if (definition.proxyNote && marketType.includes("SHARES")) {
    score += 8;
  }

  return score;
}

async function resolveMarketEpic(definition: MarketDataAssetDefinition) {
  const cachedEpic = epicCache.get(definition.symbol);

  if (cachedEpic) {
    return cachedEpic;
  }

  if (definition.igEpic) {
    epicCache.set(definition.symbol, definition.igEpic);
    return definition.igEpic;
  }

  for (const searchTerm of definition.searchTerms) {
    const response = await fetchIgJson<IgMarketSearchResponse>(
      `/markets?searchTerm=${encodeURIComponent(searchTerm)}`,
      { version: "1" },
    );
    const markets = response.markets ?? [];
    const matchedMarket = [...markets]
      .sort(
        (left, right) =>
          scoreMarketMatch(definition, right, searchTerm) -
          scoreMarketMatch(definition, left, searchTerm),
      )
      .find((market) => Boolean(market.epic));

    if (matchedMarket?.epic) {
      epicCache.set(definition.symbol, matchedMarket.epic);
      return matchedMarket.epic;
    }
  }

  throw new Error(
    `IG could not resolve a market epic for ${definition.symbol}. Add SIGNALIBRIUM_IG_EPIC_${definition.symbol}=... to your local environment to pin the correct market.`,
  );
}

async function fetchIgMarketSnapshot(definition: MarketDataAssetDefinition) {
  const epic = await resolveMarketEpic(definition);
  const response = await fetchIgJson<IgMarketDetailsResponse>(
    `/markets/${encodeURIComponent(epic)}`,
    { version: "4" },
  );
  const priceFromBidOffer =
    typeof response.snapshot?.bid === "number" && typeof response.snapshot?.offer === "number"
      ? (response.snapshot.bid + response.snapshot.offer) / 2
      : response.snapshot?.bid ?? response.snapshot?.offer ?? null;

  if (priceFromBidOffer && priceFromBidOffer > 0) {
    return {
      changePercent: Number(response.snapshot?.percentageChange ?? 0),
      currency: resolveQuoteCurrency(response.instrument?.currencies),
      epic,
      fetchedAt: new Date().toISOString(),
      marketStatus: response.snapshot?.marketStatus ?? "UNKNOWN",
      name: response.instrument?.name ?? definition.symbol,
      price: Number(priceFromBidOffer.toFixed(6)),
    };
  }

  const fallbackResponse = await fetchIgJson<IgPricesResponse>(
    `/prices/${encodeURIComponent(epic)}/HOUR/4`,
    { version: "2" },
  );
  const fallbackSeries = extractSeriesFromPriceResponse(fallbackResponse);
  const fallbackPrice = fallbackSeries[fallbackSeries.length - 1] ?? 0;
  const fallbackPreviousPrice =
    fallbackSeries[fallbackSeries.length - 2] ?? fallbackPrice;
  const fallbackChangePercent =
    fallbackPreviousPrice > 0
      ? ((fallbackPrice - fallbackPreviousPrice) / fallbackPreviousPrice) * 100
      : Number(response.snapshot?.percentageChange ?? 0);
  const fetchedAt =
    parseIgTimestamp(
      fallbackResponse.prices?.[fallbackResponse.prices.length - 1]?.snapshotTimeUTC,
    ) ||
    parseIgTimestamp(
      fallbackResponse.prices?.[fallbackResponse.prices.length - 1]?.snapshotTime,
    ) ||
    new Date().toISOString();

  return {
    changePercent: Number(fallbackChangePercent.toFixed(2)),
    currency: resolveQuoteCurrency(response.instrument?.currencies),
    epic,
    fetchedAt,
    marketStatus: response.snapshot?.marketStatus ?? "UNKNOWN",
    name: response.instrument?.name ?? definition.symbol,
    price: Number(fallbackPrice.toFixed(6)),
  };
}

function buildSeriesQuote(
  definition: MarketDataAssetDefinition,
  providerSymbol: string,
  series: number[],
  fetchedAt: string,
): LiveAssetQuote {
  const latestPrice = series[series.length - 1] ?? 0;
  const previousPrice = series[series.length - 2] ?? latestPrice;
  const changePercent =
    previousPrice > 0 ? ((latestPrice - previousPrice) / previousPrice) * 100 : 0;

  return {
    symbol: definition.symbol,
    providerSymbol,
    price: latestPrice,
    changePercent,
    currency: "USD",
    series,
    fetchedAt,
  };
}

function buildCandlesFromPrices(
  definition: MarketDataAssetDefinition,
  providerSymbol: string,
  interval: SupportedChartInterval,
  priceResponse: IgPricesResponse,
): LiveCandleSeries {
  const candles = (priceResponse.prices ?? [])
    .map((price): LiveCandle | null => {
      const open = resolvePricePoint(price.openPrice);
      const high = resolvePricePoint(price.highPrice);
      const low = resolvePricePoint(price.lowPrice);
      const close = resolvePricePoint(price.closePrice);
      const timestamp =
        parseIgTimestamp(price.snapshotTimeUTC) ||
        parseIgTimestamp(price.snapshotTime) ||
        null;

      if (!timestamp || open === null || high === null || low === null || close === null) {
        return null;
      }

      return {
        datetime: timestamp.slice(0, 19).replace("T", " "),
        open,
        high,
        low,
        close,
        volume:
          typeof price.lastTradedVolume === "number" &&
          Number.isFinite(price.lastTradedVolume)
            ? price.lastTradedVolume
            : null,
      };
    })
    .filter((value): value is LiveCandle => Boolean(value));

  if (candles.length < 2) {
    throw new Error(`IG did not return enough historical candles for ${definition.symbol}.`);
  }

  return {
    symbol: definition.symbol,
    providerSymbol,
    interval,
    currency: "USD",
    candles,
    fetchedAt:
      parseIgTimestamp(priceResponse.prices?.[priceResponse.prices.length - 1]?.snapshotTimeUTC) ||
      new Date().toISOString(),
    proxyNote: definition.proxyNote,
  };
}

function extractSeriesFromPriceResponse(priceResponse: IgPricesResponse) {
  const series = (priceResponse.prices ?? [])
    .map((price) => resolvePricePoint(price.closePrice))
    .filter((value): value is number => value !== null && value > 0);

  if (series.length < 2) {
    throw new Error("IG did not return enough historical closes.");
  }

  return series;
}

async function fetchIgHistoricalPricesByEpic(
  epic: string,
  interval: SupportedChartInterval,
  outputsize: number,
) {
  const response = await fetchIgJson<IgPricesResponse>(
    `/prices/${encodeURIComponent(epic)}/${getResolutionForInterval(interval)}/${outputsize}`,
    { version: "2" },
  );

  return {
    epic,
    response,
  };
}

async function fetchIgHistoricalPrices(
  definition: MarketDataAssetDefinition,
  interval: SupportedChartInterval,
  outputsize: number,
) {
  const epic = await resolveMarketEpic(definition);
  return fetchIgHistoricalPricesByEpic(epic, interval, outputsize);
}

function updateChartWithSnapshot(
  chart: LiveCandleSeries,
  price: number,
  timestamp: string,
  outputsize: number,
) {
  const timestampMs = Date.parse(timestamp);

  if (!Number.isFinite(timestampMs) || chart.candles.length === 0) {
    return chart;
  }

  const nextCandles = [...chart.candles];
  const nextBucketStart = getBucketStart(timestampMs, chart.interval);
  const lastCandle = nextCandles[nextCandles.length - 1];
  const lastCandleTimestampMs = Date.parse(
    lastCandle.datetime.includes("T")
      ? lastCandle.datetime
      : `${lastCandle.datetime.replace(" ", "T")}Z`,
  );
  const lastBucketStart = Number.isFinite(lastCandleTimestampMs)
    ? getBucketStart(lastCandleTimestampMs, chart.interval)
    : nextBucketStart;

  if (nextBucketStart <= lastBucketStart) {
    const updatedLastCandle: LiveCandle = {
      ...lastCandle,
      close: price,
      high: Math.max(lastCandle.high, price),
      low: Math.min(lastCandle.low, price),
    };
    nextCandles[nextCandles.length - 1] = updatedLastCandle;
  } else {
    nextCandles.push({
      datetime: formatChartTimestamp(nextBucketStart),
      open: lastCandle.close,
      high: Math.max(lastCandle.close, price),
      low: Math.min(lastCandle.close, price),
      close: price,
      volume: null,
    });
  }

  return {
    ...chart,
    candles: nextCandles.slice(-outputsize),
    fetchedAt: timestamp,
  };
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No provider mapping is configured for ${symbol.toUpperCase()}.`);
  }

  const snapshot = await fetchIgMarketSnapshot(definition);

  return {
    symbol: definition.symbol,
    providerSymbol: snapshot.epic,
    price: snapshot.price,
    changePercent: snapshot.changePercent,
    currency: snapshot.currency,
    series: [],
    fetchedAt: snapshot.fetchedAt,
  } satisfies LiveAssetQuote;
}

export async function fetchLiveSeriesForSymbol(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No provider mapping is configured for ${symbol.toUpperCase()}.`);
  }

  const cachedSeries = daySeriesCache.get(definition.symbol);

  if (cachedSeries && Date.now() - cachedSeries.cachedAt < dailySeriesTtlMs) {
    return cachedSeries.quote;
  }

  const { epic, response } = await fetchIgHistoricalPrices(definition, "1day", 12);
  const series = extractSeriesFromPriceResponse(response);

  const quote = buildSeriesQuote(
    definition,
    epic,
    series,
    parseIgTimestamp(response.prices?.[response.prices.length - 1]?.snapshotTimeUTC) ||
      new Date().toISOString(),
  );

  daySeriesCache.set(definition.symbol, {
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
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No provider mapping is configured for ${symbol.toUpperCase()}.`);
  }

  const cacheKey = `${definition.symbol}:${interval}:${outputsize}`;
  const cachedChart = chartCache.get(cacheKey);

  try {
    const snapshot = await fetchIgMarketSnapshot(definition).catch(() => null);

    if (
      snapshot &&
      cachedChart &&
      Date.now() - cachedChart.cachedAt < chartSeedTtlMs &&
      cachedChart.chart.providerSymbol === snapshot.epic
    ) {
      const liveChart = updateChartWithSnapshot(
        cachedChart.chart,
        snapshot.price,
        snapshot.fetchedAt,
        outputsize,
      );

      chartCache.set(cacheKey, {
        cachedAt: Date.now(),
        chart: liveChart,
      });

      return liveChart;
    }

    const { epic, response } = snapshot
      ? await fetchIgHistoricalPricesByEpic(snapshot.epic, interval, outputsize)
      : await fetchIgHistoricalPrices(definition, interval, outputsize);
    const seededChart = buildCandlesFromPrices(definition, epic, interval, response);
    const liveChart = snapshot
      ? updateChartWithSnapshot(
          seededChart,
          snapshot.price,
          snapshot.fetchedAt,
          outputsize,
        )
      : seededChart;

    chartCache.set(cacheKey, {
      cachedAt: Date.now(),
      chart: liveChart,
    });

    return liveChart;
  } catch (error) {
    if (cachedChart) {
      return cachedChart.chart;
    }

    throw error;
  }
}

export { getConfiguredProviderName };
