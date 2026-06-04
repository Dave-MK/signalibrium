import type { Asset } from "@/app/_data/mock-data";

type AssetClass = Asset["assetClass"];

export type BrokerFeeProfile = {
  id: string;
  label: string;
  executionStatus: "Connected" | "Planned" | "External";
  supportedAssetClasses: AssetClass[];
  lowestFeeFor: AssetClass[];
  pricingSummary: string;
  detail: string;
  officialSourceLabel: string;
  officialSourceUrl: string;
};

export type BrokerFeeRecommendation = {
  assetClass: AssetClass;
  primary: BrokerFeeProfile;
  alternatives: BrokerFeeProfile[];
  summary: string;
};

export const brokerFeeProfiles: BrokerFeeProfile[] = [
  {
    id: "ibkr",
    label: "Interactive Brokers",
    executionStatus: "Planned",
    supportedAssetClasses: ["Equity", "ETF", "Forex", "Commodity", "Index"],
    lowestFeeFor: ["Forex", "Commodity", "Index"],
    pricingSummary:
      "Low published multi-asset pricing, including spot FX from 0.08 to 0.20 bps and low futures commissions.",
    detail:
      "Best overall fit when you want one low-cost broker across listed equities, ETFs, futures, and FX without relying on spread-only CFD routing.",
    officialSourceLabel: "IBKR Commissions",
    officialSourceUrl: "https://www.interactivebrokers.com/commissions",
  },
  {
    id: "alpaca",
    label: "Alpaca",
    executionStatus: "Planned",
    supportedAssetClasses: ["Equity", "ETF"],
    lowestFeeFor: ["Equity", "ETF"],
    pricingSummary:
      "Commission-free U.S.-listed stocks, ETFs, and options for eligible retail API flow, with regulatory fees still applying.",
    detail:
      "Usually the cheapest route for U.S.-listed names when you specifically want API-native equity and ETF execution rather than broad cross-market coverage.",
    officialSourceLabel: "Alpaca Brokerage Fees",
    officialSourceUrl: "https://alpaca.markets/algotrading?from=explinks.com",
  },
  {
    id: "kraken",
    label: "Kraken",
    executionStatus: "External",
    supportedAssetClasses: ["Crypto"],
    lowestFeeFor: ["Crypto"],
    pricingSummary:
      "Spot crypto maker/taker pricing starts around 0.25% / 0.40%, with lower tiers as volume rises.",
    detail:
      "Best pure-fee crypto venue in this stack for liquid order-book trading, especially when you can work maker orders instead of market-taking entries.",
    officialSourceLabel: "Kraken Fee Schedule",
    officialSourceUrl: "https://www.kraken.com/features/fee-schedule",
  },
  {
    id: "coinbase-advanced",
    label: "Coinbase Advanced",
    executionStatus: "External",
    supportedAssetClasses: ["Crypto"],
    lowestFeeFor: [],
    pricingSummary:
      "Maker/taker crypto pricing with hourly volume-tier updates, usually more expensive than Kraken at entry tiers.",
    detail:
      "Still a strong liquidity venue, but usually not the cheapest first route when fees are the main filter.",
    officialSourceLabel: "Coinbase Advanced Fees",
    officialSourceUrl:
      "https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/advanced-trade-fees",
  },
  {
    id: "ig",
    label: "IG",
    executionStatus: "Connected",
    supportedAssetClasses: ["Equity", "ETF", "Forex", "Commodity", "Index"],
    lowestFeeFor: [],
    pricingSummary:
      "Spread-based CFD pricing with examples like EUR/USD from 0.6 and S&P 500 from 0.4, plus funding costs on overnight leveraged positions.",
    detail:
      "Excellent coverage and already connected here, but usually a convenience route rather than the cheapest route for multi-day trading.",
    officialSourceLabel: "IG Charges",
    officialSourceUrl: "https://www.ig.com/uk/charges",
  },
  {
    id: "oanda",
    label: "OANDA",
    executionStatus: "Planned",
    supportedAssetClasses: ["Forex", "Commodity", "Index"],
    lowestFeeFor: [],
    pricingSummary:
      "Spread-led pricing with EUR/USD from 0.6 pips and index/metal CFDs priced through the spread.",
    detail:
      "Useful FX and CFD coverage, but the published entry spreads are not as cost-efficient as IBKR for a lower-fee default route.",
    officialSourceLabel: "OANDA Pricing",
    officialSourceUrl: "https://www.oanda.com/uk-en/trading/our-pricing/",
  },
];

const brokerFeeRecommendationMap: Record<
  AssetClass,
  { primaryId: BrokerFeeProfile["id"]; alternativeIds: BrokerFeeProfile["id"][]; summary: string }
> = {
  Crypto: {
    primaryId: "kraken",
    alternativeIds: ["coinbase-advanced", "ig"],
    summary:
      "Kraken is the lowest-fee default for crypto order-book trading, while Coinbase Advanced is the cleaner liquidity fallback and IG remains the convenience CFD route.",
  },
  Equity: {
    primaryId: "alpaca",
    alternativeIds: ["ibkr", "ig"],
    summary:
      "Alpaca is the cheapest route for U.S.-listed equity flow, while IBKR is the better broad-market backup if you need more instruments or jurisdictions.",
  },
  ETF: {
    primaryId: "alpaca",
    alternativeIds: ["ibkr", "ig"],
    summary:
      "Alpaca is the cheapest route for U.S.-listed ETF execution, with IBKR as the stronger broad-market fallback and IG mainly useful when you need CFD access.",
  },
  Forex: {
    primaryId: "ibkr",
    alternativeIds: ["oanda", "ig"],
    summary:
      "IBKR is the strongest low-fee FX default on published pricing, while OANDA and IG stay useful when you prefer CFD-style access and familiar spread pricing.",
  },
  Commodity: {
    primaryId: "ibkr",
    alternativeIds: ["ig", "oanda"],
    summary:
      "IBKR is the better low-cost route for exchange-traded commodity exposure, while IG and OANDA remain easier spread-based CFD fallbacks.",
  },
  Index: {
    primaryId: "ibkr",
    alternativeIds: ["ig", "oanda"],
    summary:
      "IBKR is the strongest low-fee default when you can trade listed index exposure, while IG and OANDA are simpler CFD routes if that product structure matters more than absolute cost.",
  },
};

function getBrokerFeeProfileById(profileId: BrokerFeeProfile["id"]) {
  return brokerFeeProfiles.find((profile) => profile.id === profileId) ?? null;
}

export function getBrokerFeeRecommendation(assetClass: AssetClass): BrokerFeeRecommendation {
  const rule = brokerFeeRecommendationMap[assetClass];
  const primary = getBrokerFeeProfileById(rule.primaryId);

  if (!primary) {
    throw new Error(`Missing broker fee profile for ${rule.primaryId}.`);
  }

  return {
    assetClass,
    primary,
    alternatives: rule.alternativeIds
      .map((profileId) => getBrokerFeeProfileById(profileId))
      .filter((profile): profile is BrokerFeeProfile => Boolean(profile)),
    summary: rule.summary,
  };
}

export function getOverallBrokerFeeRecommendation() {
  return {
    primary: getBrokerFeeProfileById("ibkr"),
    specialistCrypto: getBrokerFeeProfileById("kraken"),
    specialistListed: getBrokerFeeProfileById("alpaca"),
    summary:
      "There is no single cheapest venue for every instrument. Interactive Brokers is the best overall low-fee multi-market default, Alpaca is the cheapest route for U.S.-listed stocks and ETFs, and Kraken is the best pure-fee crypto venue in this stack.",
    asOf: "2026-06-04",
  };
}
