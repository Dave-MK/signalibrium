import { NextResponse } from "next/server";
import { parseUpdateJournalEntryInput } from "@/app/_lib/server/request-parsers";
import {
  deleteJournalEntry,
  getJournalEntryById,
  updateJournalEntry,
} from "@/app/_lib/server/repositories/journal-entries";

export async function GET(
  _request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await context.params;
  const journalEntry = await getJournalEntryById(entryId);

  if (!journalEntry) {
    return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
  }

  return NextResponse.json({ journalEntry });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  try {
    const { entryId } = await context.params;
    const body = await request.json();
    const input = parseUpdateJournalEntryInput(body);
    const journalEntry = await updateJournalEntry(entryId, input);

    if (!journalEntry) {
      return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
    }

    return NextResponse.json({ journalEntry });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await context.params;
  const removed = await deleteJournalEntry(entryId);

  if (!removed) {
    return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
