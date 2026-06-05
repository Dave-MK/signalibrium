import {
  getMarketDataAssetDefinition,
  listMarketDataAssetDefinitions,
} from "./asset-catalog";
import * as coinbase from "./coinbase";
import * as coingecko from "./coingecko";
import * as ig from "./ig";
import * as kraken from "./kraken";
import * as yahoo from "./yahoo";
import type {
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

  return sources.has("coingecko") ? "coingecko" : "ig";
}

export async function fetchLiveQuoteForSymbol(symbol: string) {
  const dataSource = resolveDataSource(symbol);

  if (dataSource === "coinbase") {
    try {
      return await coinbase.fetchLiveQuoteForSymbol(symbol);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.symbol) {
        try {
          return await kraken.fetchLiveQuoteForSymbol(symbol);
        } catch {
          // Fall through to aggregator fallback below.
        }
      }

      if (definition?.coingeckoCoinId) {
        return coingecko.fetchLiveQuoteForSymbol(symbol);
      }

      throw error;
    }
  }

  if (dataSource === "kraken") {
    try {
      return await kraken.fetchLiveQuoteForSymbol(symbol);
    } catch (error) {
      const definition = getMarketDataAssetDefinition(symbol);

      if (definition?.coingeckoCoinId) {
        return coingecko.fetchLiveQuoteForSymbol(symbol);
      }

      throw error;
    }
  }

  if (dataSource === "coingecko") {
    return coingecko.fetchLiveQuoteForSymbol(symbol);
  }

  if (dataSource === "yahoo") {
    return yahoo.fetchLiveQuoteForSymbol(symbol);
  }

  return ig.fetchLiveQuoteForSymbol(symbol);
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
          // Fall through to aggregator fallback below.
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
