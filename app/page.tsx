import Link from "next/link";
import { buildBotOpportunityView, summarizePredictionAccuracy } from "@/app/_lib/bot-engine";
import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listConfirmationChecks } from "@/app/_lib/server/repositories/confirmation-checks";
import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import type { PersistedMarketEvent } from "@/app/_lib/server/workspace-types";
import { getMarketSnapshot } from "@/app/_lib/server/repositories/market-snapshot";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import { listBrokerConnections } from "@/app/_lib/server/repositories/broker-connections";
import { ActionLink, PageHeader, Panel } from "./_components/ui";
import { DonutWithLegend, DonutChart, StatBar } from "./_components/donut-chart";
import { DashboardPositionsWidget } from "./_components/dashboard-positions-widget";


export default async function DashboardPage() {
  const [
    assets,
    backtests,
    confirmationChecks,
    marketEvents,
    marketSnapshot,
    predictionHistory,
    scannerResults,
    siggiAccount,
    brokerConnections,
  ] = await Promise.all([
    listAssets(),
    listBacktests(),
    listConfirmationChecks(),
    listMarketEvents(),
    getMarketSnapshot(),
    listPredictionHistory(),
    listScannerResults(),
    getSiggiAccount(),
    listBrokerConnections(),
  ]);

  const primaryConnection = brokerConnections.find((c) => c.status === "connected") ?? null;

  const siggiOpenSymbols = new Set(siggiAccount.openTrades.map((t) => t.symbol));
  const assetsBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));

  const rankedViews = scannerResults
    .filter((setup) => setup.tradeability !== "BLOCKED")
    .map((setup) =>
      buildBotOpportunityView(
        setup,
        assetsBySymbol.get(setup.symbol) ?? null,
        confirmationChecks,
        marketEvents,
        backtests,
        predictionHistory,
      ),
    )
    .sort((left, right) => right.rankScore - left.rankScore);

  const nowEntry = rankedViews[0] ?? null;

  const predictionAccuracy = summarizePredictionAccuracy(predictionHistory);

  const tradeableCount = rankedViews.filter((v) => v.decision.label === "ENTER NOW").length;
  const openTradeCount = siggiAccount.openTrades.length;

  // ── Market Pulse computations ────────────────────────────────────────────
  const latestEquityGbp = siggiAccount.equityCurve.at(-1)?.equityGbp ?? siggiAccount.cashBalanceGbp;
  const growthPct = siggiAccount.startingBalanceGbp > 0
    ? ((latestEquityGbp - siggiAccount.startingBalanceGbp) / siggiAccount.startingBalanceGbp) * 100
    : 0;
  const totalResolved = siggiAccount.successfulTrades + siggiAccount.failedTrades;
  const winRate = totalResolved > 0 ? Math.round((siggiAccount.successfulTrades / totalResolved) * 100) : null;
  const rrValues = siggiAccount.closedTrades
    .filter((t) => Math.abs(t.entryPrice - t.stopPrice) > 0)
    .map((t) => Math.abs(t.targetPrice - t.entryPrice) / Math.abs(t.entryPrice - t.stopPrice))
    .filter((r) => r > 0 && r < 20);
  const avgRR = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b) / rrValues.length : null;
  // Sparkline from equity curve
  const sparkRaw = siggiAccount.equityCurve.slice(-28);
  const sparkValues = sparkRaw.length > 1 ? sparkRaw.map((p) => p.equityGbp) : [siggiAccount.cashBalanceGbp, siggiAccount.cashBalanceGbp];
  const sparkMin = Math.min(...sparkValues);
  const sparkMax = Math.max(...sparkValues);
  const sparkRange = sparkMax - sparkMin || 1;
  const buildSparkPath = (w: number, h: number) =>
    sparkValues
      .map((v, i) => {
        const x = ((i / (sparkValues.length - 1)) * w).toFixed(1);
        const y = (h - ((v - sparkMin) / sparkRange) * h * 0.85).toFixed(1);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  // ─────────────────────────────────────────────────────────────────────────

  // ── Market events calendar — computed once before render ─────────────────
  const calendarStartOfToday = new Date();
  calendarStartOfToday.setHours(0, 0, 0, 0);
  const calendarDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calendarStartOfToday.getTime() + i * 86_400_000);
    return d;
  });
  const calendarEventsByDay = calendarDays.map((day) => {
    const dayStart = day.getTime();
    const dayEnd = dayStart + 86_400_000;
    const events = marketEvents.filter((e) => {
      const t = Date.parse(e.startsAt);
      return t >= dayStart && t < dayEnd;
    });
    return { day, events };
  });
  const calendarImpactColor = (impact: PersistedMarketEvent["impact"]) =>
    impact === "High" ? "#f87171" : impact === "Medium" ? "#fbbf24" : "#64748b";
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Your Trading Command Centre."
        description="Siggi scans every market, ranks every opportunity, and tells you exactly what to act on — right now."
        action={<ActionLink href="/scanner">All Opportunities</ActionLink>}
      />

      {/* ── Market Pulse strip ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06]">

        {/* ─ Row 1: KPI metrics ─ */}
        <div className="grid grid-cols-2 divide-x divide-white/[0.05] bg-[#0D0E0C] sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              {
                label: "Total P&L",
                value: `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(2)}%`,
                detail: "All Time",
                tone: growthPct >= 0 ? "text-emerald-300" : "text-red-300",
                href: "/siggis-trades",
                spark: true,
              },
              {
                label: "Win Rate",
                value: winRate !== null ? `${winRate}%` : "—",
                detail: "Last 90 Days",
                tone: (winRate ?? 0) >= 60 ? "text-white" : "text-amber-200",
                href: "/siggis-trades",
                spark: false,
              },
              {
                label: "Total Signals",
                value: predictionHistory.length.toLocaleString(),
                detail: "All Time",
                tone: "text-white",
                href: "/history",
                spark: false,
              },
              {
                label: "Avg. R:R",
                value: avgRR !== null ? avgRR.toFixed(2) : "—",
                detail: "Last 90 Days",
                tone: "text-white",
                href: undefined,
                spark: false,
              },
              {
                label: "Active Trades",
                value: `${openTradeCount}`,
                detail: "Live Positions",
                tone: openTradeCount > 0 ? "text-[#00C884]" : "text-white",
                href: "/siggis-trades",
                spark: false,
              },
              {
                label: "Market Mode",
                value: marketSnapshot.state,
                detail: "Today",
                tone:
                  marketSnapshot.breadthScore >= 60
                    ? "text-[#00C884]"
                    : marketSnapshot.breadthScore <= 40
                      ? "text-red-300"
                      : "text-amber-200",
                href: undefined,
                spark: false,
                dot: true,
              },
            ] as { label: string; value: string; detail: string; tone: string; href?: string; spark: boolean; dot?: boolean }[]
          ).map(({ label, value, detail, tone, href, spark, dot }) => {
            const cell = (
              <div className="flex flex-col justify-center px-4 py-4">
                <p className="text-[0.60rem] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                <div className="mt-1 flex items-end gap-2">
                  <p className={`text-[1.1rem] font-bold leading-none ${tone}`}>{value}</p>
                  {dot && (
                    <span
                      className="mb-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          marketSnapshot.breadthScore >= 60 ? "#00C884"
                            : marketSnapshot.breadthScore <= 40 ? "#f87171"
                            : "#fbbf24",
                      }}
                    />
                  )}
                  {spark && sparkValues.length > 1 && (
                    <svg viewBox={`0 0 56 20`} className="mb-0.5 h-4 w-12 shrink-0" fill="none" preserveAspectRatio="none">
                      <path d={buildSparkPath(56, 20)} stroke={growthPct >= 0 ? "#34d399" : "#f87171"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <p className="mt-1 text-[0.62rem] text-slate-600">{detail}</p>
              </div>
            );
            return href ? (
              <Link key={label} href={href} className="transition hover:bg-white/[0.03]">
                {cell}
              </Link>
            ) : (
              <div key={label}>{cell}</div>
            );
          })}
        </div>

        {/* ─ Row 2: Market Pulse panel ─ */}
        <div className="flex min-h-[5.5rem] items-center border-t border-white/[0.05] bg-[#091410] px-5 py-4">

          {/* Left — label + state + description */}
          <div className="w-52 shrink-0 border-r border-white/[0.05] pr-5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <svg viewBox="0 0 20 14" className="h-3 w-[1.1rem] text-[#00C884]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 7 4.5 2 7.5 11 11 5 14 8.5 17 4 19 7" />
              </svg>
              <span className="text-[0.60rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Market Pulse</span>
            </div>
            <p
              className={`text-[1.55rem] font-bold leading-none ${
                marketSnapshot.breadthScore >= 60
                  ? "text-emerald-300"
                  : marketSnapshot.breadthScore <= 40
                    ? "text-red-300"
                    : "text-amber-200"
              }`}
            >
              {marketSnapshot.state}
            </p>
            <p className="mt-1.5 text-[0.68rem] leading-[1.4] text-slate-500">{marketSnapshot.description}</p>
          </div>

          {/* Centre — 4 sub-metrics */}
          <div className="flex flex-1 items-stretch divide-x divide-white/[0.05]">
            {(
              [
                {
                  label: "Breadth Score",
                  value: `${marketSnapshot.breadthScore}`,
                  sub:
                    marketSnapshot.breadthScore >= 65 ? "Risk-On" :
                    marketSnapshot.breadthScore >= 50 ? "Neutral" : "Risk-Off",
                  subTone:
                    marketSnapshot.breadthScore >= 65 ? "text-emerald-400" :
                    marketSnapshot.breadthScore >= 50 ? "text-slate-400" : "text-red-400",
                },
                {
                  label: "Signal Accuracy",
                  value: `${predictionAccuracy.overallAccuracy}%`,
                  sub:
                    predictionAccuracy.overallAccuracy >= 70 ? "Strong" :
                    predictionAccuracy.overallAccuracy >= 55 ? "Moderate" : "Building",
                  subTone:
                    predictionAccuracy.overallAccuracy >= 70 ? "text-emerald-400" : "text-amber-400",
                },
                {
                  label: "24h Setups",
                  value: `${rankedViews.length}`,
                  sub: `${tradeableCount} active`,
                  subTone: tradeableCount > 0 ? "text-emerald-400" : "text-slate-500",
                },
                {
                  label: "Events Today",
                  value: `${calendarEventsByDay[0]?.events.length ?? 0}`,
                  sub:
                    (calendarEventsByDay[0]?.events.filter((e) => e.impact === "High").length ?? 0) > 0
                      ? `${calendarEventsByDay[0]?.events.filter((e) => e.impact === "High").length} high impact`
                      : "No high impact",
                  subTone:
                    (calendarEventsByDay[0]?.events.filter((e) => e.impact === "High").length ?? 0) > 0
                      ? "text-amber-400"
                      : "text-slate-500",
                },
              ] as { label: string; value: string; sub: string; subTone: string }[]
            ).map(({ label, value, sub, subTone }) => (
              <div key={label} className="flex flex-col justify-center px-5 py-1">
                <p className="text-[0.60rem] font-semibold uppercase tracking-[0.10em] text-slate-600">{label}</p>
                <p className="mt-1 text-[1.05rem] font-bold leading-none text-white">{value}</p>
                <p className={`mt-1 text-[0.68rem] font-medium ${subTone}`}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Right — sparkline + button */}
          <div className="flex shrink-0 items-center gap-4 border-l border-white/[0.05] pl-5">
            {sparkValues.length > 1 && (
              <svg viewBox="0 0 120 44" className="h-11 w-28 shrink-0" fill="none" preserveAspectRatio="none">
                <path d={buildSparkPath(120, 44)} stroke="#00C884" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <Link
              href="/siggis-trades"
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[0.72rem] font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            >
              View Full Pulse
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 3 5 5-5 5" />
              </svg>
            </Link>
          </div>

        </div>
      </div>

      {/* Market Events — next 7 days (full-width 7-column calendar) */}
      <Panel className="p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="micro-label">Market events — next 7 days</p>
          <span className="text-[0.72rem] text-slate-500">
            {marketEvents.filter((e) => e.status !== "Recent").length} upcoming
          </span>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[0.45rem] bg-white/[0.03]">
          {calendarEventsByDay.map(({ day, events }, i) => {
            const isToday = i === 0;
            const dayName = isToday
              ? "Today"
              : day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });
            const dayDate = day.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
            return (
              <div
                key={day.toISOString()}
                className={`flex flex-col p-2.5 ${isToday ? "bg-[#00C884]/[0.06]" : "bg-[#111210]"}`}
              >
                <p className={`text-[0.60rem] font-bold uppercase tracking-wide ${isToday ? "text-[#00C884]" : "text-slate-400"}`}>
                  {dayName}
                </p>
                <p className="mb-2 text-[0.58rem] text-slate-600">{dayDate}</p>
                {events.length === 0 ? (
                  <p className="text-[0.60rem] text-slate-700">—</p>
                ) : (
                  <div className="space-y-1.5">
                    {events.slice(0, 3).map((ev) => (
                      <div key={ev.id} className="flex items-start gap-1">
                        <span
                          className="mt-[0.2rem] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: calendarImpactColor(ev.impact) }}
                        />
                        <p className="truncate text-[0.60rem] leading-[1.3] text-slate-400">{ev.title}</p>
                      </div>
                    ))}
                    {events.length > 3 && (
                      <p className="text-[0.58rem] text-slate-600">+{events.length - 3} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Row 2: Top Setups table */}
      <Panel className="p-3 sm:p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[0.84rem] font-semibold text-white">
            Top Setups from Siggi
          </p>
          <Link href="/scanner" className="text-[0.76rem] font-medium text-slate-400 transition hover:text-white">
            See all {rankedViews.length} →
          </Link>
        </div>
        {rankedViews.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] text-slate-500">No setups ranked yet — check back after next sync.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Direction</th>
                  <th>Entry zone</th>
                  <th>Target</th>
                  <th>Stop</th>
                  <th>Confidence</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {rankedViews.slice(0, 7).map((view, i) => {
                  const isLong = view.direction === "Bullish";
                  const isShort = view.direction === "Bearish";
                  const signiInTrade = siggiOpenSymbols.has(view.symbol);
                  return (
                    <tr key={view.symbol + i}>
                      <td>
                        <Link href={`/assets/${view.symbol}`} className="group flex items-center gap-2 hover:text-white transition-colors">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.3rem] bg-white/[0.06] text-[0.62rem] font-bold text-slate-400">
                            {i + 1}
                          </span>
                          <span className="font-semibold text-white group-hover:text-[#00C884] transition-colors">{view.symbol}</span>
                          {signiInTrade && (
                            <span className="hidden sm:inline text-[0.58rem] font-semibold text-[#00C884] bg-[#00C884]/10 px-1.5 py-0.5 rounded-sm ring-1 ring-[#00C884]/20">LIVE</span>
                          )}
                        </Link>
                      </td>
                      <td>
                        <span className={`font-semibold text-[0.78rem] ${isLong ? "text-emerald-300" : isShort ? "text-red-300" : "text-slate-400"}`}>
                          {isLong ? "▲ LONG" : isShort ? "▼ SHORT" : "—"}
                        </span>
                      </td>
                      <td className="text-slate-300 font-mono text-[0.80rem]">{view.entry}</td>
                      <td className="text-emerald-300 font-mono text-[0.80rem]">{view.target}</td>
                      <td className="text-red-300 font-mono text-[0.80rem]">{view.stop}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${view.confidence}%`,
                                background: view.confidence >= 72 ? "#34d399" : view.confidence >= 55 ? "#fbbf24" : "#f87171",
                              }}
                            />
                          </div>
                          <span className="text-[0.78rem] font-semibold text-white">{view.confidence}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`inline-flex rounded-[0.3rem] px-2 py-[0.2rem] text-[0.62rem] font-semibold leading-none ring-1 ${
                          view.decision.label === "ENTER NOW"
                            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                            : "bg-amber-400/10 text-amber-200 ring-amber-400/20"
                        }`}>
                          {view.decision.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Row 3: Score Breakdown | Signal Accuracy | Live Portfolio */}
      <div className="grid gap-1.25 lg:grid-cols-3">
        {/* Score breakdown for top setup */}
        <Panel className="p-3 sm:p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="micro-label">Score breakdown</p>
              <p className="mt-1 text-[0.84rem] font-semibold text-white">
                {nowEntry?.symbol ?? "Top setup"}
              </p>
            </div>
            {nowEntry && (
              <DonutChart
                size={56}
                thickness={8}
                segments={[
                  { value: nowEntry.rankScore, color: "#34d399", label: "Score" },
                  { value: Math.max(0, 100 - nowEntry.rankScore), color: "rgba(255,255,255,0.06)", label: "" },
                ]}
                centerLabel={`${Math.round(nowEntry.rankScore)}`}
                centerSublabel="score"
              />
            )}
          </div>
          {nowEntry ? (
            <div className="space-y-2">
              {nowEntry.scoreBreakdown.map((item) => (
                <StatBar
                  key={item.label}
                  label={item.label}
                  value={item.score}
                  detail={item.detail}
                  color={item.score >= 72 ? "#34d399" : item.score <= 44 ? "#f59e0b" : "#22d3ee"}
                />
              ))}
            </div>
          ) : (
            <p className="text-[0.78rem] text-slate-500">No setup ranked yet.</p>
          )}
        </Panel>

        {/* Signal accuracy donut */}
        <Link href="/history" className="panel panel-hover block p-3 sm:p-3.5 transition">
          <div className="mb-1 flex items-center justify-between">
            <p className="micro-label">Signal accuracy</p>
            <span className="text-[0.65rem] text-slate-600 transition hover:text-slate-400">Full history →</span>
          </div>
          <div className="mt-3 flex justify-center">
            <DonutWithLegend
              size={100}
              thickness={14}
              centerLabel={`${predictionAccuracy.overallAccuracy}%`}
              centerSublabel="accuracy"
              title=""
              segments={[
                { value: predictionAccuracy.accuratePredictions,   color: "#34d399", label: `${predictionAccuracy.accuratePredictions} Wins` },
                { value: predictionAccuracy.inaccuratePredictions, color: "#f87171", label: `${predictionAccuracy.inaccuratePredictions} Losses` },
                { value: predictionAccuracy.breakevenPredictions,  color: "#64748b", label: `${predictionAccuracy.breakevenPredictions} BE` },
              ]}
            />
          </div>
        </Link>

        {/* Live portfolio */}
        {primaryConnection ? (
          <DashboardPositionsWidget connectionId={primaryConnection.id} />
        ) : (
          <Panel className="flex flex-col items-center justify-center p-4 text-center">
            <svg viewBox="0 0 20 20" className="h-8 w-8 text-slate-700 mb-2" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="5" width="14" height="11" rx="1.3" />
              <path d="M7 5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V5" />
            </svg>
            <p className="text-[0.80rem] font-semibold text-white">Live Portfolio</p>
            <p className="mt-1 text-[0.72rem] text-slate-500">Connect a broker to see your open positions here.</p>
            <Link href="/my-trades" className="mt-3 text-[0.72rem] font-medium text-[#00C884] hover:text-[#00F79A] transition-colors">
              Connect broker →
            </Link>
          </Panel>
        )}
      </div>
    </div>
  );
}
