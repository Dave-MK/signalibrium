import {
  getMarketDataAssetDefinition,
  listMarketDataAssetDefinitions,
} from "./asset-catalog";
import * as bybit from "./bybit";
import * as coinbase from "./coinbase";
import * as coingecko from "./coingecko";
import * as ig from "./ig";
import * as kraken from "./kraken";
import * as kucoin from "./kucoin";
import * as yahoo from "./yahoo";
import type {
  LiveAssetQuote,
  MarketDataProviderName,
  SupportedChartInterval,
} from "./provider-types";

function resolveDataSource(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);

  if (!definition) {
    throw new Error(`No provider mapping is configured for ${symbol.toUpperCase()}.`);
  }

  return definition.marketDataSource ?? "ig";
}

function getLastPositiveSeriesPrice(series: number[]) {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];

    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function normalizeLiveQuote(quote: LiveAssetQuote) {
  if (Number.isFinite(quote.price) && quote.price > 0) {
    return quote;
  }

  const recoveredPrice = getLastPositiveSeriesPrice(quote.series);

  if (recoveredPrice !== null) {
    return {
      ...quote,
      price: recoveredPrice,
    };
  }

  throw new Error(`No usable live quote was returned for ${quote.symbol}.`);
}

async function fetchValidatedQuote(
  fetcher: (symbol: string) => Promise<LiveAssetQuote>,
  symbol: string,
) {
  return normalizeLiveQuote(await fetcher(symbol));
}

export function getConfiguredProviderName(): MarketDataProviderName {
  const sources = new Set(
    listMarketDataAssetDefinitions().map((definition) => definition.marketDataSource ?? "ig"),
  );

  if (sources.size > 1) {
    return "hybrid";
  }

  if (sources.has("coinbase")) {
    return "coinbase";
  }

  if (sources.has("kraken")) {
    return "kraken";
  }

  if (sources.has("bybit")) {
    return "bybit";
  }

  if (sources.has("kucoin")) {
    return "kucoin";
  }

  return sources.has("coingecko") ? "coingecko" : "ig";
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const dataSource = resolveDataSource(symbol);

  if (dataSource === "coinbase") {
    try {
      return await fetchValidatedQuote(coinbase.fetchLiveQuoteForSymbol, symbol);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.symbol) {
        try {
          return await fetchValidatedQuote(kraken.fetchLiveQuoteForSymbol, symbol);
        } catch {
          if (definition.bybitSymbol) {
            try {
              return await fetchValidatedQuote(bybit.fetchLiveQuoteForSymbol, symbol);
            } catch {
              if (definition.kucoinSymbol) {
                try {
                  return await fetchValidatedQuote(kucoin.fetchLiveQuoteForSymbol, symbol);
                } catch {
                  // Fall through to aggregator fallback below.
                }
              }
            }
          }
        }
      }

      if (definition?.coingeckoCoinId) {
        return fetchValidatedQuote(coingecko.fetchLiveQuoteForSymbol, symbol);
      }

      throw error;
    }
  }

  if (dataSource === "kraken") {
    try {
      return await fetchValidatedQuote(kraken.fetchLiveQuoteForSymbol, symbol);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.bybitSymbol) {
        try {
          return await fetchValidatedQuote(bybit.fetchLiveQuoteForSymbol, symbol);
        } catch {
          if (definition?.kucoinSymbol) {
            try {
              return await fetchValidatedQuote(kucoin.fetchLiveQuoteForSymbol, symbol);
            } catch {
              // Fall through to aggregator fallback below.
            }
          }
        }
      }

      if (definition?.coingeckoCoinId) {
        return fetchValidatedQuote(coingecko.fetchLiveQuoteForSymbol, symbol);
      }

      throw error;
    }
  }

  if (dataSource === "bybit") {
    try {
      return await fetchValidatedQuote(bybit.fetchLiveQuoteForSymbol, symbol);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.coingeckoCoinId) {
        return fetchValidatedQuote(coingecko.fetchLiveQuoteForSymbol, symbol);
      }

      throw error;
    }
  }

  if (dataSource === "kucoin") {
    try {
      return await fetchValidatedQuote(kucoin.fetchLiveQuoteForSymbol, symbol);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.coingeckoCoinId) {
        return fetchValidatedQuote(coingecko.fetchLiveQuoteForSymbol, symbol);
      }

      throw error;
    }
  }

  if (dataSource === "coingecko") {
    return fetchValidatedQuote(coingecko.fetchLiveQuoteForSymbol, symbol);
  }

  if (dataSource === "yahoo") {
    return fetchValidatedQuote(yahoo.fetchLiveQuoteForSymbol, symbol);
  }

  return fetchValidatedQuote(ig.fetchLiveQuoteForSymbol, symbol);
}

export async function fetchLiveCandlesForSymbol(
  symbol: string,
  interval: SupportedChartInterval,
  outputsize = 48,
) {
  const dataSource = resolveDataSource(symbol);

  if (dataSource === "coinbase") {
    try {
      return await coinbase.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.symbol) {
        try {
          return await kraken.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
        } catch {
          if (definition.bybitSymbol) {
            try {
              return await bybit.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
            } catch {
              if (definition.kucoinSymbol) {
                try {
                  return await kucoin.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
                } catch {
                  // Fall through to aggregator fallback below.
                }
              }
            }
          }
        }
      }

      if (definition?.coingeckoCoinId) {
        return coingecko.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
      }

      throw error;
    }
  }

  if (dataSource === "kraken") {
    try {
      return await kraken.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.bybitSymbol) {
        try {
          return await bybit.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
        } catch {
          if (definition?.kucoinSymbol) {
            try {
              return await kucoin.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
            } catch {
              // Fall through to aggregator fallback below.
            }
          }
        }
      }

      if (definition?.coingeckoCoinId) {
        return coingecko.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
      }

      throw error;
    }
  }

  if (dataSource === "bybit") {
    try {
      return await bybit.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.coingeckoCoinId) {
        return coingecko.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
      }

      throw error;
    }
  }

  if (dataSource === "kucoin") {
    try {
      return await kucoin.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.coingeckoCoinId) {
        return coingecko.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
      }

      throw error;
    }
  }

  if (dataSource === "coingecko") {
    return coingecko.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
  }

  if (dataSource === "yahoo") {
    return yahoo.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
  }

  return ig.fetchLiveCandlesForSymbol(symbol, interval, outputsize);
}
