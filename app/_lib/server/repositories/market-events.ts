import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedMarketEvent } from "../workspace-types";

export async function listMarketEvents() {
  const data = await readWorkspaceData();
  return data.marketEvents;
}

export async function getMarketEventById(eventId: string) {
  const data = await readWorkspaceData();
  return data.marketEvents.find((event) => event.id === eventId) ?? null;
}

export async function createMarketEvent(
  input: Omit<PersistedMarketEvent, "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextEvent: PersistedMarketEvent = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.marketEvents.unshift(nextEvent);
  await writeWorkspaceData(data);

  return nextEvent;
}

export async function updateMarketEvent(
  id: string,
  patch: Partial<Pick<PersistedMarketEvent, "status" | "impact" | "bias" | "title" | "summary">>,
) {
  const data = await readWorkspaceData();
  const idx = data.marketEvents.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated: PersistedMarketEvent = {
    ...data.marketEvents[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  data.marketEvents[idx] = updated;
  await writeWorkspaceData(data);
  return updated;
}

export async function deleteMarketEvent(id: string) {
  const data = await readWorkspaceData();
  const before = data.marketEvents.length;
  data.marketEvents = data.marketEvents.filter((e) => e.id !== id);
  if (data.marketEvents.length === before) return false;
  await writeWorkspaceData(data);
  return true;
}

