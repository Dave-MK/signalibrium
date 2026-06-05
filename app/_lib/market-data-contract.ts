import type {
  PersistedAiOpportunity,
  PersistedAssetRecord,
  PersistedConfirmationCheck,
  PersistedMarketEvent,
  PersistedMarketSnapshot,
} from "./server/workspace-types";
import type {
  LiveCandleSeries,
  SupportedChartInterval,
} from "./server/market-data/provider-types";
import type { MarketDataMeshSummary } from "./server/market-data/provider-architecture";

export type MarketDataSyncWarning = {
  symbol: string;
  message: string;
};

export type MarketDataSyncSummary = {
  provider: string;
  syncedAt: string;
  syncedSymbols: string[];
  skippedSymbols: string[];
  warnings: MarketDataSyncWarning[];
  assets: PersistedAssetRecord[];
  marketSnapshot: PersistedMarketSnapshot;
};

export type MarketDataPulseSummary = {
  provider: string;
  pulsedAt: string;
  pulsedSymbols: string[];
  skippedSymbols: string[];
  warnings: MarketDataSyncWarning[];
  assets: PersistedAssetRecord[];
  marketSnapshot: PersistedMarketSnapshot;
};

export type MarketChartResponse = {
  chart: LiveCandleSeries;
};

export type MarketDataProvidersResponse = {
  summary: MarketDataMeshSummary;
};

export type MarketIntelligenceSyncSummary = {
  provider: string;
  syncedAt: string;
  marketEvents: PersistedMarketEvent[];
  confirmationChecks: PersistedConfirmationCheck[];
  aiOpportunities: PersistedAiOpportunity[];
  warnings: Array<{
    source: string;
    message: string;
  }>;
};

export const supportedChartIntervals: SupportedChartInterval[] = [
  "15min",
  "1h",
  "4h",
  "1day",
];
