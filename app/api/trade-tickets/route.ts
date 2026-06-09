/**
 * GET  /api/trade-tickets  — list all tickets (most recent first)
 * POST /api/trade-tickets  — create a new draft ticket
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import {
  listTradeTickets,
  createTradeTicket,
  type CreateTradeTicketInput,
} from "@/app/_lib/server/repositories/trade-tickets";

export async function GET() {
  try {
    await requireAuthUser();
    const tickets = await listTradeTickets();
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("[trade-tickets GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list tickets." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAuthUser();

    let body: CreateTradeTicketInput;
    try {
      body = await request.json() as CreateTradeTicketInput;
      if (!body.symbol || typeof body.symbol !== "string") throw new Error("symbol is required");
      if (body.side !== "Long" && body.side !== "Short")    throw new Error("side must be Long or Short");
    } catch (parseError) {
      return NextResponse.json(
        { error: parseError instanceof Error ? parseError.message : "Invalid request body." },
        { status: 400 },
      );
    }

    const ticket = await createTradeTicket(body);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error("[trade-tickets POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create ticket." },
      { status: 500 },
    );
  }
}
