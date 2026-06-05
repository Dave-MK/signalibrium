export type PricedAssetClass =
  | "Crypto"
  | "ETF"
  | "Equity"
  | "Forex"
  | "Commodity"
  | "Index";

export function getPriceFractionDigits(
  value: number,
  assetClass?: PricedAssetClass,
) {
  if (!Number.isFinite(value)) {
    return assetClass === "Forex" ? 4 : 2;
  }

  const absoluteValue = Math.abs(value);

  if (assetClass === "Forex") {
    if (absoluteValue >= 100) {
      return 3;
    }

    if (absoluteValue >= 1) {
      return 4;
    }

    return 6;
  }

  if (absoluteValue >= 1_000) {
    return 2;
  }

  if (absoluteValue >= 1) {
    return 2;
  }

  if (absoluteValue >= 0.1) {
    return 4;
  }

  if (absoluteValue >= 0.01) {
    return 5;
  }

  if (absoluteValue >= 0.001) {
    return 6;
  }

  if (absoluteValue >= 0.0001) {
    return 8;
  }

  return 10;
}

export function roundPriceValue(
  value: number,
  assetClass?: PricedAssetClass,
) {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Number(value.toFixed(getPriceFractionDigits(value, assetClass)));
}
