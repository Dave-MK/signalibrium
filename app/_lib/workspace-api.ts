import type {
  MarketChartResponse,
  MarketIntelligenceSyncSummary,
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
