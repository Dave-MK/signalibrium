import type {
  MarketChartResponse,
  MarketIntelligenceSyncSummary,
  MarketDataPulseSummary,
  MarketDataSyncSummary,
} from "./market-data-contract";
import type {
  PersistedScannerResult,
  SupportedDisplayCurrency,
  PersistedWatchlist,
} from "./server/workspace-types";
import type { SupportedChartInterval } from "./server/market-data/provider-types";

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

export type CreateWatchlistInput = {
  name: string;
  description: string;
  itemSymbols: string[];
  isDefault: boolean;
};

export type UpdateWatchlistInput = Partial<CreateWatchlistInput>;

export async function fetchWatchlists() {
  const payload = await requestJson<{ watchlists: PersistedWatchlist[] }>("/api/watchlists");
  return payload.watchlists;
}

export async function createWatchlist(input: CreateWatchlistInput) {
  const payload = await requestJson<{ watchlist: PersistedWatchlist }>("/api/watchlists", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload.watchlist;
}

export async function updateWatchlist(watchlistId: string, input: UpdateWatchlistInput) {
  const payload = await requestJson<{ watchlist: PersistedWatchlist }>(
    `/api/watchlists/${watchlistId}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );

  return payload.watchlist;
}

export async function deleteWatchlist(watchlistId: string) {
  await requestJson<{ success: true }>(`/api/watchlists/${watchlistId}`, {
    method: "DELETE",
  });
}

export async function syncMarketData() {
  const payload = await requestJson<{ summary: MarketDataSyncSummary }>(
    "/api/market-data/sync",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return payload.summary;
}

export async function pulseMarketData() {
  const payload = await requestJson<{ summary: MarketDataPulseSummary }>(
    "/api/market-data/pulse",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return payload.summary;
}

export async function syncMarketIntelligence() {
  const payload = await requestJson<{ summary: MarketIntelligenceSyncSummary }>(
    "/api/market-intelligence/sync",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return payload.summary;
}

export async function analyzeScannerResult(resultId: string) {
  const payload = await requestJson<{ scannerResult: PersistedScannerResult }>(
    `/api/scanner-results/${resultId}/analyze`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return payload.scannerResult;
}

/** Analyse a single stale result — called by the background intelligence loop every 2 minutes. */
export async function analyzeStaleResults() {
  return requestJson<{ analysed: number; symbols?: string[]; reason?: string }>(
    "/api/scanner-results/analyze-stale",
    { method: "POST", body: JSON.stringify({}) },
  );
}

/** Analyse every stale result in one go — called by the manual "Refresh all" button. */
export async function analyzeAllStale() {
  return requestJson<{ analysed: number; symbols?: string[]; errors?: string[] }>(
    `/api/scanner-results/analyze-stale?count=all`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function fetchMarketChart(
  symbol: string,
  interval: SupportedChartInterval,
  outputsize = 48,
) {
  const searchParams = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(outputsize),
  });
  const payload = await requestJson<MarketChartResponse>(
    `/api/market-data/chart?${searchParams.toString()}`,
  );

  return payload.chart;
}

export async function resetSiggiAccount() {
  return requestJson<{ success: boolean; startingBalanceGbp: number; resetAt: string }>(
    "/api/siggi/reset",
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function resetPredictionHistory(wipeAll = false) {
  return requestJson<{
    success: boolean;
    wipeAll: boolean;
    recordsBefore: number;
    recordsKept: number;
    recordsRemoved: number;
  }>(
    `/api/predictions/reset${wipeAll ? "?wipeAll=true" : ""}`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function updateDisplayCurrency(currency: SupportedDisplayCurrency) {
  const payload = await requestJson<{ currency: SupportedDisplayCurrency }>(
    "/api/preferences/currency",
    {
      method: "POST",
      body: JSON.stringify({ currency }),
    },
  );

  return payload.currency;
}
