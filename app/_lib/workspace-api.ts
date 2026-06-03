import type {
  MarketChartResponse,
  MarketIntelligenceSyncSummary,
  MarketDataSyncSummary,
} from "./market-data-contract";
import type {
  PersistedJournalEntry,
  PersistedTradeTicket,
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

export type CreateTradeTicketInput = Omit<
  PersistedTradeTicket,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateTradeTicketInput = Partial<CreateTradeTicketInput>;

export async function fetchTradeTickets() {
  const payload = await requestJson<{ tradeTickets: PersistedTradeTicket[] }>(
    "/api/trade-tickets",
  );
  return payload.tradeTickets;
}

export async function fetchTradeTicket(ticketId: string) {
  const payload = await requestJson<{ tradeTicket: PersistedTradeTicket }>(
    `/api/trade-tickets/${ticketId}`,
  );
  return payload.tradeTicket;
}

export async function createTradeTicket(input: CreateTradeTicketInput) {
  const payload = await requestJson<{ tradeTicket: PersistedTradeTicket }>(
    "/api/trade-tickets",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return payload.tradeTicket;
}

export async function updateTradeTicket(ticketId: string, input: UpdateTradeTicketInput) {
  const payload = await requestJson<{ tradeTicket: PersistedTradeTicket }>(
    `/api/trade-tickets/${ticketId}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );

  return payload.tradeTicket;
}

export async function deleteTradeTicket(ticketId: string) {
  await requestJson<{ success: true }>(`/api/trade-tickets/${ticketId}`, {
    method: "DELETE",
  });
}

export async function submitTradeTicket(ticketId: string) {
  const payload = await requestJson<{ tradeTicket: PersistedTradeTicket }>(
    `/api/trade-tickets/${ticketId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return payload.tradeTicket;
}

export async function fillTradeTicket(ticketId: string) {
  const payload = await requestJson<{ tradeTicket: PersistedTradeTicket }>(
    `/api/trade-tickets/${ticketId}/fill`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return payload.tradeTicket;
}

export async function cancelTradeTicket(ticketId: string) {
  const payload = await requestJson<{ tradeTicket: PersistedTradeTicket }>(
    `/api/trade-tickets/${ticketId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return payload.tradeTicket;
}

export async function closeTradeTicket(ticketId: string) {
  const payload = await requestJson<{ tradeTicket: PersistedTradeTicket }>(
    `/api/trade-tickets/${ticketId}/close`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return payload.tradeTicket;
}

export type CreateJournalEntryInput = Omit<
  PersistedJournalEntry,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateJournalEntryInput = Partial<CreateJournalEntryInput>;

export async function fetchJournalEntries() {
  const payload = await requestJson<{ journalEntries: PersistedJournalEntry[] }>(
    "/api/journal-entries",
  );
  return payload.journalEntries;
}

export async function createJournalEntry(input: CreateJournalEntryInput) {
  const payload = await requestJson<{ journalEntry: PersistedJournalEntry }>(
    "/api/journal-entries",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return payload.journalEntry;
}

export async function updateJournalEntry(entryId: string, input: UpdateJournalEntryInput) {
  const payload = await requestJson<{ journalEntry: PersistedJournalEntry }>(
    `/api/journal-entries/${entryId}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );

  return payload.journalEntry;
}

export async function deleteJournalEntry(entryId: string) {
  await requestJson<{ success: true }>(`/api/journal-entries/${entryId}`, {
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
