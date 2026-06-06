import { NextResponse } from "next/server";
import { defaultWorkspaceData } from "@/app/_lib/server/workspace-seed";
import {
  readWorkspaceData,
  writeWorkspaceData,
} from "@/app/_lib/server/workspace-store";

/**
 * POST /api/siggi/reset
 *
 * Wipes Siggi's persisted account (trades, history, activity log, equity curve)
 * and resets it to the fresh £10,000 seed state so he can start a clean learning
 * cycle with the new unlimited-capital configuration.
 *
 * Also clears the tradedStatus on all prediction history records so Siggi can
 * immediately re-evaluate all active enter-now signals on the next sync.
 */
export async function POST() {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();

  const freshAccount = {
    ...defaultWorkspaceData.siggiAccount,
    createdAt: now,
    updatedAt: now,
    equityCurve: [
      {
        at: now,
        cashBalanceGbp: defaultWorkspaceData.siggiAccount.startingBalanceGbp,
        equityGbp: defaultWorkspaceData.siggiAccount.startingBalanceGbp,
        openTrades: 0,
      },
    ],
    activityLog: [
      {
        id: `siggi-reset-${Date.now()}`,
        at: now,
        type: "Reset" as const,
        symbol: null,
        detail: `Siggi account reset to GBP ${defaultWorkspaceData.siggiAccount.startingBalanceGbp.toLocaleString("en-GB")} — clean slate, full capital, all signals re-evaluated from scratch.`,
      },
    ],
  };

  // Reset all prediction history records so Siggi can re-open positions
  // based on fresh analysis — clear the traded/skipped flags entirely.
  const resetPredictionHistory = data.predictionHistory.map((record) => ({
    ...record,
    tradedStatus: null as typeof record.tradedStatus,
    updatedAt: now,
  }));

  const updated = await writeWorkspaceData({
    ...data,
    siggiAccount: freshAccount,
    predictionHistory: resetPredictionHistory,
  });

  return NextResponse.json({
    success: true,
    startingBalanceGbp: updated.siggiAccount.startingBalanceGbp,
    resetAt: now,
  });
}
