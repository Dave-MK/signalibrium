export type MarketDataProviderName = "twelvedata";

export type SupportedProviderInstrumentType =
  | "Digital Currency"
  | "ETF"
  | "Common Stock";

export type MarketDataAssetDefinition = {
  symbol: string;
  providerSymbol: string | null;
  providerType: SupportedProviderInstrumentType | null;
  proxyNote?: string;
};

export type LiveAssetQuote = {
  symbol: string;
  providerSymbol: string;
  price: number;
  changePercent: number;
  currency: string;
  series: number[];
  fetchedAt: string;
};

export type SupportedChartInterval =
  | "15min"
  | "1h"
  | "4h"
  | "1day";

export type LiveCandle = {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type LiveCandleSeries = {
  symbol: string;
  providerSymbol: string;
  interval: SupportedChartInterval;
  currency: string;
  candles: LiveCandle[];
  fetchedAt: string;
  proxyNote?: string;
  chartNote?: string;
};
