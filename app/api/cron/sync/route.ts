import { NextResponse } from "next/server";
import { syncExternalMarketData } from "@/app/_lib/server/market-data/sync-market-data";

/**
 * GET /api/cron/sync
 *
 * Vercel Cron target — runs every 5 minutes (see vercel.json).
 * Triggers a full market-data sync: fetches live prices, refreshes
 * stale analyses, resolves predictions, and runs Siggi's simulation
 * so Siggi stays active even when no browser tab is open.
 *
 * Security: Vercel sets CRON_SECRET automatically and sends it as
 *   Authorization: Bearer <CRON_SECRET>
 * with every cron invocation.  When the secret is present we reject
 * any request that doesn't carry it.  In local dev the secret is
 * absent so the endpoint is unrestricted (useful for manual testing).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — Vercel Hobby: 10 s, Pro: 60 s

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const summary = await syncExternalMarketData();

    return NextResponse.json({
      ok: true,
      syncedAt: summary.syncedAt,
      syncedSymbols: summary.syncedSymbols.length,
      skippedSymbols: summary.skippedSymbols.length,
      warnings: summary.warnings.length,
    });
  } catch (error) {
    console.error("[cron/sync] sync failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 },
    );
  }
}
