import { instrumentUniverse } from "@/app/_lib/instrument-universe";
import type { MarketDataAssetDefinition } from "./provider-types";

function readEpicOverride(symbol: string) {
  return process.env[`SIGNALIBRIUM_IG_EPIC_${symbol}`]?.trim() || null;
}

function readCoinbaseProductOverride(symbol: string) {
  return process.env[`SIGNALIBRIUM_COINBASE_PRODUCT_${symbol}`]?.trim() || null;
}

function readKrakenPairOverride(symbol: string) {
  return process.env[`SIGNALIBRIUM_KRAKEN_PAIR_${symbol}`]?.trim() || null;
}

function readBybitSymbolOverride(symbol: string) {
  return process.env[`SIGNALIBRIUM_BYBIT_SYMBOL_${symbol}`]?.trim() || null;
}

function readKucoinSymbolOverride(symbol: string) {
  return process.env[`SIGNALIBRIUM_KUCOIN_SYMBOL_${symbol}`]?.trim() || null;
}

function parseBybitWidgetSymbol(widgetSymbol: string) {
  if (!widgetSymbol.startsWith("BYBIT:")) {
    return null;
  }

  return widgetSymbol.split(":")[1]?.trim().toUpperCase() || null;
}

function parseKucoinWidgetSymbol(widgetSymbol: string) {
  if (!widgetSymbol.startsWith("KUCOIN:")) {
    return null;
  }

  const suffix = widgetSymbol.split(":")[1]?.trim().toUpperCase() || null;

  if (!suffix) {
    return null;
  }

  if (suffix.endsWith("USDT")) {
    return `${suffix.slice(0, -4)}-USDT`;
  }

  if (suffix.endsWith("USDC")) {
    return `${suffix.slice(0, -4)}-USDC`;
  }

  return suffix;
}

const assetCatalog: Record<string, MarketDataAssetDefinition> = Object.fromEntries(
  instrumentUniverse.map((entry) => [
    entry.symbol,
    {
      symbol: entry.symbol,
      marketDataSource: entry.marketDataSource,
      coinbaseProductId: readCoinbaseProductOverride(entry.symbol),
      krakenPair: readKrakenPairOverride(entry.symbol),
      bybitSymbol: readBybitSymbolOverride(entry.symbol) ?? parseBybitWidgetSymbol(entry.widgetSymbol),
      kucoinSymbol:
        readKucoinSymbolOverride(entry.symbol) ?? parseKucoinWidgetSymbol(entry.widgetSymbol),
      coingeckoCoinId: entry.coingeckoCoinId,
      yahooSymbol: entry.yahooSymbol,
      igEpic: readEpicOverride(entry.symbol),
      searchTerms: entry.searchTerms,
      proxyNote: entry.proxyNote,
    } satisfies MarketDataAssetDefinition,
  ]),
);

export function getMarketDataAssetDefinition(symbol: string) {
  return assetCatalog[symbol.toUpperCase()] ?? null;
}

export function listMarketDataAssetDefinitions() {
  return Object.values(assetCatalog);
}
