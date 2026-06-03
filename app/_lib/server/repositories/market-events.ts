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

