import { instrumentUniverse } from "@/app/_lib/instrument-universe";
import type { MarketDataAssetDefinition } from "./provider-types";

function readEpicOverride(symbol: string) {
  return process.env[`SIGNALIBRIUM_IG_EPIC_${symbol}`]?.trim() || null;
}

const assetCatalog: Record<string, MarketDataAssetDefinition> = Object.fromEntries(
  instrumentUniverse.map((entry) => [
    entry.symbol,
    {
      symbol: entry.symbol,
      marketDataSource: entry.marketDataSource,
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
