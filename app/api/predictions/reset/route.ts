import { NextResponse } from "next/server";
import {
  readWorkspaceData,
  writeWorkspaceData,
} from "@/app/_lib/server/workspace-store";

/**
 * POST /api/predictions/reset
 *
 * Manages prediction history cleanup.
 *
 * Query params:
 *   ?wipeAll=true        — remove every prediction, start completely fresh
 *   ?wipeSeedOnly=true   — remove only seed_replay demo records, keep real predictions
 *   (no params)          — remove unresolved predictions, keep Hit Target / Stopped / Breakeven
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const wipeAll = url.searchParams.get("wipeAll") === "true";
  const wipeSeedOnly = url.searchParams.get("wipeSeedOnly") === "true";

  const data = await readWorkspaceData();
  const before = data.predictionHistory.length;

  const kept = wipeAll
    ? []
    : wipeSeedOnly
      ? data.predictionHistory.filter((record) => record.resolvedSource !== "seed_replay")
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
    mode: wipeAll ? "wipeAll" : wipeSeedOnly ? "wipeSeedOnly" : "resolvedOnly",
    recordsBefore: before,
    recordsKept: kept.length,
    recordsRemoved: removed,
  });
}
