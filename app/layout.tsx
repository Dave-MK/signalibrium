import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { summarizePredictionAccuracy } from "./_lib/bot-engine";
import { getDisplayCurrencyState } from "./_lib/server/currency-preference";
import { listBrokerConnections } from "./_lib/server/repositories/broker-connections";
import { getMarketSnapshot } from "./_lib/server/repositories/market-snapshot";
import { listPredictionHistory } from "./_lib/server/repositories/prediction-history";
import { AppShell } from "./_components/app-shell";
import { DisplayCurrencyProvider } from "./_components/display-currency-provider";
import { ServiceWorkerRegistrar } from "./_components/service-worker-registrar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Signalibrium | Siggi",
  description:
    "Siggi monitors markets, weighs event-aware analysis, and helps with visual chart review and short-term trade timing.",
};
// Layout
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [displayCurrencyState, marketSnapshot, predictionHistory, brokerConnections] =
    await Promise.all([
      getDisplayCurrencyState(),
      getMarketSnapshot(),
      listPredictionHistory(),
      listBrokerConnections(),
    ]);
  const predictionAccuracy = summarizePredictionAccuracy(predictionHistory);

  return (
    <ClerkProvider>
      <html lang="en" className={`h-full antialiased ${spaceGrotesk.variable}`}>
        <body className="min-h-full">
          <ServiceWorkerRegistrar />
          <DisplayCurrencyProvider
            currency={displayCurrencyState.currency}
            rates={displayCurrencyState.rates}
          >
            <AppShell
              marketSnapshot={marketSnapshot}
              predictionAccuracy={predictionAccuracy}
              brokerConnections={brokerConnections}
            >
              {children}
            </AppShell>
          </DisplayCurrencyProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
