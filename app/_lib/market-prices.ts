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

/** One pip/point expressed as a price unit for the given asset class and price level. */
export function getPipUnit(price: number, assetClass?: PricedAssetClass): number {
  if (assetClass === "Forex") {
    return Math.abs(price) >= 100 ? 0.01 : 0.0001; // JPY pairs vs standard
  }
  if (assetClass === "Index") return 1;
  if (assetClass === "Commodity") {
    const abs = Math.abs(price);
    if (abs >= 1_000) return 0.1;  // Gold (~$3 000)
    if (abs >= 50)   return 0.01; // WTI / Brent
    return 0.001;                  // Copper, NatGas
  }
  // Crypto, Equity, ETF — scale by magnitude
  const abs = Math.abs(price);
  if (abs >= 10_000) return 1;
  if (abs >= 1_000)  return 0.5;
  if (abs >= 100)    return 0.01;
  if (abs >= 1)      return 0.01;
  if (abs >= 0.01)   return 0.0001;
  return 0.000001;
}

/** Human-readable unit label ("pip" for Forex, "pts" otherwise). */
export function getPipLabel(assetClass?: PricedAssetClass): string {
  return assetClass === "Forex" ? "pip" : "pts";
}

/**
 * Describes the distance between `currentPrice` and the nearest edge of the
 * entry zone in pip / point terms, e.g. "18 pips above", "7 pts below".
 */
export function formatPipDistance(
  currentPrice: number,
  entryLow: number,
  entryHigh: number,
  assetClass?: PricedAssetClass,
): string {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(entryLow) || !Number.isFinite(entryHigh)) {
    return "";
  }

  const unit = getPipUnit(currentPrice, assetClass);
  const label = getPipLabel(assetClass);

  // How far from the nearest edge (not midpoint)
  const distanceRaw = currentPrice > entryHigh
    ? currentPrice - entryHigh   // above zone → positive
    : currentPrice < entryLow
      ? entryLow - currentPrice  // below zone → positive
      : Math.min(currentPrice - entryLow, entryHigh - currentPrice); // inside zone → depth from nearest edge

  const pips = distanceRaw / unit;
  const formattedPips = pips >= 100
    ? Math.round(pips).toLocaleString("en-GB")
    : pips.toFixed(1);

  // Inside the zone — report depth rather than distance away
  if (currentPrice >= entryLow && currentPrice <= entryHigh) {
    return `in zone · ${formattedPips} ${label}`;
  }

  const side = currentPrice > entryHigh ? "above" : "below";
  return `${formattedPips} ${label} ${side}`;
}
