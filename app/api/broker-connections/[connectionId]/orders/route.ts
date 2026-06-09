/**
 * POST /api/broker-connections/[connectionId]/orders
 *
 * Submits an order to the connected broker.
 * Credentials are read from Clerk privateMetadata — never exposed to the browser.
 *
 * Request body: BrokerOrderRequest
 * Response:
 *   200 { order: BrokerOrderResult }
 *   400 validation error
 *   404 connection not found
 *   422 { code: "reconnect_required" }
 *   502 { code: "broker_rejected" }
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { getBrokerCredential } from "@/app/_lib/server/broker-credentials";
import { submitBrokerOrder } from "@/app/_lib/server/broker-api";
import { getBrokerConnectionById } from "@/app/_lib/server/repositories/broker-connections";
import type { BrokerOrderRequest } from "@/app/_lib/server/broker-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { connectionId } = await context.params;

    const connection = await getBrokerConnectionById(connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    if (connection.status !== "connected") {
      return NextResponse.json(
        { error: "Broker connection is not active.", code: "not_connected" },
        { status: 422 },
      );
    }

    const credential = await getBrokerCredential(user.userId, connectionId);
    if (!credential) {
      return NextResponse.json(
        { error: "Credentials not found. Please disconnect and reconnect.", code: "reconnect_required" },
        { status: 422 },
      );
    }

    let orderRequest: BrokerOrderRequest;
    try {
      const body = await request.json() as BrokerOrderRequest;
      if (!body.symbol || typeof body.symbol !== "string") throw new Error("symbol is required");
      if (body.side !== "buy" && body.side !== "sell")      throw new Error("side must be buy or sell");
      if (!body.type)                                        throw new Error("type is required");
      if (typeof body.quantity !== "number" || body.quantity <= 0) throw new Error("quantity must be a positive number");
      orderRequest = body;
    } catch (parseError) {
      return NextResponse.json(
        { error: parseError instanceof Error ? parseError.message : "Invalid request body." },
        { status: 400 },
      );
    }

    // For OANDA, ensure accountRef is forwarded
    if (connection.provider === "OANDA" && connection.accountRef) {
      orderRequest = { ...orderRequest, accountRef: connection.accountRef };
    }

    let result;
    try {
      result = await submitBrokerOrder(
        connection.provider,
        connection.environment,
        credential,
        orderRequest,
      );
    } catch (brokerError) {
      console.error("[broker orders POST] broker rejected:", brokerError);
      return NextResponse.json(
        {
          error: brokerError instanceof Error ? brokerError.message : "Broker rejected the order.",
          code: "broker_rejected",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ order: result });
  } catch (error) {
    console.error("[broker-connections orders POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error.", code: "server_error" },
      { status: 500 },
    );
  }
}
