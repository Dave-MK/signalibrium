type MarketProgressAsset = {
  atr: number;
  change24h: number;
  liquidity: string;
  name: string;
  price: number;
  regime: string;
  score: number;
  sparkline: number[];
  symbol: string;
  volatility: string;
};

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function deriveMarketProgress(asset: MarketProgressAsset) {
  const first = asset.sparkline[0] ?? asset.price;
  const last = asset.sparkline.at(-1) ?? asset.price;
  const highest = Math.max(...asset.sparkline, asset.price);
  const lowest = Math.min(...asset.sparkline, asset.price);
  const range = highest - lowest || 1;
  const momentum = ((last - first) / Math.max(Math.abs(first), 0.01)) * 100;
  const pullbackFromHigh = ((last - highest) / Math.max(Math.abs(highest), 0.01)) * 100;

  const stepChanges = asset.sparkline.slice(1).map((point, index) => {
    const prior = asset.sparkline[index] ?? point;
    return ((point - prior) / Math.max(Math.abs(prior), 0.01)) * 100;
  });

  const realisedVolatility = average(stepChanges.map((change) => Math.abs(change)));
  const normalizedRange = (range / Math.max(asset.price, 0.01)) * 100;
  const trendBias =
    momentum > 5 ? "Uptrend" : momentum < -5 ? "Downtrend" : "Range-bound";
  const structureState =
    pullbackFromHigh > -2 ? "Near highs" : pullbackFromHigh < -8 ? "Deep pullback" : "Contained pullback";
  const indicatorRead =
    asset.score >= 85
      ? "Strong confirmation"
      : asset.score >= 72
        ? "Constructive confirmation"
        : "Selective confirmation";

  return {
    first,
    highest,
    indicatorRead,
    lowest,
    momentum,
    normalizedRange,
    pullbackFromHigh,
    realisedVolatility,
    structureState,
    trendBias,
  };
}
