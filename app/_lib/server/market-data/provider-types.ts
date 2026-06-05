export type MarketDataProviderName = "ig" | "coinbase" | "kraken" | "coingecko" | "yahoo" | "hybrid";

export type MarketDataAssetDefinition = {
  symbol: string;
  marketDataSource?: "ig" | "coinbase" | "kraken" | "coingecko" | "yahoo";
  coinbaseProductId?: string | null;
  krakenPair?: string | null;
  coingeckoCoinId?: string;
  yahooSymbol?: string;
  igEpic?: string | null;
  searchTerms: string[];
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
  | "1min"
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
