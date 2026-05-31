import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedJournalEntry } from "../workspace-types";

export async function listJournalEntries() {
  const data = await readWorkspaceData();
  return data.journalEntries;
}

export async function getJournalEntryById(entryId: string) {
  const data = await readWorkspaceData();
  return data.journalEntries.find((entry) => entry.id === entryId) ?? null;
}

export async function createJournalEntry(
  input: Omit<PersistedJournalEntry, "id" | "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextEntry: PersistedJournalEntry = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.journalEntries.push(nextEntry);
  await writeWorkspaceData(data);

  return nextEntry;
}

export async function updateJournalEntry(
  entryId: string,
  input: Partial<Omit<PersistedJournalEntry, "id" | "createdAt" | "updatedAt">>,
) {
  const data = await readWorkspaceData();
  const index = data.journalEntries.findIndex((entry) => entry.id === entryId);

  if (index === -1) {
    return null;
  }

  const current = data.journalEntries[index];
  const updated: PersistedJournalEntry = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  };

  data.journalEntries[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function deleteJournalEntry(entryId: string) {
  const data = await readWorkspaceData();
  const index = data.journalEntries.findIndex((entry) => entry.id === entryId);

  if (index === -1) {
    return false;
  }

  data.journalEntries.splice(index, 1);
  await writeWorkspaceData(data);

  return true;
}
