import type {
  MarketChartResponse,
  MarketIntelligenceSyncSummary,
  MarketDataPulseSummary,
  MarketDataSyncSummary,
} from "./market-data-contract";
import type {
  BrokerEnvironment,
  BrokerProvider,
  PersistedBrokerConnection,
  PersistedJournalEntry,
  PersistedScannerResult,
  SupportedDisplayCurrency,
  PersistedWatchlist,
} from "./server/workspace-types";
import type {
  AlpacaAccountData,
  OandaAccountData,
  BinanceAccountData,
  KrakenAccountData,
  BrokerOrderRequest,
  BrokerOrderResult,
  BrokerPosition,
} from "./server/broker-api";
import type { PersistedTradeTicket } from "./server/workspace-types";
import type { CreateTradeTicketInput, UpdateTradeTicketInput } from "./server/repositories/trade-tickets";

export type { BrokerOrderRequest, BrokerOrderResult, BrokerPosition };
export type { PersistedTradeTicket, CreateTradeTicketInput, UpdateTradeTicketInput };
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


// ── Journal / Trade Notes ─────────────────────────────────────────────────────

export type CreateJournalEntryInput = Partial<Omit<PersistedJournalEntry, "id" | "createdAt" | "updatedAt">>;

export async function listJournalEntriesApi() {
  return requestJson<{ entries: PersistedJournalEntry[] }>("/api/journal-entries");
}

export async function createJournalEntryApi(data: CreateJournalEntryInput) {
  return requestJson<{ entry: PersistedJournalEntry }>("/api/journal-entries", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateJournalEntryApi(id: string, patch: CreateJournalEntryInput) {
  return requestJson<{ entry: PersistedJournalEntry }>(`/api/journal-entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteJournalEntryApi(id: string) {
  return requestJson<{ success: boolean }>(`/api/journal-entries/${id}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
}


// ── Broker Connections ─────────────────────────────────────────────────────────

export type CreateBrokerConnectionInput = {
  provider: BrokerProvider;
  environment: BrokerEnvironment;
  label: string;
  apiKey: string;
  apiSecret?: string;
};

export type BrokerAccountPayload =
  | AlpacaAccountData
  | OandaAccountData
  | BinanceAccountData
  | KrakenAccountData;

export async function listBrokerConnectionsApi() {
  return requestJson<{ connections: PersistedBrokerConnection[] }>("/api/broker-connections");
}

export async function createBrokerConnectionApi(input: CreateBrokerConnectionInput) {
  return requestJson<{ connection: PersistedBrokerConnection }>("/api/broker-connections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteBrokerConnectionApi(connectionId: string) {
  return requestJson<{ success: true }>(`/api/broker-connections/${connectionId}`, {
    method: "DELETE",
  });
}

export async function verifyBrokerConnectionApi(connectionId: string) {
  return requestJson<{ connection: PersistedBrokerConnection; verified: boolean }>(
    `/api/broker-connections/${connectionId}/verify`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function fetchBrokerAccountApi(connectionId: string) {
  return requestJson<{ account: BrokerAccountPayload }>(
    `/api/broker-connections/${connectionId}/account`,
  );
}

/**
 * Starts an OAuth flow for the given provider + environment.
 * Returns { authUrl } — open this in a popup window.
 * May return { error, code: "oauth_not_configured" } if the server
 * doesn't have the required OAuth env vars set.
 */
export async function startBrokerOAuthApi(
  provider: BrokerProvider,
  environment: BrokerEnvironment,
): Promise<{ authUrl: string }> {
  return requestJson<{ authUrl: string }>(
    `/api/broker-connections/oauth/start?provider=${encodeURIComponent(provider)}&environment=${encodeURIComponent(environment)}`,
  );
}

// ── Broker positions ───────────────────────────────────────────────────────────

export async function fetchBrokerPositionsApi(
  connectionId: string,
): Promise<{ positions: BrokerPosition[]; fetchedAt: string }> {
  return requestJson<{ positions: BrokerPosition[]; fetchedAt: string }>(
    `/api/broker-connections/${connectionId}/positions`,
  );
}

// ── Broker orders ─────────────────────────────────────────────────────────────

export async function submitBrokerOrderApi(
  connectionId: string,
  order: BrokerOrderRequest,
): Promise<{ order: BrokerOrderResult }> {
  return requestJson<{ order: BrokerOrderResult }>(
    `/api/broker-connections/${connectionId}/orders`,
    { method: "POST", body: JSON.stringify(order) },
  );
}

// ── Trade tickets ─────────────────────────────────────────────────────────────

export async function listTradeTicketsApi(): Promise<{ tickets: PersistedTradeTicket[] }> {
  return requestJson<{ tickets: PersistedTradeTicket[] }>("/api/trade-tickets");
}

export async function createTradeTicketApi(
  input: CreateTradeTicketInput,
): Promise<{ ticket: PersistedTradeTicket }> {
  return requestJson<{ ticket: PersistedTradeTicket }>("/api/trade-tickets", {
    method: "POST",
    body:   JSON.stringify(input),
  });
}

export async function getTradeTicketApi(
  ticketId: string,
): Promise<{ ticket: PersistedTradeTicket }> {
  return requestJson<{ ticket: PersistedTradeTicket }>(`/api/trade-tickets/${ticketId}`);
}

export async function updateTradeTicketApi(
  ticketId: string,
  patch: UpdateTradeTicketInput,
): Promise<{ ticket: PersistedTradeTicket }> {
  return requestJson<{ ticket: PersistedTradeTicket }>(`/api/trade-tickets/${ticketId}`, {
    method: "PATCH",
    body:   JSON.stringify(patch),
  });
}

export async function deleteTradeTicketApi(ticketId: string): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/api/trade-tickets/${ticketId}`, {
    method: "DELETE",
  });
}

export async function submitTradeTicketApi(
  ticketId: string,
  options?: { connectionId?: string },
): Promise<{ ticket: PersistedTradeTicket; order: BrokerOrderResult }> {
  return requestJson<{ ticket: PersistedTradeTicket; order: BrokerOrderResult }>(
    `/api/trade-tickets/${ticketId}/submit`,
    { method: "POST", body: JSON.stringify(options ?? {}) },
  );
}

export async function cancelTradeTicketApi(
  ticketId: string,
): Promise<{ ticket: PersistedTradeTicket }> {
  return requestJson<{ ticket: PersistedTradeTicket }>(
    `/api/trade-tickets/${ticketId}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
