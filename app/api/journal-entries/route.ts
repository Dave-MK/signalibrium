import { NextResponse } from "next/server";
import { parseCreateJournalEntryInput } from "@/app/_lib/server/request-parsers";
import {
  createJournalEntry,
  listJournalEntries,
} from "@/app/_lib/server/repositories/journal-entries";

export async function GET() {
  const journalEntries = await listJournalEntries();
  return NextResponse.json({ journalEntries });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateJournalEntryInput(body);
    const journalEntry = await createJournalEntry(input);

    return NextResponse.json({ journalEntry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 },
    );
  }
}
