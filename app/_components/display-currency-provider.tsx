"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  convertUsdToDisplayCurrency,
  formatCompactCurrencyForDisplay,
  formatCurrencyForDisplay,
  formatInstrumentPriceForDisplay,
  type CurrencyRateMap,
} from "@/app/_lib/currency";
import type { PricedAssetClass } from "@/app/_lib/market-prices";
import type { SupportedDisplayCurrency } from "@/app/_lib/server/workspace-types";

type DisplayCurrencyContextValue = {
  currency: SupportedDisplayCurrency;
  rates: CurrencyRateMap;
  convertUsd: (value: number) => number;
  formatCompactCurrency: (value: number) => string;
  formatCurrency: (value: number, maximumFractionDigits?: number) => string;
  formatPrice: (value: number, assetClass?: PricedAssetClass) => string;
};

const DisplayCurrencyContext = createContext<DisplayCurrencyContextValue | null>(null);

export function DisplayCurrencyProvider({
  children,
  currency,
  rates,
}: {
  children: ReactNode;
  currency: SupportedDisplayCurrency;
  rates: CurrencyRateMap;
}) {
  const value = useMemo<DisplayCurrencyContextValue>(
    () => ({
      currency,
      rates,
      convertUsd: (amount) => convertUsdToDisplayCurrency(amount, currency, rates),
      formatCompactCurrency: (amount) =>
        formatCompactCurrencyForDisplay(amount, currency, rates),
      formatCurrency: (amount, maximumFractionDigits = 2) =>
        formatCurrencyForDisplay(amount, currency, rates, maximumFractionDigits),
      formatPrice: (amount, assetClass) =>
        formatInstrumentPriceForDisplay(amount, currency, rates, assetClass),
    }),
    [currency, rates],
  );

  return (
    <DisplayCurrencyContext.Provider value={value}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency() {
  const context = useContext(DisplayCurrencyContext);

  if (!context) {
    throw new Error("useDisplayCurrency must be used inside DisplayCurrencyProvider.");
  }

  return context;
}
