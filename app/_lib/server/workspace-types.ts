import type {
  Asset,
  BacktestSnapshot,
  JournalEntry,
  Setup,
  TradeTicket,
} from "@/app/_data/mock-data";

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

export type PersistedAssetRecord = Asset & {
  source: "seed" | "manual" | "sync";
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistedScannerResult = Setup & {
  thesis: string;
  linkedAssetSymbol: string;
  linkedBacktestId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersistedBacktestRecord = BacktestSnapshot & {
  timeframe: string;
  dateRange: string;
  startingCapital: number;
  feesBps: number;
  slippageBps: number;
  aiRead: string;
  status: "BACKTESTED" | "DRAFT";
  linkedAssetSymbol: string;
  linkedScannerResultId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersistedMarketSnapshot = {
  id: string;
  state: string;
  description: string;
  breadthScore: number;
  tradeableSetups: number;
  blockedSetups: number;
  watchlistMove: number;
  simulatedEquity: number;
  openRisk: number;
  lastRefresh: string;
  journalReminder: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistedWorkspaceData = {
  schemaVersion: 3;
  updatedAt: string;
  workspace: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  syncState: {
    sparklineCursor: number;
  };
  watchlists: PersistedWatchlist[];
  tradeTickets: PersistedTradeTicket[];
  journalEntries: PersistedJournalEntry[];
  assets: PersistedAssetRecord[];
  scannerResults: PersistedScannerResult[];
  backtests: PersistedBacktestRecord[];
  marketSnapshot: PersistedMarketSnapshot;
};
