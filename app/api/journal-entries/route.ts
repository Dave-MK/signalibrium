import { NextResponse } from "next/server";
import {
  createJournalEntry,
  listJournalEntries,
} from "@/app/_lib/server/repositories/journal-entries";
import type { PersistedJournalEntry } from "@/app/_lib/server/workspace-types";

/** GET /api/journal-entries — list all entries newest-first */
export async function GET() {
  const entries = await listJournalEntries();
  return NextResponse.json({ entries });
}

/** POST /api/journal-entries — create a new journal entry */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<PersistedJournalEntry>;

  const now = new Date().toISOString();
  const entry = await createJournalEntry({
    // Base JournalEntry fields
    date:       body.date       ?? now,
    asset:      body.asset      ?? "",
    status:     body.status     ?? "Taken",
    pnl:        body.pnl        ?? 0,
    notes:      body.notes      ?? "",
    emotionTags: Array.isArray(body.emotionTags) ? body.emotionTags : [],
    aiReview:   body.aiReview   ?? "",
    // PersistedJournalEntry fields
    ticketId:       body.ticketId       ?? null,
    predictionId:   body.predictionId   ?? null,
    tradeId:        body.tradeId        ?? null,
    entryType:      body.entryType      ?? "general",
    whatISaw:       body.whatISaw       ?? "",
    reasoning:      body.reasoning      ?? "",
    improvement:    body.improvement    ?? "",
    tags:           Array.isArray(body.tags) ? body.tags : [],
    rating:         body.rating         ?? null,
    wouldTakeAgain: body.wouldTakeAgain ?? null,
    taggedOutcome:  body.taggedOutcome  ?? null,
  });

  return NextResponse.json({ entry }, { status: 201 });
}
