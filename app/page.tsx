import Link from "next/link";
import { buildBotOpportunityView, summarizePredictionAccuracy } from "@/app/_lib/bot-engine";
import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listConfirmationChecks } from "@/app/_lib/server/repositories/confirmation-checks";
import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import { getMarketSnapshot } from "@/app/_lib/server/repositories/market-snapshot";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { ActionLink, PageHeader, Panel, StatusChip } from "./_components/ui";

function SummaryCard({
  label,
  value,
  detail,
  tone = "text-white",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <p className="micro-label">{label}</p>
      <p className={`mt-1.5 text-[0.96rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[0.78rem] leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

function EntryCard({
  title,
  view,
}: {
  title: string;
  view: ReturnType<typeof buildBotOpportunityView> | null;
}) {
  if (!view) {
    return (
      <div className="signal-surface-soft rounded-[0.4rem] p-3">
        <p className="micro-label">{title}</p>
        <p className="mt-1.5 text-[0.9rem] font-semibold text-white">No active setup</p>
        <p className="mt-1 text-[0.78rem] leading-5 text-slate-400">
          Siggi has not found a strong enough setup for this horizon yet.
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/assets/${view.symbol}`}
      className="signal-surface-soft block rounded-[0.4rem] p-3 transition hover:bg-white/[0.035]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="micro-label">{title}</p>
          <p className="mt-1.5 text-[0.98rem] font-semibold text-white">
            {view.symbol} / {view.direction}
          </p>
          <p className="mt-1 text-[0.78rem] text-slate-400">
            {view.timeframe} / {view.horizon}
          </p>
        </div>
        <div className="text-right">
          <StatusChip label={view.decision.label} />
          <p className="mt-2 text-[0.86rem] font-semibold text-cyan-200">{view.confidence}%</p>
          <p className="mt-1 text-[0.74rem] text-slate-400">Timing fit {view.readiness}%</p>
        </div>
      </div>
      <p className="mt-3 text-[0.82rem] leading-5 text-slate-300">{view.rationale}</p>
      <div className="mt-3 grid gap-[5px] sm:grid-cols-4">
        <SummaryCard label="Entry zone" value={view.entry} detail="Full working zone" />
        <SummaryCard label="Better fill" value={view.discountedEntry} detail="Preferred discounted pocket" />
        <SummaryCard label="Stop" value={view.stop} detail="Invalidation" />
        <SummaryCard label="Target" value={view.target} detail="First take profit" />
      </div>
      <div className="mt-3">
        <p className="text-[0.76rem] leading-5 text-slate-400">{view.discountedEntryDetail}</p>
      </div>
      <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
        <SummaryCard
          label="Why it ranks"
          value={`${view.rankScore}% priority`}
          detail={view.priorityReason}
        />
        <SummaryCard
          label="Event watch"
          value={view.eventTone}
          detail={view.timingWindow}
          tone={
            view.eventTone === "Tailwind"
              ? "text-emerald-300"
              : view.eventTone === "Headwind"
                ? "text-amber-200"
                : "text-white"
          }
        />
      </div>
      <p className={`mt-3 text-[0.78rem] font-medium ${view.decision.tone}`}>
        {view.decision.detail}
      </p>
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
  ] =
    await Promise.all([
      listAssets(),
      listBacktests(),
      listConfirmationChecks(),
      listMarketEvents(),
      getMarketSnapshot(),
      listPredictionHistory(),
      listScannerResults(),
    ]);

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

  const dayRankedViews = rankedViews.filter((item) => item.horizon === "Day");
  const nowEntry = dayRankedViews[0] ?? rankedViews[0] ?? null;
  const todayEntry = dayRankedViews[1] ?? rankedViews[1] ?? null;
  const next24hEntry = dayRankedViews[2] ?? rankedViews[2] ?? null;
  const topEvent = marketEvents[0] ?? null;
  const predictionAccuracy = summarizePredictionAccuracy(predictionHistory);

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Best Siggi-led trading ideas"
        description="See the strongest short-horizon setups for right now, today, and the next 24 hours, then open the chart when one deserves a closer look."
        action={<ActionLink href="/scanner">Open Opportunities</ActionLink>}
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] lg:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(0,0.5fr))]">
          <div className="signal-surface rounded-[0.46rem] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="micro-label">Siggi market read</p>
                <h2 className="mt-1.5 text-[1.12rem] font-semibold text-white">{marketSnapshot.state}</h2>
              </div>
              <StatusChip label={marketSnapshot.breadthScore >= 60 ? "BULLISH" : marketSnapshot.breadthScore <= 40 ? "BEARISH" : "MIXED"} />
            </div>
            <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{marketSnapshot.description}</p>
            {topEvent ? (
              <p className="mt-3 text-[0.78rem] leading-5 text-slate-400">
                Next key driver: <span className="font-medium text-slate-200">{topEvent.title}</span> / {topEvent.status} / {topEvent.impact} impact
              </p>
            ) : null}
          </div>
          <SummaryCard
            label="Best now"
            value={nowEntry ? `${nowEntry.symbol} / ${nowEntry.confidence}%` : "None"}
            detail={nowEntry ? `${nowEntry.decision.label} / timing fit ${nowEntry.readiness}%` : "No immediate setup"}
            tone="text-cyan-200"
          />
          <SummaryCard
            label="Best today"
            value={todayEntry ? `${todayEntry.symbol} / ${todayEntry.confidence}%` : "None"}
            detail={todayEntry ? `${todayEntry.decision.label} / timing fit ${todayEntry.readiness}%` : "No same-session setup"}
            tone="text-emerald-300"
          />
          <SummaryCard
            label="Next 24h"
            value={next24hEntry ? `${next24hEntry.symbol} / ${next24hEntry.confidence}%` : "None"}
            detail={next24hEntry ? `${next24hEntry.decision.label} / timing fit ${next24hEntry.readiness}%` : "No clean 24h setup"}
          />
        </div>
      </Panel>

      <div className="grid gap-[5px] xl:grid-cols-3">
        <EntryCard title="Best entry now" view={nowEntry} />
        <EntryCard title="Best entry today" view={todayEntry} />
        <EntryCard title="Best entry next 24h" view={next24hEntry} />
      </div>

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] sm:grid-cols-3">
          <SummaryCard
            label="Overall prediction accuracy"
            value={`${predictionAccuracy.overallAccuracy}%`}
            detail={`${predictionAccuracy.accuratePredictions} accurate calls from ${predictionAccuracy.resolvedPredictions} resolved predictions`}
            tone="text-emerald-300"
          />
          <SummaryCard
            label="Recent prediction accuracy"
            value={`${predictionAccuracy.recentAccuracy}%`}
            detail="Last 12 resolved predictions"
            tone="text-cyan-200"
          />
          <SummaryCard
            label="Replay history"
            value={`${predictionHistory.length}`}
            detail="Use History to review how past enter-now calls actually played out"
          />
        </div>
      </Panel>

      <Panel className="p-3 sm:p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="micro-label">Why Siggi likes it</p>
            <p className="mt-1.5 text-[0.96rem] font-semibold text-white">
              {nowEntry?.symbol ?? todayEntry?.symbol ?? "No current lead"} / short-term focus
            </p>
          </div>
                  <Link href="/history" className="text-[0.78rem] font-medium text-slate-400 transition hover:text-white">
            Open history
          </Link>
        </div>
        <div className="mt-3 grid gap-[5px] xl:grid-cols-2">
          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Event effect</p>
            <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
              {(nowEntry ?? todayEntry ?? next24hEntry)?.eventEffect ??
                "No event impact summary is available yet."}
            </p>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Why Siggi is leaning</p>
            <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
              {(nowEntry ?? todayEntry ?? next24hEntry)?.priorityReason ??
                  "Siggi keeps syncing live prices, re-checks chart structure, weighs scheduled events, and uses stored backtest, replay, and confirmation context to rank the highest-probability short-term setups first."}
            </p>
          </div>
        </div>
        {nowEntry ? (
          <div className="mt-3 grid gap-[5px] sm:grid-cols-4">
            {nowEntry.scoreBreakdown.map((item) => (
              <SummaryCard
                key={item.label}
                label={item.label}
                value={`${item.score}%`}
                detail={item.detail}
                tone={item.score >= 70 ? "text-emerald-300" : item.score <= 45 ? "text-amber-200" : "text-white"}
              />
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
