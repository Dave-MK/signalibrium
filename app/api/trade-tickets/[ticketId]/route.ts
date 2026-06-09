/**
 * GET    /api/trade-tickets/[ticketId]  — get a single ticket
 * PATCH  /api/trade-tickets/[ticketId]  — update ticket fields
 * DELETE /api/trade-tickets/[ticketId]  — delete a draft ticket
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import {
  getTradeTicketById,
  updateTradeTicket,
  deleteTradeTicket,
  type UpdateTradeTicketInput,
} from "@/app/_lib/server/repositories/trade-tickets";

type RouteContext = { params: Promise<{ ticketId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAuthUser();
    const { ticketId } = await context.params;
    const ticket = await getTradeTicketById(ticketId);
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("[trade-tickets/:id GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAuthUser();
    const { ticketId } = await context.params;

    const patch = await request.json() as UpdateTradeTicketInput;
    const ticket = await updateTradeTicket(ticketId, patch);
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("[trade-tickets/:id PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAuthUser();
    const { ticketId } = await context.params;

    const ticket = await getTradeTicketById(ticketId);
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    if (ticket.status !== "Draft" && ticket.status !== "Ready") {
      return NextResponse.json(
        { error: "Only Draft or Ready tickets can be deleted." },
        { status: 422 },
      );
    }

    await deleteTradeTicket(ticketId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[trade-tickets/:id DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error." },
      { status: 500 },
    );
  }
}
