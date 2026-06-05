import type {
  PersistedAssetRecord,
  SupportedDisplayCurrency,
} from "@/app/_lib/server/workspace-types";
import {
  getPriceFractionDigits,
  type PricedAssetClass,
} from "@/app/_lib/market-prices";

export const defaultDisplayCurrency: SupportedDisplayCurrency = "GBP";
export const currencyPreferenceCookieName = "signalibrium.display-currency";

export type CurrencyRateMap = Record<SupportedDisplayCurrency, number>;

export type DisplayCurrencyState = {
  currency: SupportedDisplayCurrency;
  rates: CurrencyRateMap;
};

function clampRate(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function buildCurrencyRates(assets: PersistedAssetRecord[]): CurrencyRateMap {
  const gbpUsd = assets.find((asset) => asset.symbol === "GBPUSD")?.price;
  const eurUsd = assets.find((asset) => asset.symbol === "EURUSD")?.price;
  const usdToGbp = clampRate(gbpUsd ? 1 / gbpUsd : Number.NaN, 0.79);
  const usdToEur = clampRate(eurUsd ? 1 / eurUsd : Number.NaN, 0.92);

  return {
    GBP: usdToGbp,
    USD: 1,
    EUR: usdToEur,
  };
}

export function convertUsdToDisplayCurrency(
  value: number,
  currency: SupportedDisplayCurrency,
  rates: CurrencyRateMap,
) {
  return value * rates[currency];
}

export function convertCurrencyAmount(
  value: number,
  fromCurrency: SupportedDisplayCurrency,
  toCurrency: SupportedDisplayCurrency,
  rates: CurrencyRateMap,
) {
  if (fromCurrency === toCurrency) {
    return value;
  }

  const usdValue =
    fromCurrency === "USD" ? value : value / clampRate(rates[fromCurrency], 1);

  return toCurrency === "USD" ? usdValue : usdValue * clampRate(rates[toCurrency], 1);
}

export function formatCurrencyForDisplay(
  value: number,
  currency: SupportedDisplayCurrency,
  rates: CurrencyRateMap,
  maximumFractionDigits = 2,
) {
  const converted = convertUsdToDisplayCurrency(value, currency, rates);
  const resolvedMaximumFractionDigits = Math.max(
    maximumFractionDigits,
    getPriceFractionDigits(converted),
  );

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: resolvedMaximumFractionDigits,
    style: "currency",
    currency,
  }).format(converted);
}

export function formatCurrencyAmount(
  value: number,
  fromCurrency: SupportedDisplayCurrency,
  toCurrency: SupportedDisplayCurrency,
  rates: CurrencyRateMap,
  maximumFractionDigits = 2,
) {
  const converted = convertCurrencyAmount(value, fromCurrency, toCurrency, rates);
  const resolvedMaximumFractionDigits = Math.max(
    maximumFractionDigits,
    getPriceFractionDigits(converted),
  );

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: resolvedMaximumFractionDigits,
    style: "currency",
    currency: toCurrency,
  }).format(converted);
}

export function formatInstrumentPriceForDisplay(
  value: number,
  currency: SupportedDisplayCurrency,
  rates: CurrencyRateMap,
  assetClass?: PricedAssetClass,
) {
  const converted = convertUsdToDisplayCurrency(value, currency, rates);
  const maximumFractionDigits = getPriceFractionDigits(converted, assetClass);

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits,
    style: "currency",
    currency,
  }).format(converted);
}

export function formatCompactCurrencyForDisplay(
  value: number,
  currency: SupportedDisplayCurrency,
  rates: CurrencyRateMap,
) {
  const converted = convertUsdToDisplayCurrency(value, currency, rates);
  const absoluteValue = Math.abs(converted);
  const sign = converted < 0 ? "-" : "";
  const symbol = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  })
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value ?? currency;

  if (absoluteValue < 1_000) {
    return formatCurrencyForDisplay(value, currency, rates);
  }

  const units = [
    { suffix: "B", threshold: 1_000_000_000 },
    { suffix: "M", threshold: 1_000_000 },
    { suffix: "K", threshold: 1_000 },
  ];
  const selectedUnit =
    units.find((unit) => absoluteValue >= unit.threshold) ?? units[units.length - 1];
  const scaledValue = absoluteValue / selectedUnit.threshold;
  const formattedScaledValue =
    scaledValue >= 100
      ? scaledValue.toFixed(0)
      : scaledValue.toFixed(1).replace(/\.0$/, "");

  return `${sign}${symbol}${formattedScaledValue}${selectedUnit.suffix}`;
}
