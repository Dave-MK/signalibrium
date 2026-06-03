export type TradingViewSymbolDefinition = {
  symbol: string;
  name: string;
  widgetSymbol: string;
  assetType: "crypto" | "stock";
  priceScale: number;
  note?: string;
};

const tradingViewSymbolCatalog: Record<string, TradingViewSymbolDefinition> = {
  LINK: {
    name: "Chainlink",
    symbol: "LINK",
    widgetSymbol: "COINBASE:LINKUSD",
    assetType: "crypto",
    priceScale: 100,
  },
  ONDO: {
    name: "Ondo Finance",
    symbol: "ONDO",
    widgetSymbol: "BYBIT:ONDOUSDT",
    assetType: "crypto",
    priceScale: 10_000,
    note:
      "ONDO is mapped to a liquid exchange pair for the advanced chart workspace. You can switch exchanges directly from the chart search if you prefer a different venue.",
  },
  RENDER: {
    name: "Render",
    symbol: "RENDER",
    widgetSymbol: "COINBASE:RENDERUSD",
    assetType: "crypto",
    priceScale: 100,
  },
  AKT: {
    name: "Akash Network",
    symbol: "AKT",
    widgetSymbol: "KUCOIN:AKTUSDT",
    assetType: "crypto",
    priceScale: 100,
    note:
      "AKT is mapped to a liquid exchange pair for the advanced chart workspace. You can switch exchanges directly from the chart search if you prefer a different venue.",
  },
  AINF: {
    name: "AI Infrastructure Proxy",
    symbol: "AINF",
    widgetSymbol: "AMEX:AIQ",
    assetType: "stock",
    priceScale: 100,
    note:
      "AINF uses AIQ inside the advanced chart workspace so you can work with a tradable market proxy while the internal composite stays intact elsewhere in the app.",
  },
  NUKZ: {
    name: "Nuclear Energy Proxy",
    symbol: "NUKZ",
    widgetSymbol: "AMEX:NLR",
    assetType: "stock",
    priceScale: 100,
    note:
      "NUKZ uses NLR inside the advanced chart workspace so you can work with a tradable market proxy while the internal composite stays intact elsewhere in the app.",
  },
  URA: {
    name: "Global X Uranium ETF",
    symbol: "URA",
    widgetSymbol: "AMEX:URA",
    assetType: "stock",
    priceScale: 100,
  },
  TKNX: {
    name: "Blockchain Innovators Proxy",
    symbol: "TKNX",
    widgetSymbol: "AMEX:BLOK",
    assetType: "stock",
    priceScale: 100,
    note:
      "TKNX uses BLOK inside the advanced chart workspace so you can work with a tradable market proxy while the internal composite stays intact elsewhere in the app.",
  },
};

export function getTradingViewSymbolDefinition(symbol: string) {
  return tradingViewSymbolCatalog[symbol.toUpperCase()] ?? null;
}

export function listTradingViewSymbolDefinitions() {
  return Object.values(tradingViewSymbolCatalog);
}

export function listTradingViewWatchlistSymbols() {
  return Object.values(tradingViewSymbolCatalog).map((item) => item.widgetSymbol);
}
