import { NextResponse } from "next/server";
import {
  readWorkspaceData,
  writeWorkspaceData,
} from "@/app/_lib/server/workspace-store";

/**
 * POST /api/predictions/reset
 *
 * Clears all prediction history records that do NOT have a genuine outcome
 * (i.e., keeps only "Hit Target", "Stopped", and "Breakeven" outcomes — removes "Monitoring",
 * "Ambiguous", "Stayed Flat", "Recovered Late", "Skipped Correctly").
 *
 * Use this to wipe bad/stale predictions so accuracy reflects only real outcomes.
 *
 * Pass `?wipeAll=true` to remove every prediction and start completely fresh.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const wipeAll = url.searchParams.get("wipeAll") === "true";

  const data = await readWorkspaceData();
  const before = data.predictionHistory.length;

  const kept = wipeAll
    ? []
    : data.predictionHistory.filter(
        (record) =>
          record.outcome === "Hit Target" ||
          record.outcome === "Stopped" ||
          record.outcome === "Breakeven",
      );

  const removed = before - kept.length;

  await writeWorkspaceData({
    ...data,
    predictionHistory: kept,
  });

  return NextResponse.json({
    success: true,
    wipeAll,
    recordsBefore: before,
    recordsKept: kept.length,
    recordsRemoved: removed,
  });
}
