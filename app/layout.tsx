import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { summarizePredictionAccuracy } from "./_lib/bot-engine";
import { getDisplayCurrencyState } from "./_lib/server/currency-preference";
import { getMarketSnapshot } from "./_lib/server/repositories/market-snapshot";
import { listPredictionHistory } from "./_lib/server/repositories/prediction-history";
import { AppShell } from "./_components/app-shell";
import { DisplayCurrencyProvider } from "./_components/display-currency-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signalibrium | Siggi",
  description:
    "Siggi monitors markets, weighs event-aware analysis, and helps with visual chart review and short-term trade timing.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [displayCurrencyState, marketSnapshot, predictionHistory] = await Promise.all([
    getDisplayCurrencyState(),
    getMarketSnapshot(),
    listPredictionHistory(),
  ]);
  const predictionAccuracy = summarizePredictionAccuracy(predictionHistory);

  return (
    <ClerkProvider>
      <html lang="en" className="h-full antialiased">
        <body className="min-h-full">
          <DisplayCurrencyProvider
            currency={displayCurrencyState.currency}
            rates={displayCurrencyState.rates}
          >
            <AppShell
              marketSnapshot={marketSnapshot}
              predictionAccuracy={predictionAccuracy}
            >
              {children}
            </AppShell>
          </DisplayCurrencyProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
