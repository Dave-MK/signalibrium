import type { MarketDataAssetDefinition } from "./provider-types";

const assetCatalog: Record<string, MarketDataAssetDefinition> = {
  LINK: {
    symbol: "LINK",
    providerSymbol: "LINK/USD",
    providerType: "Digital Currency",
  },
  ONDO: {
    symbol: "ONDO",
    providerSymbol: "ONDO/USD",
    providerType: "Digital Currency",
  },
  RENDER: {
    symbol: "RENDER",
    providerSymbol: "RENDER/USD",
    providerType: "Digital Currency",
  },
  AKT: {
    symbol: "AKT",
    providerSymbol: "AKT/USD",
    providerType: "Digital Currency",
  },
  AINF: {
    symbol: "AINF",
    providerSymbol: "AIQ",
    providerType: "ETF",
    proxyNote:
      "Using AIQ as a liquid listed proxy for the internal AI Infrastructure Index composite.",
  },
  NUKZ: {
    symbol: "NUKZ",
    providerSymbol: "NLR",
    providerType: "ETF",
    proxyNote:
      "Using NLR as a liquid listed proxy for the internal Nuclear Energy Index composite.",
  },
  URA: {
    symbol: "URA",
    providerSymbol: "URA",
    providerType: "ETF",
  },
  TKNX: {
    symbol: "TKNX",
    providerSymbol: "BLOK",
    providerType: "ETF",
    proxyNote:
      "Using BLOK as a liquid listed proxy for the internal Tokenisation Leaders ETF composite.",
  },
};

export function getMarketDataAssetDefinition(symbol: string) {
  return assetCatalog[symbol.toUpperCase()] ?? null;
}

export function listMarketDataAssetDefinitions() {
  return Object.values(assetCatalog);
}
