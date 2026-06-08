/**
 * DELETE /api/broker-connections/[connectionId] — disconnect and remove a broker
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { deleteBrokerCredential } from "@/app/_lib/server/broker-credentials";
import {
  deleteBrokerConnection,
  getBrokerConnectionById,
} from "@/app/_lib/server/repositories/broker-connections";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireAuthUser();
    const { connectionId } = await context.params;

    const existing = await getBrokerConnectionById(connectionId);

    if (!existing) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    // Remove from workspace KV
    await deleteBrokerConnection(connectionId);

    // Remove credentials from Clerk — fire-and-forget, don't block on failure
    deleteBrokerCredential(user.userId, connectionId).catch((err) => {
      console.error("[broker-connections DELETE] failed to remove Clerk credential:", err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[broker-connections DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect broker." },
      { status: 500 },
    );
  }
}
