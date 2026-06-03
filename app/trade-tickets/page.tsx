import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import TradeTicketsPageClient from "./trade-tickets-page-client";

export default async function TradeTicketsPage() {
  const [tradeTickets, scannerResults, assets] = await Promise.all([
    listTradeTickets(),
    listScannerResults(),
    listAssets(),
  ]);

  return (
    <TradeTicketsPageClient
      assets={assets}
      initialTradeTickets={tradeTickets}
      scannerResults={scannerResults}
    />
  );
}
