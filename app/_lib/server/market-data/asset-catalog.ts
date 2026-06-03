import type { MarketDataAssetDefinition } from "./provider-types";

function readEpicOverride(symbol: string) {
  return process.env[`SIGNALIBRIUM_IG_EPIC_${symbol}`]?.trim() || null;
}

const assetCatalog: Record<string, MarketDataAssetDefinition> = {
  LINK: {
    symbol: "LINK",
    marketDataSource: "coingecko",
    coingeckoCoinId: "chainlink",
    igEpic: readEpicOverride("LINK"),
    searchTerms: ["Chainlink", "LINK"],
  },
  ONDO: {
    symbol: "ONDO",
    marketDataSource: "coingecko",
    coingeckoCoinId: "ondo-finance",
    igEpic: readEpicOverride("ONDO"),
    searchTerms: ["Ondo", "ONDO"],
  },
  RENDER: {
    symbol: "RENDER",
    marketDataSource: "coingecko",
    coingeckoCoinId: "render-token",
    igEpic: readEpicOverride("RENDER"),
    searchTerms: ["Render", "RENDER"],
  },
  AKT: {
    symbol: "AKT",
    marketDataSource: "coingecko",
    coingeckoCoinId: "akash-network",
    igEpic: readEpicOverride("AKT"),
    searchTerms: ["Akash Network", "AKT"],
  },
  AINF: {
    symbol: "AINF",
    marketDataSource: "yahoo",
    yahooSymbol: "AIQ",
    igEpic: readEpicOverride("AINF"),
    searchTerms: ["AIQ", "AIQ ETF"],
    proxyNote:
      "Using AIQ as a liquid listed proxy for the internal AI Infrastructure Index composite.",
  },
  NUKZ: {
    symbol: "NUKZ",
    marketDataSource: "yahoo",
    yahooSymbol: "NLR",
    igEpic: readEpicOverride("NUKZ"),
    searchTerms: ["NLR", "NLR ETF"],
    proxyNote:
      "Using NLR as a liquid listed proxy for the internal Nuclear Energy Index composite.",
  },
  URA: {
    symbol: "URA",
    marketDataSource: "yahoo",
    yahooSymbol: "URA",
    igEpic: readEpicOverride("URA"),
    searchTerms: ["URA", "Global X Uranium ETF"],
  },
  TKNX: {
    symbol: "TKNX",
    marketDataSource: "yahoo",
    yahooSymbol: "BLOK",
    igEpic: readEpicOverride("TKNX"),
    searchTerms: ["BLOK", "Amplify Transformational Data Sharing ETF"],
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
