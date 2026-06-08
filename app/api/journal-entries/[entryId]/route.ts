import { NextResponse } from "next/server";
import {
  deleteJournalEntry,
  updateJournalEntry,
} from "@/app/_lib/server/repositories/journal-entries";
import type { PersistedJournalEntry } from "@/app/_lib/server/workspace-types";

/** PATCH /api/journal-entries/[entryId] — update fields on an existing entry */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  const body = (await request.json()) as Partial<PersistedJournalEntry>;

  const updated = await updateJournalEntry(entryId, body);

  if (!updated) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json({ entry: updated });
}

/** DELETE /api/journal-entries/[entryId] — remove an entry */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  const deleted = await deleteJournalEntry(entryId);

  if (!deleted) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
