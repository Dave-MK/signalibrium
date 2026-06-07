import { NextResponse } from "next/server";
import { readWorkspaceData } from "@/app/_lib/server/workspace-store";

/**
 * GET /api/siggi/weight-audit
 *
 * Calibration audit for Siggi's confidence scores. Compares predicted confidence
 * against actual trade outcomes across several dimensions:
 *
 *  - Confidence buckets (60-69, 70-79, 80-89, 90+)
 *  - Trade horizon (Day / Week / Month)
 *  - Direction (BUY / SELL)
 *  - Asset class (Crypto, Forex, Equities, Commodities, Indices)
 *
 * A well-calibrated system should show ~70% accuracy for 70-confidence calls,
 * ~80% for 80-confidence calls, etc. Large gaps (>15pp) indicate either
 * over- or under-confidence in that segment and should feed back into the
 * scoring weights in bot-engine.ts.
 */
export async function GET() {
  const data = await readWorkspaceData();
  const history = data.predictionHistory;

  // Only closed predictions with a clear win/loss outcome contribute to calibration.
  const resolved = history.filter(
    (r) =>
      r.monitoringStatus === "Resolved" &&
      (r.outcome === "Hit Target" || r.outcome === "Stopped"),
  );

  if (resolved.length === 0) {
    return NextResponse.json({
      message: "No resolved predictions yet. Calibration data will appear after Siggi's first closed trades.",
      totalResolved: 0,
      buckets: [],
      byHorizon: [],
      byDirection: [],
      byAssetClass: [],
      calibrationScore: null,
    });
  }

  function accuracy(records: typeof resolved) {
    if (records.length === 0) return null;
    return Math.round((records.filter((r) => r.outcome === "Hit Target").length / records.length) * 100);
  }

  function avgConfidence(records: typeof resolved) {
    if (records.length === 0) return null;
    return Math.round(records.reduce((sum, r) => sum + r.confidenceAtCall, 0) / records.length);
  }

  function calibrationGap(records: typeof resolved): number | null {
    const acc = accuracy(records);
    const conf = avgConfidence(records);
    if (acc === null || conf === null) return null;
    return acc - conf; // positive = underconfident, negative = overconfident
  }

  // ── Confidence buckets ────────────────────────────────────────────────────
  const BUCKET_RANGES = [
    { label: "≥90", min: 90, max: 100 },
    { label: "80–89", min: 80, max: 90 },
    { label: "70–79", min: 70, max: 80 },
    { label: "60–69", min: 60, max: 70 },
    { label: "<60", min: 0, max: 60 },
  ];

  const buckets = BUCKET_RANGES.map(({ label, min, max }) => {
    const group = resolved.filter((r) => r.confidenceAtCall >= min && r.confidenceAtCall < max);
    const acc = accuracy(group);
    const gap = calibrationGap(group);
    return {
      label,
      count: group.length,
      accuracy: acc,
      avgConfidence: avgConfidence(group),
      calibrationGap: gap,
      verdict:
        group.length < 5
          ? "Insufficient data"
          : gap === null
            ? "Insufficient data"
            : gap > 15
              ? "Under-confident — confidence scores are too conservative for this bucket"
              : gap < -15
                ? "Over-confident — confidence scores are too aggressive for this bucket"
                : "Well calibrated",
    };
  });

  // ── By horizon ────────────────────────────────────────────────────────────
  const horizons = ["Day", "Week", "Month"] as const;
  const byHorizon = horizons.map((horizon) => {
    const group = resolved.filter((r) => r.horizon === horizon);
    return {
      horizon,
      count: group.length,
      accuracy: accuracy(group),
      avgConfidence: avgConfidence(group),
      calibrationGap: calibrationGap(group),
    };
  });

  // ── By direction ──────────────────────────────────────────────────────────
  const directions = ["BUY", "SELL"] as const;
  const byDirection = directions.map((action) => {
    const group = resolved.filter((r) => r.actionAtCall === action);
    return {
      direction: action,
      count: group.length,
      accuracy: accuracy(group),
      avgConfidence: avgConfidence(group),
      calibrationGap: calibrationGap(group),
    };
  });

  // ── By asset class ────────────────────────────────────────────────────────
  const assetClasses = [...new Set(resolved.map((r) => r.assetClass))].sort();
  const byAssetClass = assetClasses.map((assetClass) => {
    const group = resolved.filter((r) => r.assetClass === assetClass);
    return {
      assetClass,
      count: group.length,
      accuracy: accuracy(group),
      avgConfidence: avgConfidence(group),
      calibrationGap: calibrationGap(group),
    };
  });

  // ── Overall calibration score ─────────────────────────────────────────────
  // Measures how well confidence correlates with accuracy across the full history.
  // A perfect 100 means every 70-confidence call lands at 70% accuracy, etc.
  const overallAccuracy = accuracy(resolved);
  const overallAvgConfidence = avgConfidence(resolved);
  const overallGap = overallAccuracy !== null && overallAvgConfidence !== null
    ? overallAccuracy - overallAvgConfidence
    : null;

  // Weighted calibration score: penalise buckets with large gaps more than small ones.
  const populatedBuckets = buckets.filter((b) => b.count >= 5 && b.calibrationGap !== null);
  const calibrationScore =
    populatedBuckets.length === 0
      ? null
      : Math.max(
          0,
          Math.round(
            100 -
              populatedBuckets.reduce((sum, b) => sum + Math.abs(b.calibrationGap ?? 0), 0) /
                populatedBuckets.length,
          ),
        );

  // ── Improvement hints ─────────────────────────────────────────────────────
  const hints: string[] = [];

  for (const bucket of buckets) {
    if (bucket.count < 5 || bucket.calibrationGap === null) continue;
    if (bucket.calibrationGap < -20) {
      hints.push(
        `${bucket.label}% confidence bucket is overconfident by ${Math.abs(bucket.calibrationGap)}pp — consider reducing structureScore weight or raising the minConfidence threshold for this range.`,
      );
    } else if (bucket.calibrationGap > 20) {
      hints.push(
        `${bucket.label}% confidence bucket is underconfident by ${bucket.calibrationGap}pp — actual accuracy is higher than predicted, so scores in this range may be too conservative.`,
      );
    }
  }

  for (const row of byAssetClass) {
    if (row.count < 5 || row.calibrationGap === null) continue;
    if (row.calibrationGap < -15) {
      hints.push(
        `${row.assetClass} is overconfident by ${Math.abs(row.calibrationGap)}pp — Siggi scores this class too high relative to its actual win rate.`,
      );
    } else if (row.calibrationGap > 15) {
      hints.push(
        `${row.assetClass} is underconfident by ${row.calibrationGap}pp — actual accuracy exceeds confidence scores; may be safe to ease the confidence floor for this class.`,
      );
    }
  }

  for (const row of byDirection) {
    if (row.count < 5 || row.calibrationGap === null) continue;
    if (row.calibrationGap < -15) {
      hints.push(
        `${row.direction} trades are overconfident by ${Math.abs(row.calibrationGap)}pp — consider a directional bias adjustment in the confidence formula.`,
      );
    }
  }

  return NextResponse.json({
    totalResolved: resolved.length,
    overallAccuracy,
    overallAvgConfidence,
    overallCalibrationGap: overallGap,
    calibrationScore,
    buckets,
    byHorizon,
    byDirection,
    byAssetClass,
    hints: hints.length > 0 ? hints : ["No significant calibration issues detected at current sample size."],
    generatedAt: new Date().toISOString(),
  });
}
