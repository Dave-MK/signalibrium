import { NextRequest, NextResponse } from "next/server";
import { generateOpportunityAnalysis } from "@/app/_lib/server/opportunity-analysis";
import {
  listScannerResults,
  updateScannerResult,
} from "@/app/_lib/server/repositories/scanner-results";

/**
 * POST /api/scanner-results/analyze-stale[?count=N]
 *
 * Finds the N most stale scanner results and runs Siggi's full opportunity
 * analysis on each one sequentially.  Default count is 1 (one per background
 * intelligence-sync tick).  Pass ?count=all or a large number from the manual
 * "Refresh all" button to analyse the entire universe in one shot.
 */
export async function POST(request: NextRequest) {
  const countParam = request.nextUrl.searchParams.get("count");
  // "all" or 0 means no cap — analyse every eligible result
  const batchSize =
    countParam === "all" || countParam === "0"
      ? Infinity
      : Math.max(1, Number(countParam) || 1);

  const results = await listScannerResults();
  const eligible = results.filter((r) => r.analysisStatus !== "Analysing");

  if (eligible.length === 0) {
    return NextResponse.json({ analysed: 0, reason: "No eligible results" });
  }

  // Sort: null analysis first, then by oldest analysisUpdatedAt
  const sorted = [...eligible].sort((a, b) => {
    if (!a.analysis && b.analysis) return -1;
    if (a.analysis && !b.analysis) return 1;
    const aTime = a.analysisUpdatedAt ?? "0";
    const bTime = b.analysisUpdatedAt ?? "0";
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
  });

  const targets = sorted.slice(0, batchSize);
  const analysedSymbols: string[] = [];
  const errors: string[] = [];

  for (const target of targets) {
    try {
      await updateScannerResult(target.id, { analysisStatus: "Analysing" });
      const analysis = await generateOpportunityAnalysis(target);
      const updated = await updateScannerResult(target.id, {
        analysis,
        analysisStatus: "Analysed",
        analysisUpdatedAt: analysis.analyzedAt,
      });
      analysedSymbols.push(updated?.symbol ?? target.symbol);
    } catch (error) {
      await updateScannerResult(target.id, {
        analysisStatus: target.analysis ? "Analysed" : "Ranked",
      });
      errors.push(
        `${target.symbol}: ${error instanceof Error ? error.message : "Analysis failed"}`,
      );
    }
  }

  return NextResponse.json({
    analysed: analysedSymbols.length,
    symbols: analysedSymbols,
    errors: errors.length > 0 ? errors : undefined,
  });
}
