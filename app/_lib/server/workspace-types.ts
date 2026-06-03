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

export type PersistedMarketEvent = {
  id: string;
  title: string;
  summary: string;
  impact: "High" | "Medium" | "Low";
  bias: "Bullish" | "Bearish" | "Neutral" | "Mixed";
  scope: "Macro" | "Sector" | "Asset" | "Liquidity";
  relatedSymbols: string[];
  startsAt: string;
  sourceLabel: string;
  sourceType: "News" | "Calendar" | "Policy" | "Flow";
  status: "Live" | "Upcoming" | "Recent";
  createdAt: string;
  updatedAt: string;
};

export type PersistedConfirmationCheck = {
  id: string;
  symbol: string;
  stance: "Long" | "Short" | "Neutral";
  summary: string;
  score: number;
  overallStatus: "Confirmed" | "Mixed" | "Rejected";
  linkedScannerResultId: string | null;
  checks: Array<{
    label: string;
    status: "Confirmed" | "Mixed" | "Rejected";
    detail: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type PersistedAiOpportunity = {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  title: string;
  summary: string;
  confidence: number;
  action: "Buy" | "Sell" | "Wait";
  entryPlan: string;
  stopPlan: string;
  targetPlan: string;
  expectedMove: string;
  invalidation: string;
  marketContext: string;
  newsContext: string;
  confirmationContext: string;
  linkedScannerResultId: string | null;
  linkedBacktestId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersistedWorkspaceData = {
  schemaVersion: 5;
  updatedAt: string;
  workspace: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  syncState: {
    sparklineCursor: number;
    intelligenceLastSyncedAt: string;
  };
  watchlists: PersistedWatchlist[];
  tradeTickets: PersistedTradeTicket[];
  journalEntries: PersistedJournalEntry[];
  assets: PersistedAssetRecord[];
  scannerResults: PersistedScannerResult[];
  backtests: PersistedBacktestRecord[];
  marketSnapshot: PersistedMarketSnapshot;
  marketEvents: PersistedMarketEvent[];
  confirmationChecks: PersistedConfirmationCheck[];
  aiOpportunities: PersistedAiOpportunity[];
};
