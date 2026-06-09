/**
 * POST /api/admin/resync-predictions
 *
 * One-time sweep that forces every prediction history record through
 * `normalizePredictionHistoryRecord` and persists the result.
 *
 * This repairs records that were stored with inverted stop/target before
 * the fix landed — those records are re-opened (monitoringStatus → Active,
 * outcome → Monitoring) so the next market sync can resolve them correctly.
 *
 * The endpoint is authenticated and safe to call multiple times (idempotent
 * — re-running after records are already clean is a no-op).
 *
 * Response:
 *   200 { repaired: number, unchanged: number, total: number }
 */

import { NextResponse } from "next/server";
import { requireAuthUser } from "@/app/_lib/auth";
import { readWorkspaceData, writeWorkspaceData } from "@/app/_lib/server/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireAuthUser();

    // readWorkspaceData already runs normalizePredictionHistoryRecord on every
    // record. Writing the data back therefore persists the corrected records.
    const data = await readWorkspaceData();

    const before = JSON.stringify(data.predictionHistory);
    await writeWorkspaceData(data);
    const after  = JSON.stringify(data.predictionHistory);

    // Count how many changed (heuristic: different JSON)
    const beforeItems = JSON.parse(before) as Record<string, unknown>[];
    const afterItems  = data.predictionHistory as Record<string, unknown>[];

    let repaired   = 0;
    let unchanged  = 0;
    for (let i = 0; i < afterItems.length; i++) {
      const b = JSON.stringify(beforeItems[i]);
      const a = JSON.stringify(afterItems[i]);
      if (b !== a) repaired++;
      else unchanged++;
    }

    return NextResponse.json({
      repaired,
      unchanged,
      total: data.predictionHistory.length,
      message: repaired > 0
        ? `Repaired ${repaired} prediction record${repaired === 1 ? "" : "s"} — inverted levels swapped and re-opened for re-resolution.`
        : `All ${unchanged} records are already clean.`,
    });
  } catch (error) {
    console.error("[resync-predictions POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Resync failed." },
      { status: 500 },
    );
  }
}
