import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import TradeTicketsPageClient from "./trade-tickets-page-client";

export default async function TradeTicketsPage() {
  const tradeTickets = await listTradeTickets();

  return <TradeTicketsPageClient initialTradeTickets={tradeTickets} />;
}
