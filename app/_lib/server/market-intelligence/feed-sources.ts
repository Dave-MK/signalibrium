export type IntelligenceFeedSource = {
  id: string;
  scope: "Macro" | "Sector" | "Asset" | "Liquidity";
  sourceLabel: string;
  sourceType: "News" | "Calendar" | "Policy" | "Flow";
  url: string;
};

export const intelligenceFeedSources: IntelligenceFeedSource[] = [
  {
    id: "fed-press",
    scope: "Macro",
    sourceLabel: "Federal Reserve",
    sourceType: "Policy",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
  },
  {
    id: "ecb-press",
    scope: "Macro",
    sourceLabel: "European Central Bank",
    sourceType: "Policy",
    url: "https://www.ecb.europa.eu/rss/press.html",
  },
  {
    id: "boe-events",
    scope: "Macro",
    sourceLabel: "Bank of England Events",
    sourceType: "Calendar",
    url: "https://www.bankofengland.co.uk/rss/events",
  },
  {
    id: "boe-news",
    scope: "Macro",
    sourceLabel: "Bank of England News",
    sourceType: "Policy",
    url: "https://www.bankofengland.co.uk/rss/news",
  },
  {
    id: "nasdaq-markets",
    scope: "Sector",
    sourceLabel: "Nasdaq Markets",
    sourceType: "News",
    url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets",
  },
  {
    id: "nasdaq-crypto",
    scope: "Asset",
    sourceLabel: "Nasdaq Crypto",
    sourceType: "News",
    url: "https://www.nasdaq.com/feed/rssoutbound?category=Cryptocurrencies",
  },
];
