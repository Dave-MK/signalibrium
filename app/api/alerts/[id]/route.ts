import { NextResponse } from "next/server";
import { deleteAlert, upsertAlert, listAlerts } from "@/app/_lib/server/repositories/alerts";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteAlert(id);
  return NextResponse.json({ ok: true });
}

/** PATCH — toggle enabled/disabled */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json() as { enabled?: boolean };
  const alerts = await listAlerts();
  const existing = alerts.find((a) => a.id === id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await upsertAlert({
    id,
    symbol: existing.symbol,
    label: existing.label,
    condition: existing.condition,
    targetPrice: existing.targetPrice,
    enabled: typeof body.enabled === "boolean" ? body.enabled : existing.enabled,
  });
  return NextResponse.json(updated);
}
