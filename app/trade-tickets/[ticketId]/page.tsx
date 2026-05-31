import { notFound } from "next/navigation";
import { getTradeTicketById } from "@/app/_lib/server/repositories/trade-tickets";
import TradeTicketDetailClient from "./trade-ticket-detail-client";

export default async function TradeTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const ticket = await getTradeTicketById(ticketId);

  if (!ticket) {
    notFound();
  }

  return <TradeTicketDetailClient initialTicket={ticket} />;
}
