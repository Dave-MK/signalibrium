import { readWorkspaceData, writeWorkspaceData } from "@/app/_lib/server/workspace-store";
import type { PersistedPriceAlert } from "@/app/_lib/server/workspace-types";
import { randomUUID } from "crypto";

export async function listAlerts(): Promise<PersistedPriceAlert[]> {
  const data = await readWorkspaceData();
  return data.priceAlerts ?? [];
}

export async function upsertAlert(
  input: Omit<PersistedPriceAlert, "id" | "createdAt" | "updatedAt" | "triggeredAt"> & { id?: string },
): Promise<PersistedPriceAlert> {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const existing = data.priceAlerts.find((a) => a.id === input.id);

  const alert: PersistedPriceAlert = {
    id: existing?.id ?? randomUUID(),
    symbol: input.symbol.toUpperCase().trim(),
    label: input.label.trim(),
    condition: input.condition,
    targetPrice: input.targetPrice,
    enabled: input.enabled ?? true,
    triggeredAt: existing?.triggeredAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  data.priceAlerts = existing
    ? data.priceAlerts.map((a) => (a.id === alert.id ? alert : a))
    : [alert, ...data.priceAlerts];

  await writeWorkspaceData(data);
  return alert;
}

export async function deleteAlert(id: string): Promise<void> {
  const data = await readWorkspaceData();
  data.priceAlerts = data.priceAlerts.filter((a) => a.id !== id);
  await writeWorkspaceData(data);
}

/** Mark alert as triggered (idempotent). */
export async function triggerAlert(id: string): Promise<void> {
  const data = await readWorkspaceData();
  data.priceAlerts = data.priceAlerts.map((a) =>
    a.id === id && !a.triggeredAt ? { ...a, triggeredAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : a,
  );
  await writeWorkspaceData(data);
}
