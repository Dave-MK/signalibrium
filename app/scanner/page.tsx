import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import ScannerPageClient from "./scanner-page-client";

export default async function ScannerPage() {
  const [tradeTickets, scannerResults] = await Promise.all([
    listTradeTickets(),
    listScannerResults(),
  ]);

  return (
    <ScannerPageClient
      initialTradeTickets={tradeTickets}
      initialScannerResults={scannerResults}
    />
  );
}
