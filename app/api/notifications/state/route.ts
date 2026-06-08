import { NextResponse } from "next/server";
import { readWorkspaceData } from "@/app/_lib/server/workspace-store";

/**
 * GET /api/notifications/state
 *
 * Returns a minimal snapshot of the current actionable state so the client
 * can diff it against the previous snapshot and decide what to notify about.
 * Intentionally cheap — just reads the workspace, no heavy computation.
 */
export async function GET() {
  const data = await readWorkspaceData();
  const now  = Date.now();
  const TWO_HOURS  = 2 * 60 * 60 * 1000;
  const THIRTY_MIN = 30 * 60 * 1000;

  // Actionable signals: TRADEABLE setup with analysis fresher than 2 h
  const enterNowSignals = data.scannerResults
    .filter((r) => {
      if (r.tradeability !== "TRADEABLE") return false;
      if (!r.analysisUpdatedAt) return false;
      return now - Date.parse(r.analysisUpdatedAt) < TWO_HOURS;
    })
    .map((r) => ({ id: r.id, symbol: r.symbol, tradeability: r.tradeability }));

  // Siggi's current open trades
  const openTrades = data.siggiAccount.openTrades.map((t) => ({
    id: t.id, symbol: t.symbol, side: t.side,
  }));

  // Siggi's most-recently closed trade (for close alerts)
  const latestClosed = [...data.siggiAccount.closedTrades]
    .sort((a, b) => Date.parse(b.closedAt ?? "0") - Date.parse(a.closedAt ?? "0"))
    .slice(0, 1)
    .map((t) => ({
      id: t.id, symbol: t.symbol, side: t.side,
      status: t.status, realizedPnl: t.realizedPnlGbp ?? 0,
    }));

  // Events that are live RIGHT NOW (high/medium impact only to reduce noise)
  const liveEvents = data.marketEvents
    .filter((e) => e.status === "Live" && (e.impact === "High" || e.impact === "Medium"))
    .map((e) => ({ id: e.id, title: e.title, impact: e.impact }));

  // Upcoming high-impact events starting within 30 minutes
  const imminentEvents = data.marketEvents
    .filter((e) => {
      if (e.status !== "Upcoming" || e.impact !== "High") return false;
      const startsAt = Date.parse(e.startsAt);
      return Number.isFinite(startsAt) && startsAt - now < THIRTY_MIN && startsAt > now;
    })
    .map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt }));

  // ── Price alerts — check current prices from the pulse tape ──────────────
  // Build a map of symbol → latest price
  const latestPrices: Record<string, number> = {};
  for (const [symbol, points] of Object.entries(data.syncState.pricePulseTape)) {
    const last = points.at(-1);
    if (last) latestPrices[symbol] = last.price;
  }

  const triggeredAlerts = (data.priceAlerts ?? [])
    .filter((a) => {
      if (!a.enabled || a.triggeredAt) return false;
      const price = latestPrices[a.symbol];
      if (!price) return false;
      return a.condition === "above" ? price >= a.targetPrice : price <= a.targetPrice;
    })
    .map((a) => ({ id: a.id, symbol: a.symbol, label: a.label, condition: a.condition, targetPrice: a.targetPrice }));

  // ── Weekly digest — summary of closed trades from the last 7 days ────────
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const recentClosed = data.siggiAccount.closedTrades.filter((t) => {
    const at = Date.parse(t.closedAt ?? "");
    return Number.isFinite(at) && now - at < SEVEN_DAYS;
  });
  const weeklyDigest =
    recentClosed.length > 0
      ? {
          tradeCount: recentClosed.length,
          winCount:   recentClosed.filter((t) => t.status === "Hit Target").length,
          lossCount:  recentClosed.filter((t) => t.status === "Stopped").length,
          pnlGbp:     recentClosed.reduce((s, t) => s + (t.realizedPnlGbp ?? 0), 0),
        }
      : null;

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    enterNowSignals,
    openTrades,
    latestClosed,
    liveEvents,
    imminentEvents,
    triggeredAlerts,
    weeklyDigest,
  });
}
