import type {
  PersistedAssetRecord,
  PersistedMarketSnapshot,
} from "./server/workspace-types";
import type {
  LiveCandleSeries,
  SupportedChartInterval,
} from "./server/market-data/provider-types";

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

export type MarketChartResponse = {
  chart: LiveCandleSeries;
};

export const supportedChartIntervals: SupportedChartInterval[] = [
  "15min",
  "1h",
  "4h",
  "1day",
];
