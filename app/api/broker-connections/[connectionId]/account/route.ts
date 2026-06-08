/**
 * GET /api/broker-connections/[connectionId]/account
 *
 * Fetches live account balance/P&L from the broker.
 * Credentials are read from Clerk privateMetadata — never exposed to the browser.
 *
 * This endpoint is polled client-side every 30s by BrokerStatusChip.
 *
 * Error codes returned in JSON body:
 *   "reconnect_required" — credential is missing or corrupt; connection should be deleted and recreated
 *   "fetch_failed"       — credential exists but the broker API call failed
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { getBrokerCredential } from "@/app/_lib/server/broker-credentials";
import { fetchBrokerAccount } from "@/app/_lib/server/broker-api";
import {
  getBrokerConnectionById,
  updateBrokerConnection,
} from "@/app/_lib/server/repositories/broker-connections";

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
      // Credential is missing — mark the connection as errored so the chip
      // can show a "reconnect" prompt rather than silently polling forever.
      await updateBrokerConnection(connectionId, {
        status: "error",
        lastError: "Credentials not found. Please disconnect and reconnect.",
      }).catch(() => {});

      return NextResponse.json(
        {
          error: "Credentials not found. Please disconnect and reconnect.",
          code: "reconnect_required",
        },
        { status: 422 },
      );
    }

    let accountData;
    try {
      accountData = await fetchBrokerAccount(
        connection.provider,
        connection.environment,
        credential,
        connection.accountRef,
      );
    } catch (fetchError) {
      console.error("[broker account GET] broker fetch failed:", fetchError);
      return NextResponse.json(
        {
          error: fetchError instanceof Error ? fetchError.message : "Failed to fetch account.",
          code: "fetch_failed",
        },
        { status: 502 },
      );
    }

    if ("error" in accountData && accountData.error === "not_implemented") {
      return NextResponse.json(
        { error: "Live account data is not yet available for IBKR.", code: "not_implemented" },
        { status: 501 },
      );
    }

    return NextResponse.json({ account: accountData });
  } catch (error) {
    console.error("[broker-connections account GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch account.", code: "server_error" },
      { status: 500 },
    );
  }
}
