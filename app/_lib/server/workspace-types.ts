import type { JournalEntry, TradeTicket } from "@/app/_data/mock-data";

export type PersistedWatchlist = {
  id: string;
  name: string;
  description: string;
  itemSymbols: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersistedTradeTicket = TradeTicket & {
  sourceAssetSymbol: string | null;
  sourceSetupId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistedJournalEntry = JournalEntry & {
  ticketId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersistedWorkspaceData = {
  schemaVersion: 1;
  updatedAt: string;
  workspace: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  watchlists: PersistedWatchlist[];
  tradeTickets: PersistedTradeTicket[];
  journalEntries: PersistedJournalEntry[];
};
