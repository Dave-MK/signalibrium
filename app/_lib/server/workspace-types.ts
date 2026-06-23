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

export type BrokerProvider =
  // Traditional brokers (OAuth)
  | "Alpaca"
  | "OANDA"
  // Crypto exchanges (API key + HMAC)
  | "Binance"
  | "Kraken"
  // Coming soon
  | "IBKR";

export type BrokerEnvironment = "demo" | "live";
export type BrokerConnectionStatus = "connected" | "disconnected" | "error";

/** All execution modes that can be mapped to a real broker connection. */
export type BrokerExecutionMode =
  | "IBKR Demo"
  | "IBKR Live"
  | "Alpaca Demo"
  | "Alpaca Live"
  | "OANDA Demo"
  | "OANDA Live"
  | "Binance Spot"
  | "Binance Futures"
  | "Kraken Spot";

export type PersistedBrokerConnection = {
  id: string;
  provider: BrokerProvider;
  environment: BrokerEnvironment;
  label: string;
  status: BrokerConnectionStatus;
  accountRef: string | null;
  executionModes: BrokerExecutionMode[];
  lastError: string | null;
  lastSyncedAt: string | null;
  /** When true, Siggi's trades are automatically forwarded as live orders to this broker. */
  autoExecuteSiggi?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersistedTradeTicket = TradeTicket & {
  sourceAssetSymbol: string | null;
  sourceSetupId: string | null;
  notes: string;
  /** Which broker connection submitted this ticket — null for paper trades. */
  brokerConnectionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TradeNoteOutcome = "Win" | "Loss" | "Breakeven" | "Skipped";

export type PersistedJournalEntry = JournalEntry & {
  ticketId: string | null;
  /** Link to a PersistedPredictionHistoryRecord — set when reviewing a signal call */
  predictionId: string | null;
  /** Link to a PersistedSiggiTrade — set when reviewing an actual trade */
  tradeId: string | null;
  /** What kind of review this entry is */
  entryType: "trade_review" | "signal_review" | "general";
  /** What the chart/setup looked like when you took notice */
  whatISaw: string;
  /** Why you took it, or why you skipped it */
  reasoning: string;
  /** What you'd do differently next time */
  improvement: string;
  /** Quick emotion / discipline tags — e.g. "Patient", "FOMO", "Followed plan" */
  tags: string[];
  /** Self-assessed decision quality, 1–5 */
  rating: number | null;
  /** Would you take this exact trade again given the same information? */
  wouldTakeAgain: boolean | null;
  /** Outcome as you experienced it (separate from Siggi's automated result) */
  taggedOutcome: TradeNoteOutcome | null;
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

export type AiSignalVerdict = "Strong" | "Good" | "Marginal" | "Skip";

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
  /** AI-generated signal quality score (0–100). Null if Gemini is not configured. */
  aiScore?: number | null;
  /** AI verdict on whether to act on this setup. */
  aiVerdict?: AiSignalVerdict | null;
  /** AI reasoning narrative (2–3 sentences). */
  aiReasoning?: string | null;
  /** Specific patterns or confluences the AI identified. */
  aiPatterns?: string[] | null;
  /** Key risks or reasons for caution identified by the AI. */
  aiKeyRisks?: string[] | null;
  /** When the AI last scored this setup. */
  aiScoredAt?: string | null;
  /** Refined entry suggestion from the AI based on the raw candle tape (OB, FVG, S/R). Empty string = use computed zone. */
  aiEntryRefinement?: string | null;
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

export type PersistedPricePulsePoint = {
  at: string;
  price: number;
};

export type PersistedSiggiTrade = {
  id: string;
  predictionId: string;
  sourceScannerResultId: string | null;
  symbol: string;
  instrumentName: string;
  side: "BUY" | "SELL";
  status: "Open" | "Hit Target" | "Stopped" | "Breakeven";
  confidenceAtOpen: number;
  openedAt: string;
  closedAt: string | null;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  stopMode: "Initial" | "Breakeven" | "Trailing";
  initialStopPrice: number;
  partialExitDone: boolean;
  partialExitTp2Done?: boolean;
  stakeGbp: number;
  stakeUsd: number;
  quantity: number;
  /** Broker connection used for live execution (null = paper trade only). */
  brokerConnectionId?: string | null;
  /** Entry order ID returned by the broker. */
  brokerOrderId?: string | null;
  /** Close order ID returned by the broker (set when Siggi closes the position). */
  brokerCloseOrderId?: string | null;
  /** Siggi's Read verdict at the time this trade was opened. Used to measure AI accuracy over time. */
  aiVerdictAtOpen?: AiSignalVerdict | null;
  currentPriceUsd: number | null;
  unrealizedPnlGbp: number | null;
  unrealizedPnlUsd: number | null;
  peakUnrealizedPnlGbp: number;
  realizedPnlGbp: number | null;
  realizedPnlUsd: number | null;
  lastMarkedAt: string | null;
  narrative: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistedSiggiEquitySnapshot = {
  at: string;
  cashBalanceGbp: number;
  equityGbp: number;
  openTrades: number;
};

export type PersistedSiggiActivity = {
  id: string;
  at: string;
  type: "Opened" | "Closed" | "Partial Exit" | "Skipped" | "Stop Moved" | "Reset";
  symbol: string | null;
  detail: string;
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
  equityCurve: PersistedSiggiEquitySnapshot[];
  activityLog: PersistedSiggiActivity[];
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
  resolutionMethod:
    | "snapshot"
    | "candle-range"
    | "lower-timeframe-drilldown"
    | "pulse-tape"
    | "sequence-inference";
  ambiguousResolution: boolean;
  outcome:
    | "Hit Target"
    | "Stopped"
    | "Breakeven"
    | "Ambiguous"
    | "Recovered Late"
    | "Stayed Flat"
    | "Skipped Correctly"
    | "Monitoring";
  outcomeAccuracy: "Accurate" | "Inaccurate" | "Neutral";
  moveFromCallPct: number;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
  accuracyScore: number;
  resolutionEvidence: string | null;
  resolvedSource: "live_trade" | "seed_replay" | "candle_range" | "price_snapshot" | null;
  tradedStatus: "traded" | "skipped" | "not_traded" | null;
  /** Why Siggi skipped this prediction — set when tradedStatus === "skipped" */
  siggiSkipReason: string | null;
  narrative: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistedPriceAlert = {
  id: string;
  symbol: string;
  /** Human-readable label, e.g. "Gold breaks 2400" */
  label: string;
  condition: "above" | "below";
  targetPrice: number;
  enabled: boolean;
  /** Set when the alert fires — null while still watching */
  triggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * AI-generated performance learnings derived from Siggi's closed trades.
 * Refreshed automatically whenever new trades close.
 */
export type PersistedTradeLearnings = {
  /** ISO timestamp of when this analysis was generated. */
  generatedAt: string;
  /** How many closed trades were analysed to produce this. */
  tradesAnalyzed: number;
  /** One-sentence summary of what Siggi's current edge looks like. */
  currentEdge: string;
  /** Patterns and conditions that have been correlating with wins. */
  winPatterns: string[];
  /** Patterns and conditions that have been correlating with losses — avoid these. */
  lossPatterns: string[];
  /** Active risk warnings to flag when a new signal matches a danger pattern. */
  riskWarnings: string[];
  /** How well the AI verdicts (Strong/Good/Marginal/Skip) predicted outcomes. */
  verdictCalibration: string;
  /** Overall confidence in the current edge given recent results. */
  overallConfidence: "High" | "Moderate" | "Low";
};

/** Siggi risk guard-rails — persisted per-workspace so they survive deploys. */
export type PersistedRiskControls = {
  /** Max risk per trade as a fraction of equity (default 0.02 = 2%). */
  maxRiskPerTrade: number;
  /** Minimum cash buffer as a fraction of equity (default 0.05 = 5%). */
  minCashReserveRatio: number;
  /** Maximum number of concurrent open trades (default 20). */
  maxConcurrentTrades: number;
  /** Daily loss limit as a fraction of equity — null means no limit (default null). */
  dailyLossLimitRatio: number | null;
  /** Hard absolute position cap per trade in GBP — null means no cap (default null). */
  maxPositionSizeGbp: number | null;
};

export const DEFAULT_RISK_CONTROLS: PersistedRiskControls = {
  maxRiskPerTrade:      0.02,
  minCashReserveRatio:  0.05,
  maxConcurrentTrades:  20,
  dailyLossLimitRatio:  null,
  maxPositionSizeGbp:   null,
};

export type PersistedWorkspaceData = {
  schemaVersion: 16;
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
    pricePulseLastSyncedAt: string;
    pricePulseTape: Record<string, PersistedPricePulsePoint[]>;
    /** ISO timestamp of the last daily-loss-limit breach notification — prevents spam. */
    dailyLossLimitNotifiedAt: string | null;
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
  priceAlerts: PersistedPriceAlert[];
  riskControls: PersistedRiskControls;
  /** AI-generated learnings from Siggi's closed trades — null until enough trades close. */
  tradeLearnings: PersistedTradeLearnings | null;
};
