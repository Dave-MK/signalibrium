import { instrumentUniverse } from "@/app/_lib/instrument-universe";

export type TradingViewSymbolDefinition = {
  symbol: string;
  name: string;
  widgetSymbol: string;
  assetType: "crypto" | "stock";
  priceScale: number;
  note?: string;
};

const tradingViewSymbolCatalog: Record<string, TradingViewSymbolDefinition> = Object.fromEntries(
  instrumentUniverse.map((entry) => [
    entry.symbol,
    {
      name: entry.name,
      symbol: entry.symbol,
      widgetSymbol: entry.widgetSymbol,
      assetType: entry.assetClass === "Crypto" ? "crypto" : "stock",
      priceScale: entry.priceScale,
      note: entry.proxyNote,
    } satisfies TradingViewSymbolDefinition,
  ]),
);

export function getTradingViewSymbolDefinition(symbol: string) {
  return tradingViewSymbolCatalog[symbol.toUpperCase()] ?? null;
}

export function listTradingViewSymbolDefinitions() {
  return Object.values(tradingViewSymbolCatalog);
}

export function listTradingViewWatchlistSymbols() {
  return Object.values(tradingViewSymbolCatalog).map((item) => item.widgetSymbol);
}
