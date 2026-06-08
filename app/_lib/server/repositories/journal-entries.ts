import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedJournalEntry } from "../workspace-types";

export async function listJournalEntries(): Promise<PersistedJournalEntry[]> {
  const data = await readWorkspaceData();
  return [...(data.journalEntries as PersistedJournalEntry[])].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export async function getJournalEntry(id: string): Promise<PersistedJournalEntry | null> {
  const data = await readWorkspaceData();
  return (data.journalEntries as PersistedJournalEntry[]).find((e) => e.id === id) ?? null;
}

export async function createJournalEntry(
  entry: Omit<PersistedJournalEntry, "id" | "createdAt" | "updatedAt">,
): Promise<PersistedJournalEntry> {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const newEntry: PersistedJournalEntry = {
    ...entry,
    id: `journal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  await writeWorkspaceData({
    ...data,
    journalEntries: [newEntry, ...(data.journalEntries as PersistedJournalEntry[])],
  });
  return newEntry;
}

export async function updateJournalEntry(
  id: string,
  patch: Partial<Omit<PersistedJournalEntry, "id" | "createdAt">>,
): Promise<PersistedJournalEntry | null> {
  const data = await readWorkspaceData();
  const entries = data.journalEntries as PersistedJournalEntry[];
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated: PersistedJournalEntry = {
    ...entries[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const next = [...entries];
  next[idx] = updated;
  await writeWorkspaceData({ ...data, journalEntries: next });
  return updated;
}

export async function deleteJournalEntry(id: string): Promise<boolean> {
  const data = await readWorkspaceData();
  const entries = data.journalEntries as PersistedJournalEntry[];
  const filtered = entries.filter((e) => e.id !== id);
  if (filtered.length === entries.length) return false;
  await writeWorkspaceData({ ...data, journalEntries: filtered });
  return true;
}
