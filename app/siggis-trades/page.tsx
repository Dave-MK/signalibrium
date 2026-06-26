import {
  formatCurrencyAmount,
  formatCurrencyForDisplay,
} from "@/app/_lib/currency";
import { getDisplayCurrencyState } from "@/app/_lib/server/currency-preference";
import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { getRiskControls } from "@/app/_lib/server/repositories/risk-controls";
import { PageHeader, Panel, StatusChip, SummaryCard } from "../_components/ui";
import { TradePlanChart } from "../_components/trade-plan-chart";
import { EquityCurveChart } from "../_components/equity-curve-chart";
import { TradesCsvExportButton } from "../_components/csv-export-button";
import { DonutWithLegend, DonutChart, StatBar } from "../_components/donut-chart";
import { Sparkline } from "../_components/sparkline";
import { SiggiResetButton } from "./siggi-reset-button";
import { TradesTabs } from "./trades-tabs";
import { InlineNoteButton } from "@/app/_components/trade-note-form";
import { RiskControlsPanel } from "@/app/_components/risk-controls-panel";
import dynamic from "next/dynamic";
const SiggiLiveVsPaper = dynamic(
  () => import("@/app/_components/siggi-live-vs-paper").then((m) => ({ default: m.SiggiLiveVsPaper }))
);
import type { TradeNoteOutcome } from "@/app/_lib/server/workspace-types";

// Correlation groups — mirrors siggi-simulation.ts CORRELATION_GROUPS
const CORRELATION_GROUPS: Record<string, string[]> = {
  "crypto-btc":       ["BTC/USD","BTCUSD","BTC/USDT","BTCUSDT","XBTUSD"],
  "crypto-major":     ["ETH/USD","ETHUSD","SOL/USD","SOLUSD","BNB/USD","BNBUSD","ETH/USDT","SOL/USDT"],
  "us-big-tech":      ["AAPL","MSFT","NVDA","GOOGL","GOOG","AMZN","META"],
  "us-indices":       ["SPX500","US500","SP500","NASDAQ100","NDX","QQQ","SPY","NAS100","US100"],
  "precious-metals":  ["GOLD","XAU/USD","XAUUSD","SILVER","XAG/USD","XAGUSD"],
  "energy":           ["WTI","USOIL","BRENT","UKOIL","OIL","CL=F"],
  "gbp-pairs":        ["GBP/USD","GBPUSD","GBP/EUR","GBPEUR","GBP/JPY","GBPJPY"],
  "eur-pairs":        ["EUR/USD","EURUSD","EUR/JPY","EURJPY","EUR/GBP","EURGBP"],
};

function formatCompactTimestamp(timestamp: string | null) {
  if (!timestamp) return "Awaiting mark";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/London",
  }).format(new Date(timestamp));
}

// Account flow copy — shown in the "i" hover tooltip on each trade card
const ACCOUNT_FLOW_SECTIONS = [
  {
    heading: "How Siggi opens trades",
    body: "Every qualifying ENTER NOW signal with fresh analysis, clean R:R above 1.5:1, and sufficient confidence gets opened automatically. Capital is sized at 2% risk per trade so losses stay manageable even when many trades run at once.",
  },
  {
    heading: "Live management",
    body: "As prices move, Siggi marks each trade live, moves stops to breakeven when the move proves itself, and trails them toward target. P&L updates on every pulse — not just at close.",
  },
  {
    heading: "Learning loop",
    body: "Every open, skip, stop move, and close is written into memory. The bot refines what worked, what failed, and which conditions actually deserve trust — compounding accuracy over time.",
  },
];

function tradeStatusToNoteOutcome(status: string): TradeNoteOutcome | undefined {
  if (status === "Hit Target") return "Win";
  if (status === "Stopped")    return "Loss";
  if (status === "Breakeven")  return "Breakeven";
  return undefined;
}

/** Decimal places for price display: JPY pairs get 3, micro-prices get 4, thousands get 0. */
function priceDp(symbol: string, price: number): number {
  if (symbol.includes("JPY")) return 3;
  if (price < 10)   return 4;
  if (price < 1000) return 2;
  return 0;
}

export default async function SiggiTradesPage() {
  const [siggiAccount, displayCurrencyState, journalEntries, predictionHistory, riskControls] = await Promise.all([
    getSiggiAccount(),
    getDisplayCurrencyState(),
    listJournalEntries(),
    listPredictionHistory(),
    getRiskControls(),
  ]);

  // O(1) lookup: predictionId → prediction record
  const predictionById = new Map(predictionHistory.map((p) => [p.id, p]));

  // Map tradeId → journal entry for O(1) lookup per row
  const noteByTradeId = new Map(
    journalEntries
      .filter((e) => e.tradeId)
      .map((e) => [e.tradeId!, e]),
  );

  const liveOpenPnlGbp = siggiAccount.openTrades.reduce(
    (total, trade) => total + (trade.unrealizedPnlGbp ?? 0),
    0,
  );
  const totalBalanceGbp =
    siggiAccount.cashBalanceGbp +
    siggiAccount.openTrades.reduce((total, trade) => total + trade.stakeGbp, 0) +
    liveOpenPnlGbp;
  const resolvedTrades = siggiAccount.successfulTrades + siggiAccount.failedTrades;
  const winRate = resolvedTrades
    ? Math.round((siggiAccount.successfulTrades / resolvedTrades) * 1000) / 10
    : 0;
  const growthPct =
    siggiAccount.startingBalanceGbp > 0
      ? ((totalBalanceGbp - siggiAccount.startingBalanceGbp) / siggiAccount.startingBalanceGbp) * 100
      : 0;

  const formatGbp = (value: number) =>
    formatCurrencyAmount(value, "GBP", displayCurrencyState.currency, displayCurrencyState.rates);
  const formatUsd = (value: number, digits = 2) =>
    formatCurrencyForDisplay(value, displayCurrencyState.currency, displayCurrencyState.rates, digits);

  // Full equity curve, oldest-first — the chart component filters by period client-side
  const equityCurve = [...siggiAccount.equityCurve].reverse();

  // Portfolio heat: sum of current-stop-distance × quantity × usdToGbp for all open trades
  const usdToGbpRate = displayCurrencyState.rates.GBP ?? 0.79;
  const openRiskGbp  = siggiAccount.openTrades.reduce((total, trade) => {
    const riskPerUnit = Math.abs(trade.entryPrice - trade.stopPrice);
    return total + riskPerUnit * trade.quantity * usdToGbpRate;
  }, 0);
  const heatPct         = totalBalanceGbp > 0 ? (openRiskGbp / totalBalanceGbp) * 100 : 0;
  const maxHeatPct      = 40; // matches maxPortfolioHeatRatio in siggi-simulation.ts
  const heatFillPct     = Math.min(100, (heatPct / maxHeatPct) * 100);
  const heatTone        = heatPct > 30 ? "bg-red-400" : heatPct > 20 ? "bg-amber-400" : "bg-emerald-400";

  const latestOpenMarkAt =
    siggiAccount.openTrades
      .map((t) => t.lastMarkedAt)
      .filter((v): v is string => typeof v === "string")
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  // ── Streak + performance stats ──────────────────────────────────────────────
  // Sort closed trades newest-first for streak calculation
  const sortedClosedNewest = [...siggiAccount.closedTrades].sort(
    (a, b) => Date.parse(b.closedAt ?? "0") - Date.parse(a.closedAt ?? "0"),
  );
  let currentStreak = 0;
  let currentStreakIsWin = true;
  for (const t of sortedClosedNewest) {
    const isWin = t.status === "Hit Target" || t.status === "Breakeven";
    if (currentStreak === 0) { currentStreakIsWin = isWin; currentStreak = 1; }
    else if (isWin === currentStreakIsWin) currentStreak++;
    else break;
  }

  let longestWinStreak = 0;
  let tempWin = 0;
  for (const t of [...sortedClosedNewest].reverse()) {
    if (t.status === "Hit Target" || t.status === "Breakeven") {
      tempWin++;
      longestWinStreak = Math.max(longestWinStreak, tempWin);
    } else {
      tempWin = 0;
    }
  }

  const holdTimesHours = siggiAccount.closedTrades
    .filter((t) => t.openedAt && t.closedAt)
    .map((t) => (Date.parse(t.closedAt!) - Date.parse(t.openedAt)) / 3_600_000)
    .filter((h) => h > 0);
  const avgHoldHours = holdTimesHours.length > 0
    ? holdTimesHours.reduce((a, b) => a + b) / holdTimesHours.length
    : null;
  const avgHoldLabel = avgHoldHours === null ? null
    : avgHoldHours < 48 ? `${Math.round(avgHoldHours)}h avg hold`
    : `${Math.round(avgHoldHours / 24)}d avg hold`;

  // ── Drawdown analytics ─────────────────────────────────────────────────────
  const equityValues = equityCurve.map((s) => s.equityGbp);
  let maxDrawdownPct = 0;
  let peak = equityValues[0] ?? siggiAccount.startingBalanceGbp;
  for (const v of equityValues) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? ((peak - v) / peak) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }
  const hwm = siggiAccount.highWatermarkGbp;
  const currentDrawdownPct = hwm > 0 ? Math.max(0, ((hwm - totalBalanceGbp) / hwm) * 100) : 0;
  const closedPnl = siggiAccount.closedTrades.reduce((s, t) => s + (t.realizedPnlGbp ?? 0), 0);
  const grossLoss = siggiAccount.closedTrades
    .filter((t) => (t.realizedPnlGbp ?? 0) < 0)
    .reduce((s, t) => s + Math.abs(t.realizedPnlGbp ?? 0), 0);
  const recoveryFactor = grossLoss > 0 ? (closedPnl / grossLoss) : null;

  // ── Per-symbol P&L breakdown ────────────────────────────────────────────────
  type SymbolRow = { wins: number; losses: number; breakeven: number; pnl: number };
  const bySymbol = new Map<string, SymbolRow>();
  for (const t of siggiAccount.closedTrades) {
    const row = bySymbol.get(t.symbol) ?? { wins: 0, losses: 0, breakeven: 0, pnl: 0 };
    if (t.status === "Hit Target") row.wins++;
    else if (t.status === "Stopped") row.losses++;
    else row.breakeven++;
    row.pnl += t.realizedPnlGbp ?? 0;
    bySymbol.set(t.symbol, row);
  }
  const symbolRows = [...bySymbol.entries()]
    .map(([symbol, row]) => ({ symbol, ...row }))
    .sort((a, b) => b.pnl - a.pnl);

  // ── Confidence trend (closed trades oldest → newest) ───────────────────────
  const confidenceTrend = [...siggiAccount.closedTrades]
    .filter((t) => typeof t.confidenceAtOpen === "number")
    .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))
    .map((t) => t.confidenceAtOpen!)
    .slice(-30);

  // ── Correlated open trades ──────────────────────────────────────────────────
  const openSymbols = siggiAccount.openTrades.map((t) => t.symbol);
  // For each open trade, determine which correlation group it's in (if any), and if
  // another open trade is also in that group
  const correlationWarnings = new Map<string, string>(); // tradeId → groupName
  for (const trade of siggiAccount.openTrades) {
    for (const [groupName, members] of Object.entries(CORRELATION_GROUPS)) {
      if (members.includes(trade.symbol)) {
        const sibling = openSymbols.find(
          (s) => s !== trade.symbol && members.includes(s),
        );
        if (sibling) {
          correlationWarnings.set(trade.id, `${groupName} (also ${sibling})`);
        }
        break;
      }
    }
  }

  // ── One-line performance summary
  const pnlLine = growthPct === 0 && resolvedTrades === 0
    ? "No trades placed yet — Siggi is watching for qualifying setups."
    : growthPct >= 0
      ? `Up ${formatGbp(totalBalanceGbp - siggiAccount.startingBalanceGbp)} (+${growthPct.toFixed(1)}%) from start`
      : `Down ${formatGbp(Math.abs(totalBalanceGbp - siggiAccount.startingBalanceGbp))} (${growthPct.toFixed(1)}%) from start`;
  const streakLine = currentStreak === 0 ? null
    : currentStreakIsWin
      ? `${currentStreak}-trade win streak`
      : `${currentStreak}-trade loss streak`;
  const performanceSummary = [
    pnlLine,
    streakLine,
    resolvedTrades > 0 ? `${winRate}% win rate over ${resolvedTrades} trade${resolvedTrades === 1 ? "" : "s"}` : null,
    avgHoldLabel,
  ].filter(Boolean).join(" · ");

  // Server component: rendered once per request, so reading the clock here is
  // deterministic for this render. (The purity rule targets client re-renders.)
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Siggi"
        title="Siggi's Trades"
        description="Every qualifying signal acted on automatically — managed live, closed when it's done."
        action={<SiggiResetButton />}
      />

      {/* ── Visual KPI strip ── */}
      <div className="grid grid-cols-2 gap-[5px] sm:grid-cols-3 lg:grid-cols-6">
        {/* Total P&L */}
        <Panel className="p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-600">Total P&amp;L</p>
          <p className={`mt-1.5 text-[1.3rem] font-bold leading-none ${growthPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}%
          </p>
          <p className="mt-1 text-[0.66rem] text-slate-600">{formatGbp(totalBalanceGbp)} equity</p>
        </Panel>

        {/* Open P&L */}
        <Panel className="p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-600">Open P&amp;L</p>
          <p className={`mt-1.5 text-[1.3rem] font-bold leading-none ${liveOpenPnlGbp >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {liveOpenPnlGbp >= 0 ? "+" : ""}{totalBalanceGbp > 0 ? ((liveOpenPnlGbp / totalBalanceGbp) * 100).toFixed(1) : "0.0"}%
          </p>
          <p className="mt-1 text-[0.66rem] text-slate-600">{formatGbp(liveOpenPnlGbp)} unrealised</p>
        </Panel>

        {/* Win Rate */}
        <Panel className="p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-600">Win Rate</p>
          <p className={`mt-1.5 text-[1.3rem] font-bold leading-none ${winRate >= 55 ? "text-emerald-300" : winRate >= 40 ? "text-amber-200" : resolvedTrades > 0 ? "text-red-300" : "text-slate-500"}`}>
            {resolvedTrades > 0 ? `${winRate}%` : "—"}
          </p>
          <p className="mt-1 text-[0.66rem] text-slate-600">
            {resolvedTrades > 0 ? `${siggiAccount.successfulTrades}W / ${siggiAccount.failedTrades}L` : "No closed trades yet"}
          </p>
        </Panel>

        {/* Avg RR */}
        <Panel className="p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-600">Avg RR</p>
          {(() => {
            const rrValues = siggiAccount.closedTrades
              .filter((t) => t.entryPrice && t.stopPrice && t.targetPrice && Math.abs(t.entryPrice - t.stopPrice) > 0)
              .map((t) => Math.abs(t.targetPrice - t.entryPrice) / Math.abs(t.entryPrice - t.stopPrice))
              .filter((r) => r > 0 && r < 20);
            const avgRR = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b) / rrValues.length : null;
            return (
              <>
                <p className={`mt-1.5 text-[1.3rem] font-bold leading-none ${avgRR !== null && avgRR >= 1.5 ? "text-emerald-300" : avgRR !== null ? "text-amber-200" : "text-slate-500"}`}>
                  {avgRR !== null ? `${avgRR.toFixed(2)}` : "—"}
                </p>
                <p className="mt-1 text-[0.66rem] text-slate-600">risk/reward ratio</p>
              </>
            );
          })()}
        </Panel>

        {/* Max Drawdown */}
        <Panel className="p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-600">Max DD</p>
          <p className={`mt-1.5 text-[1.3rem] font-bold leading-none ${maxDrawdownPct > 20 ? "text-red-300" : maxDrawdownPct > 10 ? "text-amber-200" : "text-slate-400"}`}>
            {maxDrawdownPct > 0.05 ? `-${maxDrawdownPct.toFixed(1)}%` : "0%"}
          </p>
          <p className="mt-1 text-[0.66rem] text-slate-600">peak to trough</p>
        </Panel>

        {/* Total Trades */}
        <Panel className="p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-600">Total Trades</p>
          <p className="mt-1.5 text-[1.3rem] font-bold leading-none text-white">
            {siggiAccount.openTrades.length + siggiAccount.closedTrades.length}
          </p>
          <p className="mt-1 text-[0.66rem] text-slate-600">
            {siggiAccount.openTrades.length} open · {siggiAccount.closedTrades.length} closed
          </p>
        </Panel>
      </div>

      {/* ── Tabbed content ── */}
      <TradesTabs
        openCount={siggiAccount.openTrades.length}
        closedCount={siggiAccount.closedTrades.length}
        openContent={
          <Panel className="p-3 sm:p-3.5">
            <div className="space-y-3">
              {siggiAccount.openTrades.length > 0 ? (
                siggiAccount.openTrades.map((trade) => {
                  const pnl = trade.unrealizedPnlGbp ?? 0;
                  const dp = priceDp(trade.symbol, trade.entryPrice);
                  const rr = Math.abs(trade.entryPrice - trade.stopPrice) > 0
                    ? (Math.abs(trade.targetPrice - trade.entryPrice) / Math.abs(trade.entryPrice - trade.stopPrice))
                    : 0;
                  const ageHours = (nowMs - Date.parse(trade.openedAt)) / 3_600_000;
                  const ageLabel = ageHours < 48 ? `${Math.round(ageHours)}h` : `${Math.round(ageHours / 24)}d`;
                  const pred = trade.predictionId ? predictionById.get(trade.predictionId) : null;
                  return (
                    <div key={trade.id} className="signal-surface-soft rounded-[0.65rem]">
                      <div className="grid lg:grid-cols-[1fr_260px]">
                        {/* ── Left: trade details ── */}
                        <div className="p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-[0.92rem] font-semibold text-white">
                                  {trade.symbol}
                                  <span className={`ml-2 text-[0.80rem] font-semibold ${trade.side === "BUY" ? "text-emerald-300" : "text-amber-200"}`}>
                                    {trade.side === "BUY" ? "▲ LONG" : "▼ SHORT"}
                                  </span>
                                </p>
                                {/* ── "i" info button with hover tooltip ── */}
                                <div className="group/info relative">
                                  <button type="button" aria-label="How Siggi manages this trade" className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[0.62rem] font-bold text-slate-500 transition hover:border-[#00C884]/40 hover:text-[#00C884]">i</button>
                                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 scale-95 rounded-[0.5rem] border border-white/10 bg-[#111210] p-3 opacity-0 shadow-[0_16px_48px_rgba(0,0,0,0.6)] transition-all duration-150 group-hover/info:pointer-events-auto group-hover/info:scale-100 group-hover/info:opacity-100">
                                    <p className="mb-2 text-[0.70rem] font-semibold uppercase tracking-wider text-slate-500">How Siggi operates</p>
                                    {ACCOUNT_FLOW_SECTIONS.map((section) => (
                                      <div key={section.heading} className="mb-2 last:mb-0">
                                        <p className="text-[0.76rem] font-semibold text-white">{section.heading}</p>
                                        <p className="mt-0.5 text-[0.72rem] leading-[1.45] text-slate-400">{section.body}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <p className="mt-0.5 text-[0.73rem] text-slate-400">Opened {formatCompactTimestamp(trade.openedAt)}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusChip label="LIVE" />
                              <StatusChip label={`${trade.confidenceAtOpen}% CONF`} />
                              <StatusChip label={trade.stopMode.toUpperCase()} />
                              {rr > 0 && <StatusChip label={`${rr.toFixed(1)}R`} />}
                              <StatusChip label={ageLabel} />
                              {correlationWarnings.has(trade.id) && (
                                <span title={`Correlated exposure: ${correlationWarnings.get(trade.id)}`} className="inline-flex items-center gap-1 rounded-[0.25rem] bg-amber-400/10 px-1.5 py-0.5 text-[0.60rem] font-semibold text-amber-300 ring-1 ring-amber-400/20">⚠ CORRELATED</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-5">
                            <SummaryCard label="Entry" value={formatUsd(trade.entryPrice, dp)} detail="Locked from signal" />
                            <SummaryCard label="Stop" value={formatUsd(trade.stopPrice, dp)} detail="Invalidation level" />
                            <SummaryCard label="Target" value={formatUsd(trade.targetPrice, dp)} detail="Profit objective" />
                            <SummaryCard label="Live price" value={formatUsd(trade.currentPriceUsd ?? trade.entryPrice, dp)} detail={`Marked ${formatCompactTimestamp(trade.lastMarkedAt)}`} />
                            <SummaryCard label="Live P&L" value={`${pnl >= 0 ? "+" : ""}${formatGbp(pnl)}`} detail={`${trade.quantity.toFixed(4)} units · stake ${formatGbp(trade.stakeGbp)}`} tone={pnl >= 0 ? "text-emerald-300" : "text-red-200"} />
                          </div>
                          <p className="mt-2.5 text-[0.78rem] leading-5 text-slate-400">{trade.narrative}</p>
                          {/* ── Richer reasoning from linked prediction ── */}
                          {pred && (
                            <div className="mt-3 space-y-2 border-t border-white/6 pt-3">
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.70rem] text-slate-500">
                                <span>Strategy <span className="text-slate-300">{pred.strategyAtCall}</span></span>
                                <span>Timeframe <span className="text-slate-300">{pred.timeframe}</span></span>
                                <span>Horizon <span className="text-slate-300">{pred.horizon}</span></span>
                                <span>Trend <span className={`font-medium ${pred.trendAtCall === "Bullish" ? "text-emerald-300" : pred.trendAtCall === "Bearish" ? "text-red-300" : "text-slate-300"}`}>{pred.trendAtCall}</span></span>
                                <span>Conf at call <span className="text-[#00C884]/80">{pred.confidenceAtCall}%</span></span>
                              </div>
                              {pred.indicatorSnapshotAtCall.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[0.60rem] font-semibold uppercase tracking-[0.13em] text-slate-600">Indicators at call</p>
                                  <div className="flex flex-wrap gap-1">
                                    {pred.indicatorSnapshotAtCall.map((item, i) => (
                                      <span key={i} className="inline-block rounded-[0.22rem] bg-white/[0.04] px-1.5 py-0.5 text-[0.65rem] text-slate-400 ring-1 ring-white/[0.06]">{item}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {pred.strategySnapshotAtCall.length > 0 && (
                                <div>
                                  <p className="mb-1 text-[0.60rem] font-semibold uppercase tracking-[0.13em] text-slate-600">Strategy checks</p>
                                  <div className="flex flex-wrap gap-1">
                                    {pred.strategySnapshotAtCall.map((item, i) => {
                                      const isPass = item.startsWith("✓") || item.startsWith("✅");
                                      const isFail = item.startsWith("✗") || item.startsWith("❌") || item.startsWith("⚠");
                                      return (
                                        <span key={i} className={`inline-block rounded-[0.22rem] px-1.5 py-0.5 text-[0.65rem] ring-1 ${isPass ? "bg-emerald-400/5 text-emerald-300/80 ring-emerald-400/15" : isFail ? "bg-red-400/5 text-red-300/80 ring-red-400/15" : "bg-white/[0.04] text-slate-400 ring-white/[0.06]"}`}>{item}</span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {pred.eventContextAtCall && (
                                <div>
                                  <p className="mb-1 text-[0.60rem] font-semibold uppercase tracking-[0.13em] text-slate-600">Event context</p>
                                  <p className="text-[0.70rem] leading-[1.45] text-slate-500">{pred.eventContextAtCall}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* ── Right: trade plan chart ── */}
                        <div className="flex min-h-[160px] items-stretch overflow-hidden rounded-br-[0.4rem] rounded-tr-[0.4rem] border-t border-white/6 lg:min-h-0 lg:border-l lg:border-t-0">
                          <div className="flex w-full flex-col">
                            <p className="px-3 pt-2.5 text-[0.64rem] font-semibold uppercase tracking-wider text-slate-600">Trade plan</p>
                            <div className="flex-1 px-1 pb-2">
                              <TradePlanChart entry={trade.entryPrice} stop={trade.stopPrice} target={trade.targetPrice} current={trade.currentPriceUsd} side={trade.side} symbol={trade.symbol} initialStopPrice={trade.initialStopPrice} stopMode={trade.stopMode} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="signal-surface-soft rounded-[0.65rem] p-4 text-center">
                  <p className="text-[0.84rem] font-semibold text-slate-300">No open trades</p>
                  <p className="mt-1 text-[0.76rem] text-slate-500">The next qualifying ENTER NOW signal will open here automatically on the next sync.</p>
                </div>
              )}
            </div>
          </Panel>
        }
        closedContent={
          <Panel className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.02] px-3 py-2.5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {siggiAccount.closedTrades.length} closed trade{siggiAccount.closedTrades.length === 1 ? "" : "s"}
              </p>
              <TradesCsvExportButton trades={siggiAccount.closedTrades} />
            </div>
            {siggiAccount.closedTrades.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-[0.84rem] text-slate-400">No closed trades yet.</p>
              </div>
            ) : (
              <>
                <div className="hidden border-b border-white/6 bg-white/[0.015] px-3 py-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.13em] text-slate-600 lg:grid lg:grid-cols-[minmax(0,1.05fr)_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_0.85fr_auto] lg:gap-3">
                  <span>Instrument</span><span>Side</span><span>Entry</span><span>Stop</span><span>Target</span><span>P&L</span><span>Status</span><span>Note</span>
                </div>
                <div>
                  {siggiAccount.closedTrades.slice(0, 30).map((trade) => {
                    const dp  = trade.symbol.includes("JPY") ? 3 : trade.entryPrice < 10 ? 4 : trade.entryPrice < 1000 ? 2 : 0;
                    const pnl = trade.realizedPnlGbp ?? 0;
                    const statusLabel = trade.status === "Hit Target" ? "WIN" : trade.status === "Stopped" ? "LOSS" : trade.status === "Breakeven" ? "BREAKEVEN" : trade.status.toUpperCase();
                    const existingNote   = noteByTradeId.get(trade.id);
                    const defaultOutcome = tradeStatusToNoteOutcome(trade.status);
                    return (
                      <div key={trade.id} className="border-b border-white/5 px-3 py-2.5 last:border-b-0">
                        <div className="lg:hidden">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-[0.86rem] font-semibold text-white">{trade.symbol}</p>
                                <span className={`text-[0.78rem] font-semibold ${trade.side === "BUY" ? "text-emerald-300" : "text-amber-200"}`}>{trade.side === "BUY" ? "LONG" : "SHORT"}</span>
                              </div>
                              <p className="mt-0.5 text-[0.70rem] text-slate-500">{trade.instrumentName} · {trade.closedAt ? formatCompactTimestamp(trade.closedAt) : "Open"}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <StatusChip label={statusLabel} />
                              <p className={`mt-1 text-[0.82rem] font-semibold ${pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pnl >= 0 ? "+" : ""}{formatGbp(pnl)}</p>
                            </div>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.70rem] text-slate-500">
                            <span>Entry <span className="text-slate-300">{formatUsd(trade.entryPrice, dp)}</span></span>
                            <span>Stop <span className="text-slate-300">{formatUsd(trade.stopPrice, dp)}</span></span>
                            <span>Target <span className="text-slate-300">{formatUsd(trade.targetPrice, dp)}</span></span>
                          </div>
                          <div className="mt-2"><InlineNoteButton tradeId={trade.id} symbol={trade.symbol} defaultOutcome={defaultOutcome} existingEntry={existingNote} /></div>
                        </div>
                        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1.05fr)_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_0.85fr_auto] lg:items-start lg:gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[0.84rem] font-semibold text-white">{trade.symbol}<span className="ml-1.5 text-[0.74rem] font-normal text-slate-500">{trade.instrumentName}</span></p>
                            <p className="mt-0.5 text-[0.70rem] text-slate-500">{trade.closedAt ? formatCompactTimestamp(trade.closedAt) : "Open"}</p>
                          </div>
                          <div className={`text-[0.82rem] font-semibold ${trade.side === "BUY" ? "text-emerald-300" : "text-amber-200"}`}>{trade.side === "BUY" ? "LONG" : "SHORT"}</div>
                          <div className="text-[0.80rem] text-slate-300">{formatUsd(trade.entryPrice, dp)}</div>
                          <div className="text-[0.80rem] text-slate-300">{formatUsd(trade.stopPrice, dp)}</div>
                          <div className="text-[0.80rem] text-slate-300">{formatUsd(trade.targetPrice, dp)}</div>
                          <div className={`text-[0.82rem] font-semibold ${pnl >= 0 ? "text-emerald-300" : "text-red-200"}`}>{pnl >= 0 ? "+" : ""}{formatGbp(pnl)}</div>
                          <div><StatusChip label={statusLabel} /></div>
                          <div className="pt-0.5"><InlineNoteButton tradeId={trade.id} symbol={trade.symbol} defaultOutcome={defaultOutcome} existingEntry={existingNote} /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Panel>
        }
        analyticsContent={
          <div className="space-y-[5px]">
            {/* ── Two-column: win/loss donut + capital allocation ── */}
            <div className="grid gap-[5px] lg:grid-cols-[1fr_1fr]">

        {/* Left — Win/loss donut + key stats */}
        <Panel className="p-3 sm:p-4">
          <p className="micro-label mb-3">Performance overview</p>
          <div className="flex items-start gap-4">
            <DonutChart
              size={108}
              thickness={16}
              centerLabel={resolvedTrades > 0 ? `${winRate}%` : "—"}
              centerSublabel="win rate"
              segments={[
                { value: siggiAccount.successfulTrades, color: "#34d399", label: "Wins" },
                { value: siggiAccount.failedTrades,     color: "#f87171", label: "Losses" },
              ]}
            />
            <div className="min-w-0 flex-1 space-y-2.5">
              {[
                {
                  label: "Wins",
                  value: siggiAccount.successfulTrades,
                  pct: resolvedTrades > 0 ? Math.round((siggiAccount.successfulTrades / resolvedTrades) * 100) : 0,
                  color: "#34d399",
                },
                {
                  label: "Losses",
                  value: siggiAccount.failedTrades,
                  pct: resolvedTrades > 0 ? Math.round((siggiAccount.failedTrades / resolvedTrades) * 100) : 0,
                  color: "#f87171",
                },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-[0.69rem]">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="font-semibold text-white">{row.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-[5px] pt-1">
                <div className="signal-surface-soft rounded-[0.5rem] px-2 py-1.5">
                  <p className="text-[0.60rem] text-slate-500">Streak</p>
                  <p className={`text-[0.82rem] font-bold ${currentStreak === 0 ? "text-slate-500" : currentStreakIsWin ? "text-emerald-300" : "text-red-300"}`}>
                    {currentStreak === 0 ? "—" : `${currentStreak}${currentStreakIsWin ? "W" : "L"}`}
                  </p>
                </div>
                <div className="signal-surface-soft rounded-[0.5rem] px-2 py-1.5">
                  <p className="text-[0.60rem] text-slate-500">Best streak</p>
                  <p className="text-[0.82rem] font-bold text-[#00C884]/80">{longestWinStreak > 0 ? `${longestWinStreak}W` : "—"}</p>
                </div>
                <div className="signal-surface-soft rounded-[0.5rem] px-2 py-1.5">
                  <p className="text-[0.60rem] text-slate-500">Avg hold</p>
                  <p className="text-[0.82rem] font-bold text-slate-300">
                    {avgHoldHours === null ? "—" : avgHoldHours < 48 ? `${Math.round(avgHoldHours)}h` : `${Math.round(avgHoldHours / 24)}d`}
                  </p>
                </div>
                <div className="signal-surface-soft rounded-[0.5rem] px-2 py-1.5">
                  <p className="text-[0.60rem] text-slate-500">Resets</p>
                  <p className="text-[0.82rem] font-bold text-amber-200">{siggiAccount.resetCount}</p>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* Right — Equity + portfolio composition */}
        <Panel className="p-3 sm:p-4">
          <p className="micro-label mb-3">Capital allocation</p>

          {/* Portfolio composition donut */}
          <div className="flex items-start gap-4 mb-3">
            <DonutChart
              size={108}
              thickness={16}
              centerLabel={formatGbp(totalBalanceGbp)}
              centerSublabel="equity"
              segments={[
                { value: siggiAccount.cashBalanceGbp,
                  color: "#64748b", label: "Free cash" },
                { value: siggiAccount.openTrades.reduce((s, t) => s + t.stakeGbp, 0),
                  color: "#22d3ee", label: "Open stakes" },
                { value: Math.max(0, liveOpenPnlGbp),
                  color: "#34d399", label: "Unrealised gain" },
              ]}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              {[
                { label: "Free cash",        value: formatGbp(siggiAccount.cashBalanceGbp), color: "#64748b" },
                { label: "Open stakes",      value: formatGbp(siggiAccount.openTrades.reduce((s,t)=>s+t.stakeGbp,0)), color: "#22d3ee" },
                { label: "Unrealised P&L",   value: `${liveOpenPnlGbp >= 0 ? "+" : ""}${formatGbp(liveOpenPnlGbp)}`, color: liveOpenPnlGbp >= 0 ? "#34d399" : "#f87171" },
                { label: "High watermark",   value: formatGbp(siggiAccount.highWatermarkGbp), color: "#a78bfa" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
                    <span className="text-[0.68rem] text-slate-400">{row.label}</span>
                  </div>
                  <span className="text-[0.72rem] font-semibold text-white">{row.value}</span>
                </div>
              ))}
              <div className="pt-1">
                <div className="flex items-center justify-between text-[0.68rem] mb-1">
                  <span className="font-semibold text-slate-400">Growth vs start</span>
                  <span className={`font-bold ${growthPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.abs(growthPct))}%`,
                      background: growthPct >= 0 ? "#34d399" : "#f87171",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio heat */}
          <div className="border-t border-white/6 pt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Portfolio heat</p>
              <p className={`text-[0.72rem] font-semibold ${heatPct > 30 ? "text-red-300" : heatPct > 20 ? "text-amber-300" : "text-emerald-300"}`}>
                {heatPct.toFixed(1)}%
                <span className="ml-1.5 font-normal text-slate-500">/ {maxHeatPct}% cap · {formatGbp(openRiskGbp)} at risk</span>
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${heatTone}`}
                style={{ width: `${heatFillPct}%` }}
              />
            </div>
            <p className="mt-1 text-[0.62rem] text-slate-600">
              Open risk as % of equity. Siggi caps new entries when heat would exceed {maxHeatPct}%.
            </p>
          </div>
        </Panel>
      </div>
      {/* ── Equity curve chart + activity log ── */}
      <div className="grid gap-[5px] xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-3 sm:p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="micro-label">Equity curve</p>
            <p className="text-[0.72rem] text-slate-500">
              {equityCurve.length} total snapshots
            </p>
          </div>
          <EquityCurveChart
            curve={equityCurve}
            startingBalanceGbp={siggiAccount.startingBalanceGbp}
          />
          {equityCurve.length > 0 && (
            <div className="mt-3 grid gap-[5px] sm:grid-cols-3">
              <SummaryCard
                label="Starting balance"
                value={formatGbp(siggiAccount.startingBalanceGbp)}
                detail="Paper account seed"
              />
              <SummaryCard
                label="Current equity"
                value={formatGbp(totalBalanceGbp)}
                detail="Cash + open stakes + unrealised P&L"
                tone={totalBalanceGbp >= siggiAccount.startingBalanceGbp ? "text-emerald-300" : "text-red-200"}
              />
              <SummaryCard
                label="Peak equity"
                value={formatGbp(siggiAccount.highWatermarkGbp)}
                detail="All-time high watermark"
                tone="text-[#00C884]/80"
              />
            </div>
          )}

          {/* Drawdown analytics strip */}
          <div className="mt-3 border-t border-white/6 pt-3 grid gap-[5px] sm:grid-cols-3">
            <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
              <p className="text-[0.60rem] text-slate-500 uppercase tracking-wider mb-1">Max drawdown</p>
              <p className={`text-[0.86rem] font-bold ${maxDrawdownPct > 20 ? "text-red-300" : maxDrawdownPct > 10 ? "text-amber-200" : "text-emerald-300"}`}>
                {maxDrawdownPct > 0 ? `-${maxDrawdownPct.toFixed(1)}%` : "—"}
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, maxDrawdownPct * 2)}%`, background: maxDrawdownPct > 20 ? "#f87171" : maxDrawdownPct > 10 ? "#fbbf24" : "#34d399" }}
                />
              </div>
            </div>
            <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
              <p className="text-[0.60rem] text-slate-500 uppercase tracking-wider mb-1">Current drawdown</p>
              <p className={`text-[0.86rem] font-bold ${currentDrawdownPct > 15 ? "text-red-300" : currentDrawdownPct > 7 ? "text-amber-200" : "text-emerald-300"}`}>
                {currentDrawdownPct > 0.05 ? `-${currentDrawdownPct.toFixed(1)}%` : "At HWM"}
              </p>
              <p className="mt-0.5 text-[0.62rem] text-slate-600">from high watermark</p>
            </div>
            <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
              <p className="text-[0.60rem] text-slate-500 uppercase tracking-wider mb-1">Recovery factor</p>
              <p className={`text-[0.86rem] font-bold ${recoveryFactor === null ? "text-slate-500" : recoveryFactor >= 1.5 ? "text-emerald-300" : recoveryFactor >= 0.8 ? "text-amber-200" : "text-red-300"}`}>
                {recoveryFactor === null ? "—" : recoveryFactor.toFixed(2)}
              </p>
              <p className="mt-0.5 text-[0.62rem] text-slate-600">net P&amp;L ÷ gross loss</p>
            </div>
          </div>

          {/* Confidence trend sparkline */}
          {confidenceTrend.length >= 3 && (
            <div className="mt-3 border-t border-white/6 pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[0.60rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Confidence trend (last {confidenceTrend.length} trades)</p>
                <span className="text-[0.68rem] text-slate-500">
                  avg {Math.round(confidenceTrend.reduce((a, b) => a + b, 0) / confidenceTrend.length)}%
                </span>
              </div>
              <Sparkline data={confidenceTrend} className="h-7 w-full" />
            </div>
          )}
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Recent activity</p>
          <div className="mt-3 space-y-2">
            {siggiAccount.activityLog.slice(0, 12).map((activity) => (
              <div key={activity.id} className="signal-surface-soft rounded-[0.65rem] p-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.84rem] font-semibold text-white">
                      {activity.symbol ? `${activity.symbol}` : "System"}
                      <span className="ml-1.5 text-[0.72rem] font-normal text-slate-400">/ {activity.type}</span>
                    </p>
                    <p className="mt-0.5 text-[0.70rem] text-slate-500">
                      {formatCompactTimestamp(activity.at)}
                    </p>
                  </div>
                  <StatusChip label={activity.type.toUpperCase()} />
                </div>
                <p className="mt-1.5 text-[0.76rem] leading-[1.45] text-slate-400">{activity.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Per-symbol P&L breakdown ── */}
      {symbolRows.length > 0 && (
        <div className="grid gap-[5px] xl:grid-cols-[1.2fr_0.8fr]">
          <Panel className="p-3 sm:p-3.5">
            <p className="micro-label mb-3">Performance by instrument</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.76rem]">
                <thead>
                  <tr className="border-b border-white/6 text-[0.63rem] font-semibold uppercase tracking-[0.13em] text-slate-600">
                    <th className="pb-1.5 text-left">Symbol</th>
                    <th className="pb-1.5 text-center">W</th>
                    <th className="pb-1.5 text-center">L</th>
                    <th className="pb-1.5 text-center">BE</th>
                    <th className="pb-1.5 text-right">Win%</th>
                    <th className="pb-1.5 text-right">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {symbolRows.slice(0, 12).map((row) => {
                    const total = row.wins + row.losses + row.breakeven;
                    const wr = total > 0 ? Math.round(((row.wins + row.breakeven) / total) * 100) : 0;
                    return (
                      <tr key={row.symbol} className="border-b border-white/4 last:border-b-0">
                        <td className="py-2 font-semibold text-white">{row.symbol}</td>
                        <td className="py-2 text-center text-emerald-300">{row.wins}</td>
                        <td className="py-2 text-center text-red-300">{row.losses}</td>
                        <td className="py-2 text-center text-slate-400">{row.breakeven}</td>
                        <td className="py-2 text-right">
                          <span className={wr >= 60 ? "text-emerald-300" : wr <= 40 ? "text-red-300" : "text-amber-200"}>
                            {total > 0 ? `${wr}%` : "—"}
                          </span>
                        </td>
                        <td className={`py-2 text-right font-semibold ${row.pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {row.pnl >= 0 ? "+" : ""}{formatGbp(row.pnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Strategy taxonomy — win rate by outcome pattern */}
          <Panel className="p-3 sm:p-3.5">
            <p className="micro-label mb-3">Setup taxonomy</p>
            <div className="space-y-2.5">
              {[
                {
                  label: "High conviction (≥80% conf)",
                  trades: siggiAccount.closedTrades.filter((t) => (t.confidenceAtOpen ?? 0) >= 80),
                  color: "#34d399",
                },
                {
                  label: "Standard (65–79% conf)",
                  trades: siggiAccount.closedTrades.filter(
                    (t) => (t.confidenceAtOpen ?? 0) >= 65 && (t.confidenceAtOpen ?? 0) < 80,
                  ),
                  color: "#22d3ee",
                },
                {
                  label: "Speculative (<65% conf)",
                  trades: siggiAccount.closedTrades.filter((t) => (t.confidenceAtOpen ?? 0) < 65),
                  color: "#a78bfa",
                },
              ].map((group) => {
                const wins = group.trades.filter(
                  (t) => t.status === "Hit Target" || t.status === "Breakeven",
                ).length;
                const total = group.trades.length;
                const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
                return (
                  <div key={group.label}>
                    <div className="flex items-center justify-between text-[0.70rem] mb-1">
                      <span className="text-slate-400">{group.label}</span>
                      <span className="font-semibold text-white">
                        {total > 0 ? `${wr}% · ${total}T` : "No data"}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${wr}%`,
                          background: group.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-[0.64rem] leading-4 text-slate-600">
                Confidence tier at open → win rate. High-conviction setups should outperform over a large sample.
              </p>
            </div>
          </Panel>
        </div>
      )}
          </div>
        }
      />

      {/* ── Live vs paper & verdict accuracy ── */}
      {siggiAccount.closedTrades.length > 0 && (
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label mb-3">Live execution vs paper simulation</p>
          <SiggiLiveVsPaper closedTrades={siggiAccount.closedTrades} />
        </Panel>
      )}

      {/* ── Risk guard-rails ── */}
      <RiskControlsPanel initial={riskControls} />
    </div>
  );
}
