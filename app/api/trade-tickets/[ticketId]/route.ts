import { NextResponse } from "next/server";
import { parseUpdateTradeTicketInput } from "@/app/_lib/server/request-parsers";
import {
  deleteTradeTicket,
  getTradeTicketById,
  updateTradeTicket,
} from "@/app/_lib/server/repositories/trade-tickets";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await context.params;
  const tradeTicket = await getTradeTicketById(ticketId);

  if (!tradeTicket) {
    return NextResponse.json({ error: "Trade ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ tradeTicket });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await context.params;
    const body = await request.json();
    const input = parseUpdateTradeTicketInput(body);
    const tradeTicket = await updateTradeTicket(ticketId, input);

    if (!tradeTicket) {
      return NextResponse.json({ error: "Trade ticket not found" }, { status: 404 });
    }

    return NextResponse.json({ tradeTicket });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await context.params;
  const removed = await deleteTradeTicket(ticketId);

  if (!removed) {
    return NextResponse.json({ error: "Trade ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
