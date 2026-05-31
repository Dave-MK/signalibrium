import { NextResponse } from "next/server";
import { parseCreateTradeTicketInput } from "@/app/_lib/server/request-parsers";
import {
  createTradeTicket,
  listTradeTickets,
} from "@/app/_lib/server/repositories/trade-tickets";

export async function GET() {
  const tradeTickets = await listTradeTickets();
  return NextResponse.json({ tradeTickets });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateTradeTicketInput(body);
    const tradeTicket = await createTradeTicket(input);

    return NextResponse.json({ tradeTicket }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 },
    );
  }
}
