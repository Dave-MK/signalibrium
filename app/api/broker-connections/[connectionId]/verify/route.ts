/**
 * POST /api/broker-connections/[connectionId]/verify
 *
 * Re-tests an existing connection (e.g. user suspects their key expired).
 * Reads credentials from Clerk, calls the broker, updates KV status.
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { getBrokerCredential } from "@/app/_lib/server/broker-credentials";
import { verifyBrokerCredential } from "@/app/_lib/server/broker-api";
import {
  getBrokerConnectionById,
  updateBrokerConnection,
} from "@/app/_lib/server/repositories/broker-connections";

export async function POST(
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
      const updated = await updateBrokerConnection(connectionId, {
        status: "error",
        lastError: "Credentials not found. Please disconnect and reconnect.",
      });
      return NextResponse.json(
        { error: "Credentials not found.", connection: updated },
        { status: 422 },
      );
    }

    const result = await verifyBrokerCredential(
      connection.provider,
      connection.environment,
      credential,
    );

    const updated = await updateBrokerConnection(connectionId, {
      status: result.valid ? "connected" : "error",
      lastError: result.valid ? null : (result.error ?? "Verification failed."),
      accountRef: result.valid ? (result.accountRef ?? connection.accountRef) : connection.accountRef,
      lastSyncedAt: result.valid ? new Date().toISOString() : connection.lastSyncedAt,
    });

    return NextResponse.json({ connection: updated, verified: result.valid });
  } catch (error) {
    console.error("[broker-connections verify POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed." },
      { status: 500 },
    );
  }
}
