/**
 * GET /api/broker-connections/[connectionId]/positions
 *
 * Fetches open positions from the connected broker.
 * Credentials are read from Clerk privateMetadata — never exposed to the browser.
 *
 * Response:
 *   200 { positions: BrokerPosition[], fetchedAt: string }
 *   404 connection not found
 *   422 { code: "reconnect_required" }
 *   502 { code: "fetch_failed" }
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { getBrokerCredential } from "@/app/_lib/server/broker-credentials";
import { fetchBrokerPositions } from "@/app/_lib/server/broker-api";
import { getBrokerConnectionById } from "@/app/_lib/server/repositories/broker-connections";

export async function GET(
  _request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { connectionId } = await context.params;

    const connection = await getBrokerConnectionById(connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    const credential = await getBrokerCredential(user.userId, connectionId);
    if (!credential) {
      return NextResponse.json(
        { error: "Credentials not found. Please disconnect and reconnect.", code: "reconnect_required" },
        { status: 422 },
      );
    }

    let result;
    try {
      result = await fetchBrokerPositions(
        connection.provider,
        connection.environment,
        credential,
        connection.accountRef,
      );
    } catch (fetchError) {
      console.error("[broker positions GET] fetch failed:", fetchError);
      return NextResponse.json(
        {
          error: fetchError instanceof Error ? fetchError.message : "Failed to fetch positions.",
          code: "fetch_failed",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ positions: result.positions, fetchedAt: result.fetchedAt });
  } catch (error) {
    console.error("[broker-connections positions GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error.", code: "server_error" },
      { status: 500 },
    );
  }
}
