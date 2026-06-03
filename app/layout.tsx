import type { Metadata } from "next";
import { getMarketSnapshot } from "./_lib/server/repositories/market-snapshot";
import { listScannerResults } from "./_lib/server/repositories/scanner-results";
import { AppShell } from "./_components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signalibrium | Personal AI Trading Desk",
  description:
    "Personal AI trading platform for market briefings, watchlists, setup ranking, protected execution planning, and review memory.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [marketSnapshot, scannerResults] = await Promise.all([
    getMarketSnapshot(),
    listScannerResults(),
  ]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell
          marketSnapshot={marketSnapshot}
          topScannerResult={scannerResults[0] ?? null}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
