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

export type BrokerProvider = "IBKR";
export type BrokerEnvironment = "demo" | "live";
export type BrokerConnectionStatus = "connected" | "disconnected" | "error";

export type PersistedBrokerConnection = {
  id: string;
  provider: BrokerProvider;
  environment: BrokerEnvironment;
  label: string;
  status: BrokerConnectionStatus;
  accountRef: string | null;
  executionModes: Array<Extract<TradeTicket["executionMode"], "IBKR Demo" | "IBKR Live">>;
  lastError: string | null;
  lastSyncedAt: string | null;
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

export type OpportunityAnalysisStatus = "Ranked" | "Analysing" | "Analysed";

export type OpportunityAnalysisSnapshot = {
  bias: string;
  weeklyOutlook: string;
  regimeSummary: string;
  indicatorSummary: string;
  indicatorSweep: Array<{
    label: string;
    status: "Bullish" | "Bearish" | "Neutral";
    detail: string;
    value: string;
  }>;
  multiTimeframeSummary: string;
  multiTimeframeChecks: Array<{
    label: string;
    timeframe: string;
    status: "Aligned" | "Mixed" | "Contrary";
    detail: string;
  }>;
  timeframeAgreementScore: number;
  strategyChecks: Array<{
    label: string;
    status: "Confirmed" | "Mixed" | "Rejected";
    detail: string;
  }>;
  validationSummary: string;
  trendPattern: string;
  trendlineSummary: string;
  supportLevels: string[];
  resistanceLevels: string[];
  demandZone: string;
  supplyZone: string;
  consolidation: string;
  entryGuidance: string;
  stopGuidance: string;
  targetGuidance: string;
  executionNotes: string[];
  analyzedAt: string;
  timeframe: string;
  chartAnnotations: {
    supportLevels: number[];
    resistanceLevels: number[];
    demandZone: {
      low: number;
      high: number;
    };
    supplyZone: {
      low: number;
      high: number;
    };
    consolidationRange: {
      low: number;
      high: number;
    } | null;
    trendline: {
      startIndex: number;
      startPrice: number;
      endIndex: number;
      endPrice: number;
      direction: "up" | "down";
    } | null;
    entryZone: {
      low: number;
      high: number;
    };
    stopLevel: number;
    targetLevel: number;
  };
};

export type PersistedScannerResult = Setup & {
  thesis: string;
  linkedAssetSymbol: string;
  linkedBacktestId: string | null;
  analysisStatus: OpportunityAnalysisStatus;
  analysisUpdatedAt: string | null;
  analysis: OpportunityAnalysisSnapshot | null;
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

export type SupportedDisplayCurrency = "GBP" | "USD" | "EUR";

export type PersistedSiggiTrade = {
  id: string;
  predictionId: string;
  sourceScannerResultId: string | null;
  symbol: string;
  instrumentName: string;
  side: "BUY" | "SELL";
  status: "Open" | "Hit Target" | "Stopped";
  confidenceAtOpen: number;
  openedAt: string;
  closedAt: string | null;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  stakeGbp: number;
  stakeUsd: number;
  quantity: number;
  realizedPnlGbp: number | null;
  realizedPnlUsd: number | null;
  narrative: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistedSiggiAccount = {
  id: string;
  botName: string;
  baseCurrency: "GBP";
  startingBalanceGbp: number;
  cashBalanceGbp: number;
  highWatermarkGbp: number;
  resetCount: number;
  successfulTrades: number;
  failedTrades: number;
  openTrades: PersistedSiggiTrade[];
  closedTrades: PersistedSiggiTrade[];
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersistedPredictionHistoryRecord = {
  id: string;
  symbol: string;
  instrumentName: string;
  assetClass: Asset["assetClass"];
  strategyAtCall: string;
  timeframe: string;
  horizon: "Day" | "Week" | "Month";
  sourceScannerResultId: string | null;
  trendAtCall: "Bullish" | "Bearish" | "Neutral";
  actionAtCall: "BUY" | "SELL" | "WAIT";
  decisionAtCall: "ENTER NOW" | "WAIT";
  confidenceAtCall: number;
  monitoringStatus: "Active" | "Resolved";
  priceAtCall: number;
  entryLowAtCall: number;
  entryHighAtCall: number;
  stopPriceAtCall: number;
  targetPriceAtCall: number;
  entryAtCall: string;
  discountedEntryAtCall: string;
  stopAtCall: string;
  targetAtCall: string;
  eventMoveAtCall: "Rise" | "Fall" | "Whipsaw";
  eventLikelihoodAtCall: number;
  eventIdsAtCall: string[];
  eventTitlesAtCall: string[];
  eventContextAtCall: string;
  patternSnapshotAtCall: string;
  indicatorSnapshotAtCall: string[];
  strategySnapshotAtCall: string[];
  validationSnapshotAtCall: string[];
  calledAt: string;
  lastCandleCheckAt: string | null;
  resolvedAt: string | null;
  resolutionMethod: "snapshot" | "candle-range" | "lower-timeframe-drilldown";
  ambiguousResolution: boolean;
  outcome: "Hit Target" | "Stopped" | "Recovered Late" | "Stayed Flat" | "Skipped Correctly" | "Monitoring";
  outcomeAccuracy: "Accurate" | "Inaccurate" | "Neutral";
  moveFromCallPct: number;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
  accuracyScore: number;
  narrative: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistedWorkspaceData = {
  schemaVersion: 10;
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
  brokerConnections: PersistedBrokerConnection[];
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
  predictionHistory: PersistedPredictionHistoryRecord[];
  siggiAccount: PersistedSiggiAccount;
};
