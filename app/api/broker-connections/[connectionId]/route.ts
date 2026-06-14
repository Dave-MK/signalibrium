/**
 * PATCH /api/broker-connections/[connectionId] — update connection settings
 * DELETE /api/broker-connections/[connectionId] — disconnect and remove a broker
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { deleteBrokerCredential } from "@/app/_lib/server/broker-credentials";
import {
  deleteBrokerConnection,
  getBrokerConnectionById,
  updateBrokerConnection,
} from "@/app/_lib/server/repositories/broker-connections";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  try {
    await requireAuthUser();
    const { connectionId } = await context.params;

    const existing = await getBrokerConnectionById(connectionId);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    const body = await request.json() as { autoExecuteSiggi?: boolean; label?: string };

    const patch: Parameters<typeof updateBrokerConnection>[1] = {};
    if (typeof body.autoExecuteSiggi === "boolean") patch.autoExecuteSiggi = body.autoExecuteSiggi;
    if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const updated = await updateBrokerConnection(connectionId, patch);
    return NextResponse.json({ connection: updated });
  } catch (error) {
    console.error("[broker-connections PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update connection." },
      { status: 500 },
    );
  }
}

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
