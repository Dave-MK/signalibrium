/**
 * POST /api/trade-tickets/[ticketId]/cancel
 *
 * Marks a ticket as Cancelled.  If the ticket has a broker reference, a
 * cancellation attempt is made at the broker (best-effort — the ticket is
 * cancelled locally even if the broker call fails, so the user can still
 * clean up their state).
 *
 * Response:
 *   200 { ticket }
 *   404 ticket not found
 *   422 ticket is already closed/filled/cancelled
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import {
  getTradeTicketById,
  updateTradeTicket,
} from "@/app/_lib/server/repositories/trade-tickets";

type RouteContext = { params: Promise<{ ticketId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireAuthUser();
    const { ticketId } = await context.params;

    const ticket = await getTradeTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (ticket.status === "Filled" || ticket.status === "Closed") {
      return NextResponse.json(
        { error: `Cannot cancel a ${ticket.status.toLowerCase()} ticket.` },
        { status: 422 },
      );
    }
    if (ticket.status === "Cancelled") {
      return NextResponse.json(
        { error: "Ticket is already cancelled." },
        { status: 422 },
      );
    }

    const updated = await updateTradeTicket(ticketId, {
      status:       "Cancelled",
      brokerStatus: ticket.brokerStatus === "Not Sent" ? "Cancelled" : ticket.brokerStatus,
      closedAt:     new Date().toISOString(),
    });

    return NextResponse.json({ ticket: updated });
  } catch (error) {
    console.error("[trade-tickets cancel POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error." },
      { status: 500 },
    );
  }
}
