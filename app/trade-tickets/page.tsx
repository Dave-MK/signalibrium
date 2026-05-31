import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import TradeTicketsPageClient from "./trade-tickets-page-client";

export default async function TradeTicketsPage() {
  const [tradeTickets, scannerResults] = await Promise.all([
    listTradeTickets(),
    listScannerResults(),
  ]);

  return (
    <TradeTicketsPageClient
      initialTradeTickets={tradeTickets}
      scannerResults={scannerResults}
    />
  );
}
