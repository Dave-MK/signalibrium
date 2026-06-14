/**
 * POST /api/trade-tickets/[ticketId]/submit
 *
 * Sends a ticket to the broker associated with the ticket's executionMode.
 * Looks up the matching broker connection, retrieves credentials from Clerk
 * privateMetadata, submits the order, and stamps the ticket with the broker
 * reference.
 *
 * Request body (optional): { connectionId?: string }
 *   Provide connectionId to target a specific connection; omit to auto-match
 *   by executionMode.
 *
 * Response:
 *   200 { ticket, order }
 *   404 ticket or connection not found
 *   422 various validation failures
 *   502 broker rejected the order
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { getBrokerCredential } from "@/app/_lib/server/broker-credentials";
import {
  submitBrokerOrder,
  type BrokerOrderRequest,
} from "@/app/_lib/server/broker-api";
import {
  getTradeTicketById,
  applyBrokerResultToTicket,
} from "@/app/_lib/server/repositories/trade-tickets";
import {
  getBrokerConnectionById,
  listBrokerConnections,
} from "@/app/_lib/server/repositories/broker-connections";

type RouteContext = { params: Promise<{ ticketId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthUser();
    const { ticketId } = await context.params;

    const ticket = await getTradeTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }
    if (ticket.status === "Submitted" || ticket.status === "Working" || ticket.status === "Filled") {
      return NextResponse.json(
        { error: "Ticket has already been submitted." },
        { status: 422 },
      );
    }
    if (ticket.status === "Cancelled" || ticket.status === "Rejected" || ticket.status === "Closed") {
      return NextResponse.json(
        { error: `Cannot re-submit a ${ticket.status.toLowerCase()} ticket.` },
        { status: 422 },
      );
    }

    // Resolve which connection to use
    let body: { connectionId?: string } = {};
    try { body = await request.json() as { connectionId?: string }; } catch { /* no body */ }

    let connection;
    if (body.connectionId) {
      connection = await getBrokerConnectionById(body.connectionId);
      if (!connection) {
        return NextResponse.json({ error: "Specified broker connection not found." }, { status: 404 });
      }
    } else {
      // Auto-match by executionMode
      const all = await listBrokerConnections();
      connection = all.find(
        (c) => c.status === "connected" && c.executionModes.includes(ticket.executionMode as never),
      );
      if (!connection) {
        return NextResponse.json(
          {
            error: `No active broker connection found for execution mode "${ticket.executionMode}". Connect a broker first.`,
            code: "no_connection",
          },
          { status: 422 },
        );
      }
    }

    if (connection.status !== "connected") {
      return NextResponse.json(
        { error: "Broker connection is not active.", code: "not_connected" },
        { status: 422 },
      );
    }

    const credential = await getBrokerCredential(user.userId, connection.id);
    if (!credential) {
      return NextResponse.json(
        { error: "Credentials not found. Please disconnect and reconnect.", code: "reconnect_required" },
        { status: 422 },
      );
    }

    // Map ticket to broker order request
    const orderRequest: BrokerOrderRequest = {
      symbol:       ticket.symbol,
      side:         ticket.side === "Long" ? "buy" : "sell",
      type:         ticket.orderType === "Market"      ? "market"
                  : ticket.orderType === "Stop Entry"  ? "stop"
                  : "limit",
      quantity:     ticket.quantity,
      price:        ticket.entry,
      stopPrice:    ticket.stopLoss,
      timeInForce:  ticket.timeInForce,
      accountRef:   connection.accountRef,
    };

    let brokerResult;
    try {
      brokerResult = await submitBrokerOrder(
        connection.provider,
        connection.environment,
        credential,
        orderRequest,
      );
    } catch (brokerError) {
      console.error("[trade-tickets submit POST] broker rejected:", brokerError);
      return NextResponse.json(
        {
          error: brokerError instanceof Error ? brokerError.message : "Broker rejected the order.",
          code: "broker_rejected",
        },
        { status: 502 },
      );
    }

    const updatedTicket = await applyBrokerResultToTicket(ticketId, {
      orderId:          brokerResult.orderId,
      status:           brokerResult.status,
      filledQuantity:   brokerResult.filledQuantity,
      filledPrice:      brokerResult.filledPrice,
      connectionId:     connection.id,
    });

    return NextResponse.json({ ticket: updatedTicket, order: brokerResult });
  } catch (error) {
    console.error("[trade-tickets submit POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error.", code: "server_error" },
      { status: 500 },
    );
  }
}
