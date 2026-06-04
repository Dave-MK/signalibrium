import { NextResponse } from "next/server";
import {
  currencyPreferenceCookieName,
  defaultDisplayCurrency,
} from "@/app/_lib/currency";
import type { SupportedDisplayCurrency } from "@/app/_lib/server/workspace-types";

function normalizeCurrency(value: unknown): SupportedDisplayCurrency {
  if (value === "USD" || value === "EUR" || value === "GBP") {
    return value;
  }

  return defaultDisplayCurrency;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { currency?: string };
  const currency = normalizeCurrency(payload.currency?.toUpperCase());
  const response = NextResponse.json({ currency });

  response.cookies.set(currencyPreferenceCookieName, currency, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
