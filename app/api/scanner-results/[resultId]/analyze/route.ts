import { NextResponse } from "next/server";
import { generateOpportunityAnalysis } from "@/app/_lib/server/opportunity-analysis";
import {
  getScannerResultById,
  updateScannerResult,
} from "@/app/_lib/server/repositories/scanner-results";

export async function POST(
  _request: Request,
  context: { params: Promise<{ resultId: string }> },
) {
  const { resultId } = await context.params;
  const scannerResult = await getScannerResultById(resultId);

  if (!scannerResult) {
    return NextResponse.json({ error: "Scanner result not found" }, { status: 404 });
  }

  try {
    await updateScannerResult(resultId, {
      analysisStatus: "Analysing",
    });

    const analysis = await generateOpportunityAnalysis(scannerResult);
    const updatedScannerResult = await updateScannerResult(resultId, {
      analysis,
      analysisStatus: "Analysed",
      analysisUpdatedAt: analysis.analyzedAt,
    });

    return NextResponse.json({ scannerResult: updatedScannerResult });
  } catch (error) {
    await updateScannerResult(resultId, {
      analysisStatus: scannerResult.analysis ? "Analysed" : "Ranked",
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to analyze setup" },
      { status: 500 },
    );
  }
}
