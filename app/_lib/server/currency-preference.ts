import { cookies } from "next/headers";
import {
  buildCurrencyRates,
  currencyPreferenceCookieName,
  defaultDisplayCurrency,
  type DisplayCurrencyState,
} from "@/app/_lib/currency";
import { listAssets } from "./repositories/assets";
import type { SupportedDisplayCurrency } from "./workspace-types";

function normalizeCurrency(value: string | undefined): SupportedDisplayCurrency {
  if (value === "USD" || value === "EUR" || value === "GBP") {
    return value;
  }

  return defaultDisplayCurrency;
}

export async function getDisplayCurrencyState(): Promise<DisplayCurrencyState> {
  const cookieStore = await cookies();
  const currency = normalizeCurrency(
    cookieStore.get(currencyPreferenceCookieName)?.value?.toUpperCase(),
  );
  const assets = await listAssets();

  return {
    currency,
    rates: buildCurrencyRates(assets),
  };
}
