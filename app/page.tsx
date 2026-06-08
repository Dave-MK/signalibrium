import Link from "next/link";
import { buildBotOpportunityView, summarizePredictionAccuracy } from "@/app/_lib/bot-engine";
import { getMarketSession, type MarketSessionState } from "@/app/_lib/market-hours";
import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listConfirmationChecks } from "@/app/_lib/server/repositories/confirmation-checks";
import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import type { PersistedMarketEvent } from "@/app/_lib/server/workspace-types";
import { getMarketSnapshot } from "@/app/_lib/server/repositories/market-snapshot";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import { ActionLink, PageHeader, Panel, StatusChip, SummaryCard } from "./_components/ui";
import { DonutWithLegend, StatBar } from "./_components/donut-chart";

function MarketStatusBadge({ state, venue }: { state: MarketSessionState; venue: string }) {
  if (state === "Open" || state === "24/7") {
    return (
      <span className="inline-flex items-center gap-1 rounded-[0.25rem] bg-emerald-500/10 px-1.5 py-0.5 text-[0.60rem] font-semibold text-emerald-300 ring-1 ring-emerald-500/20">
        <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
        {state === "24/7" ? "24/7 Market" : `${venue} Open`}
      </span>
    );
  }
  if (state === "Weekend") {
    return (
      <span className="inline-flex items-center gap-1 rounded-[0.25rem] bg-slate-500/10 px-1.5 py-0.5 text-[0.60rem] font-semibold text-slate-500 ring-1 ring-white/8">
        <span className="h-1 w-1 rounded-full bg-slate-600" />
        Weekend — closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-[0.25rem] bg-amber-400/8 px-1.5 py-0.5 text-[0.60rem] font-semibold text-amber-300 ring-1 ring-amber-400/15">
      <span className="h-1 w-1 rounded-full bg-amber-400 opacity-60" />
      {venue} closed — not tradeable
    </span>
  );
}

function EntryCard({
  title,
  view,
  rank,
  siggiInTrade = false,
  marketState,
  marketVenue,
}: {
  title: string;
  view: ReturnType<typeof buildBotOpportunityView> | null;
  rank: number;
  siggiInTrade?: boolean;
  marketState?: MarketSessionState;
  marketVenue?: string;
}) {
  if (!view) {
    return (
      <div className="signal-surface-soft rounded-[0.4rem] p-3">
        <p className="micro-label">{title}</p>
        <p className="mt-1.5 text-[0.9rem] font-semibold text-white">No active setup</p>
        <p className="mt-1 text-[0.78rem] leading-5 text-slate-400">
          Siggi hasn't found a strong enough setup for this slot yet — check back after the next sync.
        </p>
      </div>
    );
  }

  const directionColor =
    view.direction === "Bullish"
      ? "text-emerald-300"
      : view.direction === "Bearish"
        ? "text-amber-200"
        : "text-slate-300";
  const signalColor =
    view.decision.label === "ENTER NOW" ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-amber-400/10 text-amber-200 ring-amber-400/20";

  return (
    <Link
      href={`/assets/${view.symbol}`}
      className="signal-surface-soft group block rounded-[0.4rem] p-3 transition hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="micro-label">{title}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-[0.25rem] bg-white/[0.06] px-1.5 py-0.5 text-[0.64rem] font-semibold text-slate-400">
              #{rank}
            </span>
            <p className="truncate text-[0.98rem] font-semibold text-white">
              {view.symbol}
            </p>
            <span className={`text-[0.82rem] font-semibold ${directionColor}`}>
              {view.direction === "Bullish" ? "▲ BUY" : view.direction === "Bearish" ? "▼ SELL" : "—"}
            </span>
          </div>
          <p className="mt-0.5 text-[0.74rem] text-slate-500">
            {view.instrumentName} · {view.timeframe} · {view.horizon}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {marketState && marketVenue && (
              <MarketStatusBadge state={marketState} venue={marketVenue} />
            )}
            {siggiInTrade && (
              <span className="inline-flex items-center gap-1 rounded-[0.25rem] bg-cyan-500/15 px-1.5 py-0.5 text-[0.60rem] font-semibold text-cyan-400 ring-1 ring-cyan-500/30">
                🤖 Siggi in trade
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-flex rounded-[0.4rem] px-2.5 py-[0.3rem] text-[0.67rem] font-semibold leading-none ring-1 ${signalColor}`}>
            {view.decision.label}
          </span>
          <p className="mt-2 text-[0.92rem] font-semibold text-cyan-200">{view.confidence}%</p>
          <p className="mt-0.5 text-[0.68rem] text-slate-500">confidence</p>
        </div>
      </div>

      <p className="mt-2.5 text-[0.80rem] leading-5 text-slate-300">{view.rationale}</p>

      <div className="mt-3 grid gap-[5px] sm:grid-cols-4">
        <SummaryCard label="Entry zone" value={view.entry} detail="Limit order zone" />
        <SummaryCard label="Stop" value={view.stop} detail="Invalidation" />
        <SummaryCard label="Target" value={view.target} detail="First take profit" />
        {view.pipDistanceToEntry
          ? <SummaryCard label="Distance to entry" value={view.pipDistanceToEntry} detail="Current vs zone" />
          : <SummaryCard label="Hold for" value={view.tradeSpan} detail={view.tradeSpanDetail} />
        }
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className={`text-[0.76rem] font-medium ${view.decision.tone}`}>
          {view.decision.detail}
        </p>
        <span className="shrink-0 text-[0.72rem] font-medium text-slate-500 transition group-hover:text-slate-300">
          Full chart →
        </span>
      </div>
    </Link>
  );
}

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
  ] = await Promise.all([
    listAssets(),
    listBacktests(),
    listConfirmationChecks(),
    listMarketEvents(),
    getMarketSnapshot(),
    listPredictionHistory(),
    listScannerResults(),
    getSiggiAccount(),
  ]);

  const siggiOpenSymbols = new Set(siggiAccount.openTrades.map((t) => t.symbol));
  const assetsBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));

  // Helper: get current market session for a view's asset
  function viewMarketSession(view: ReturnType<typeof buildBotOpportunityView> | null) {
    if (!view) return null;
    const asset = assetsBySymbol.get(view.symbol) ?? null;
    return getMarketSession(asset);
  }

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

  const dayViews = rankedViews.filter((v) => v.horizon === "Day");
  const nowEntry = dayViews[0] ?? rankedViews[0] ?? null;
  const todayEntry = dayViews[1] ?? rankedViews[1] ?? null;
  const next24hEntry = dayViews[2] ?? rankedViews[2] ?? null;

  const nowSession      = viewMarketSession(nowEntry);
  const todaySession    = viewMarketSession(todayEntry);
  const next24hSession  = viewMarketSession(next24hEntry);
  const topEvent = marketEvents.filter((e) => e.status === "Upcoming" || e.status === "Live")[0] ?? null;
  const predictionAccuracy = summarizePredictionAccuracy(predictionHistory);

  const tradeableCount = rankedViews.filter((v) => v.decision.label === "ENTER NOW").length;
  const openTradeCount = siggiAccount.openTrades.length;

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Your trading command centre"
        description="Siggi scans every market, ranks every opportunity, and tells you exactly what to act on — right now."
        action={<ActionLink href="/scanner">All Opportunities</ActionLink>}
      />

      {/* Market pulse banner */}
      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.5fr))]">
          <div className="signal-surface rounded-[0.46rem] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="micro-label">Market read right now</p>
                <h2 className="mt-1.5 text-[1.14rem] font-semibold text-white">{marketSnapshot.state}</h2>
              </div>
              <StatusChip
                label={
                  marketSnapshot.breadthScore >= 60
                    ? "RISK-ON"
                    : marketSnapshot.breadthScore <= 40
                      ? "RISK-OFF"
                      : "MIXED"
                }
              />
            </div>
            <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{marketSnapshot.description}</p>
            {topEvent ? (
              <div className="mt-3 flex items-center gap-2 rounded-[0.35rem] bg-amber-400/8 px-2.5 py-1.5 ring-1 ring-amber-400/15">
                <span className="text-[0.72rem] font-semibold text-amber-300">EVENT</span>
                <p className="text-[0.76rem] text-slate-300">
                  <span className="font-medium text-white">{topEvent.title}</span> · {topEvent.status} · {topEvent.impact} impact
                </p>
              </div>
            ) : null}
          </div>
          <SummaryCard
            label="Ready to enter"
            value={`${tradeableCount}`}
            detail="ENTER NOW signals across all markets"
            tone="text-emerald-300"
          />
          <SummaryCard
            label="Siggi's positions"
            value={`${openTradeCount}`}
            detail="Live trades running right now"
            tone="text-cyan-200"
          />
          {/* Win/Loss donut replacing the flat accuracy card */}
          <div className="signal-surface-soft rounded-[0.46rem] p-3">
            <DonutWithLegend
              size={72}
              thickness={12}
              centerLabel={`${predictionAccuracy.overallAccuracy}%`}
              centerSublabel="accuracy"
              title="Signal accuracy"
              segments={[
                { value: predictionAccuracy.accuratePredictions,   color: "#34d399", label: "Wins" },
                { value: predictionAccuracy.inaccuratePredictions, color: "#f87171", label: "Losses" },
                { value: predictionAccuracy.breakevenPredictions,  color: "#64748b", label: "Breakeven" },
              ]}
            />
          </div>
        </div>
      </Panel>

      {/* Top 3 setups */}
      <div>
        <div className="mb-2 flex items-center justify-between pl-0.5">
          <p className="text-[0.84rem] font-semibold text-white">
            Siggi's top picks right now
          </p>
          <Link href="/scanner" className="text-[0.76rem] font-medium text-slate-400 transition hover:text-white">
            See all {rankedViews.length} opportunities →
          </Link>
        </div>
        <div className="grid gap-[5px] xl:grid-cols-3">
          <EntryCard
            title="Best entry now"
            view={nowEntry}
            rank={1}
            siggiInTrade={!!nowEntry && siggiOpenSymbols.has(nowEntry.symbol)}
            marketState={nowSession?.state}
            marketVenue={nowSession?.venue}
          />
          <EntryCard
            title="Best entry today"
            view={todayEntry}
            rank={2}
            siggiInTrade={!!todayEntry && siggiOpenSymbols.has(todayEntry.symbol)}
            marketState={todaySession?.state}
            marketVenue={todaySession?.venue}
          />
          <EntryCard
            title="Best for next 24h"
            view={next24hEntry}
            rank={3}
            siggiInTrade={!!next24hEntry && siggiOpenSymbols.has(next24hEntry.symbol)}
            marketState={next24hSession?.state}
            marketVenue={next24hSession?.venue}
          />
        </div>
      </div>

      {/* Market events calendar — this week */}
      {marketEvents.length > 0 && (() => {
        // Build a 7-day calendar centred on today
        const todayMs = Date.now();
        const startOfToday = new Date(todayMs);
        startOfToday.setHours(0, 0, 0, 0);
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(startOfToday.getTime() + i * 86_400_000);
          return d;
        });

        const fmtDay = (d: Date) =>
          d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

        const eventsByDay = days.map((day) => {
          const dayStart = day.getTime();
          const dayEnd = dayStart + 86_400_000;
          const events = marketEvents.filter((e) => {
            const t = Date.parse(e.startsAt);
            return t >= dayStart && t < dayEnd;
          });
          return { day, events };
        });

        const impactColor = (impact: PersistedMarketEvent["impact"]) =>
          impact === "High" ? "#f87171" : impact === "Medium" ? "#fbbf24" : "#64748b";

        return (
          <Panel className="p-3 sm:p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <p className="micro-label">Market events — next 7 days</p>
              <span className="text-[0.72rem] text-slate-500">{marketEvents.filter(e => e.status !== "Recent").length} upcoming</span>
            </div>
            <div className="grid gap-[5px] sm:grid-cols-7">
              {eventsByDay.map(({ day, events }, i) => {
                const isToday = i === 0;
                return (
                  <div
                    key={day.toISOString()}
                    className={`rounded-[0.38rem] p-2 ${isToday ? "bg-cyan-500/[0.07] ring-1 ring-cyan-500/20" : "bg-white/[0.02]"}`}
                  >
                    <p className={`text-[0.60rem] font-semibold uppercase tracking-wider mb-1.5 ${isToday ? "text-cyan-300" : "text-slate-500"}`}>
                      {isToday ? "Today" : fmtDay(day).split(",")[0]}
                      <span className="ml-1 font-normal text-slate-600">{fmtDay(day).split(",")[1]?.trim()}</span>
                    </p>
                    {events.length === 0 ? (
                      <p className="text-[0.62rem] text-slate-700">—</p>
                    ) : (
                      <div className="space-y-1">
                        {events.slice(0, 3).map((ev) => (
                          <div key={ev.id} className="flex items-start gap-1">
                            <span
                              className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: impactColor(ev.impact) }}
                            />
                            <p className="text-[0.62rem] leading-[1.35] text-slate-300 line-clamp-2">
                              {ev.title}
                            </p>
                          </div>
                        ))}
                        {events.length > 3 && (
                          <p className="text-[0.60rem] text-slate-600">+{events.length - 3} more</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })()}

      {/* Performance + score breakdown */}
      <Panel className="p-3 sm:p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="micro-label">Why Siggi ranks it top</p>
            <p className="mt-1 text-[0.94rem] font-semibold text-white">
              {nowEntry?.symbol ?? todayEntry?.symbol ?? "Awaiting top setup"} — score breakdown
            </p>
          </div>
          <Link href="/history" className="text-[0.76rem] font-medium text-slate-400 transition hover:text-white">
            Full history →
          </Link>
        </div>

        <div className="grid gap-[5px] sm:grid-cols-2 lg:grid-cols-3">
          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Event effect</p>
            <p className="mt-1.5 text-[0.80rem] leading-5 text-slate-300">
              {(nowEntry ?? todayEntry ?? next24hEntry)?.eventEffect ??
                "No event context yet — Siggi is still building intelligence."}
            </p>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Why Siggi is leaning</p>
            <p className="mt-1.5 text-[0.80rem] leading-5 text-slate-300">
              {(nowEntry ?? todayEntry ?? next24hEntry)?.priorityReason ??
                "Siggi checks live price, chart structure, upcoming events, and historical replay to rank the highest-probability setups first."}
            </p>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Recent accuracy (last 12)</p>
            <p className={`mt-1.5 text-[0.96rem] font-semibold ${predictionAccuracy.recentAccuracy >= 60 ? "text-emerald-300" : "text-amber-200"}`}>
              {predictionAccuracy.recentAccuracy}%
            </p>
            <p className="mt-1 text-[0.76rem] text-slate-400">
              Siggi's accuracy on the most recent 12 resolved calls
            </p>
          </div>
        </div>

        {nowEntry ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {nowEntry.scoreBreakdown.map((item) => (
              <div key={item.label} className="signal-surface-soft rounded-[0.4rem] p-3">
                <StatBar
                  label={item.label}
                  value={item.score}
                  detail={item.detail}
                  color={item.score >= 72 ? "#34d399" : item.score <= 44 ? "#f59e0b" : "#22d3ee"}
                />
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      {/* CTA to scanner */}
      <div className="flex flex-col items-center gap-3 rounded-[0.5rem] bg-gradient-to-r from-cyan-500/8 via-violet-500/4 to-transparent p-4 ring-1 ring-white/8 sm:flex-row sm:justify-between">
        <div>
          <p className="text-[0.94rem] font-semibold text-white">
            {rankedViews.length} ranked opportunities waiting
          </p>
          <p className="mt-0.5 text-[0.78rem] text-slate-400">
            The full scanner shows every signal with live charts, event context, and position sizing.
          </p>
        </div>
        <ActionLink href="/scanner">
          Open All Opportunities →
        </ActionLink>
      </div>
    </div>
  );
}
