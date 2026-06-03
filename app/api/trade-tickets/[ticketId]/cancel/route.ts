import { NextResponse } from "next/server";
import { cancelTradeTicket } from "@/app/_lib/server/repositories/trade-tickets";

export async function POST(
  _request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await context.params;
  const tradeTicket = await cancelTradeTicket(ticketId);

  if (!tradeTicket) {
    return NextResponse.json({ error: "Trade ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ tradeTicket });
}
