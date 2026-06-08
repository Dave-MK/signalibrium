import { summarizePredictionAccuracy } from "@/app/_lib/bot-engine";
import { formatDateTimeLabel } from "@/app/_lib/format";
import { getDisplayCurrencyState } from "@/app/_lib/server/currency-preference";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { PageHeader, Panel, SummaryCard, StatusChip } from "../_components/ui";
import { PredictionResetButton } from "./prediction-reset-button";
import { HistoryTableClient } from "./history-table-client";
import { Sparkline } from "../_components/sparkline";
import { DonutChart, StatBar } from "../_components/donut-chart";

// Keep ResolutionEvidence + OutcomeChip for the summary panels (best/miss/BE cards above the table)
function ResolutionEvidence({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-1 text-[0.72rem] leading-4 text-cyan-200">{text}</p>;
}

function OutcomeChip({ outcome }: { outcome: string }) {
  if (outcome === "Hit Target") return <span className="inline-flex items-center rounded-[0.3rem] bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">WIN</span>;
  if (outcome === "Stopped")    return <span className="inline-flex items-center rounded-[0.3rem] bg-red-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-red-300 ring-1 ring-red-500/30">LOSS</span>;
  if (outcome === "Breakeven")  return <span className="inline-flex items-center rounded-[0.3rem] bg-slate-600/30 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-300 ring-1 ring-slate-500/30">BREAKEVEN</span>;
  if (outcome === "Monitoring") return <span className="inline-flex items-center rounded-[0.3rem] bg-cyan-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-cyan-400 ring-1 ring-cyan-500/20">LIVE</span>;
  return <span className="inline-flex items-center rounded-[0.3rem] bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 ring-1 ring-white/8">{outcome.toUpperCase()}</span>;
}

export default async function HistoryPage() {
  const [predictionHistory, displayCurrencyState, journalEntries] = await Promise.all([
    listPredictionHistory(),
    getDisplayCurrencyState(),
    listJournalEntries(),
  ]);

  // Serialisable map: predictionId → journal entry (plain object, safe to pass to client component)
  const notes: Record<string, typeof journalEntries[0]> = {};
  for (const e of journalEntries) {
    if (e.predictionId) notes[e.predictionId] = e;
  }
  const accuracy = summarizePredictionAccuracy(predictionHistory);

  // Rolling 10-trade signal accuracy sparkline (oldest → newest)
  const resolved = [...predictionHistory]
    .filter((p) => p.monitoringStatus === "Resolved" && p.outcome !== "Ambiguous")
    .sort((a, b) => Date.parse(a.resolvedAt ?? a.calledAt) - Date.parse(b.resolvedAt ?? b.calledAt));
  const WINDOW = 10;
  const rollingAccuracy: number[] = resolved.map((_, i, arr) => {
    const window = arr.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const wins = window.filter((p) => p.outcome === "Hit Target" || p.outcome === "Breakeven").length;
    return Math.round((wins / window.length) * 100);
  });

  const bestCalls = predictionHistory
    .filter((item) => item.outcome === "Hit Target")
    .slice(0, 4);
  const breakevenCalls = predictionHistory
    .filter((item) => item.outcome === "Breakeven")
    .slice(0, 4);
  const misses = predictionHistory
    .filter((item) => item.outcome === "Stopped")
    .slice(0, 4);
  const activeCalls = predictionHistory
    .filter((item) => item.monitoringStatus === "Active")
    .slice(0, 4);
  const ambiguousCalls = predictionHistory.filter((item) => item.outcome === "Ambiguous");

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Prediction replay"
        description="Check how recent calls played out. Any call closed in profit = Win. Closed at a loss = Loss. Closed at entry = Breakeven. Win rate = wins ÷ (wins + losses + breakevens)."
        action={<PredictionResetButton />}
      />

      {/* ── Three-metric accuracy breakdown ── */}
      <Panel className="p-3 sm:p-3.5">
        <p className="micro-label mb-2.5">Accuracy — three ways to measure it</p>
        <div className="grid gap-[5px] sm:grid-cols-3">
          {/* 1. Signal Direction — with rolling accuracy sparkline */}
          <div className="signal-surface-soft rounded-[0.45rem] p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Signal direction</p>
                <p className="mt-1 text-[1.3rem] font-bold text-white">{accuracy.signalDirectionAccuracy}%</p>
                <p className="mt-0.5 text-[0.72rem] text-slate-400">
                  {accuracy.signalDirectionWins}W / {accuracy.signalDirectionResolved - accuracy.signalDirectionWins}L
                  {" "}from {accuracy.signalDirectionResolved} resolved
                </p>
              </div>
              {rollingAccuracy.length >= 3 && (
                <div className="shrink-0">
                  <p className="mb-1 text-right text-[0.58rem] text-slate-600">Rolling 10</p>
                  <Sparkline data={rollingAccuracy} className="h-10 w-24" />
                </div>
              )}
            </div>
            <div className="mt-2">
              <StatBar
                label=""
                value={accuracy.signalDirectionAccuracy}
                color={accuracy.signalDirectionAccuracy >= 60 ? "#34d399" : "#f59e0b"}
              />
            </div>
            <p className="mt-1.5 text-[0.68rem] leading-4 text-slate-600">
              Raw directional accuracy of all locked signals, regardless of whether Siggi traded them.
            </p>
          </div>

          {/* 2. Siggi Trade Win Rate — with donut */}
          <div className="signal-surface-soft rounded-[0.45rem] p-3">
            <p className="text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">Siggi's trade win rate</p>
            <div className="flex items-center gap-3">
              <DonutChart
                size={60}
                thickness={10}
                centerLabel={accuracy.siggiTradeWinRate !== null ? `${accuracy.siggiTradeWinRate}%` : "—"}
                segments={[
                  { value: accuracy.siggiTradesWon, color: "#34d399", label: "W" },
                  { value: accuracy.siggiTradesResolved - accuracy.siggiTradesWon, color: "#f87171", label: "L" },
                ]}
              />
              <div className="min-w-0">
                <p className={`text-[1.1rem] font-bold ${accuracy.siggiTradeWinRate !== null ? "text-emerald-300" : "text-slate-500"}`}>
                  {accuracy.siggiTradeWinRate !== null ? `${accuracy.siggiTradeWinRate}%` : "Building…"}
                </p>
                <p className="text-[0.70rem] text-slate-400">
                  {accuracy.siggiTradesWon}W / {accuracy.siggiTradesResolved - accuracy.siggiTradesWon}L
                  {accuracy.siggiTradeWinRate === null && " — need 5+"}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[0.68rem] leading-4 text-slate-600">
              Only signals Siggi actually executed. Reflects the full entry pipeline — signal + gates + sizing.
            </p>
          </div>

          {/* 3. Skip Quality — with bar */}
          <div className="signal-surface-soft rounded-[0.45rem] p-3">
            <p className="text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Skip quality (gate filter)</p>
            <p className={`mt-1 text-[1.3rem] font-bold ${accuracy.skipQuality !== null ? (accuracy.skipQuality >= 60 ? "text-emerald-300" : accuracy.skipQuality >= 40 ? "text-amber-300" : "text-red-300") : "text-slate-500"}`}>
              {accuracy.skipQuality !== null ? `${accuracy.skipQuality}%` : "Building…"}
            </p>
            <p className="mt-0.5 text-[0.72rem] text-slate-400">
              {accuracy.skippedWouldBeLoss} of {accuracy.skippedResolved} skipped would have lost
              {accuracy.skipQuality === null && " — need 5+"}
            </p>
            {accuracy.skipQuality !== null && (
              <div className="mt-2">
                <StatBar
                  label=""
                  value={accuracy.skipQuality}
                  color={accuracy.skipQuality >= 60 ? "#34d399" : accuracy.skipQuality >= 40 ? "#f59e0b" : "#f87171"}
                />
              </div>
            )}
            <p className="mt-1.5 text-[0.68rem] leading-4 text-slate-600">
              Higher = gates saved you from losses. Lower = Siggi over-filtering and missing wins.
            </p>
          </div>
        </div>
      </Panel>

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] sm:grid-cols-4">
          <SummaryCard
            label="Win rate (live trades)"
            value={accuracy.liveAccuracy !== null ? `${accuracy.liveAccuracy}%` : "< 20 trades"}
            detail={
              accuracy.liveAccuracy !== null
                ? `${accuracy.liveAccurate} wins from ${accuracy.liveResolved} live paper trades`
                : `${accuracy.liveResolved} live trade${accuracy.liveResolved === 1 ? "" : "s"} resolved — need 20 for a meaningful rate`
            }
            tone="text-emerald-300"
          />
          <SummaryCard
            label="Wins / Losses"
            value={`${accuracy.accuratePredictions}W · ${accuracy.inaccuratePredictions}L`}
            detail={`${accuracy.overallAccuracy}% win rate · ${accuracy.breakevenPredictions} breakeven counted as wins`}
            tone="text-white"
          />
          <SummaryCard
            label="Recent win rate"
            value={`${accuracy.recentAccuracy}%`}
            detail="Last 12 resolved predictions (all sources)"
            tone="text-cyan-200"
          />
          <SummaryCard
            label="Tracked predictions"
            value={`${predictionHistory.length}`}
            detail={`${ambiguousCalls.length} ambiguous · ${accuracy.breakevenPredictions} breakeven · not counted as wins or losses`}
          />
        </div>
      </Panel>

      <div className="grid gap-[5px] xl:grid-cols-4">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Active live calls</p>
          <div className="mt-3 grid gap-[5px]">
            {activeCalls.length > 0 ? (
              activeCalls.map((item) => (
                <div key={item.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.92rem] font-semibold text-white">
                        {item.symbol} / {item.actionAtCall} / {item.decisionAtCall}
                      </p>
                      <p className="mt-1 text-[0.76rem] text-slate-400">
                        {item.timeframe} / locked {formatDateTimeLabel(item.calledAt)}
                      </p>
                  </div>
                  <StatusChip label="LIVE" />
                </div>
                <ResolutionEvidence text={item.resolutionEvidence} />
                <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{item.narrative}</p>
              </div>
            ))
            ) : (
              <div className="signal-surface-soft rounded-[0.4rem] p-3">
                <p className="text-[0.82rem] leading-5 text-slate-300">
                  No live enter-now calls are currently being tracked against stop and target.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Best recent calls</p>
          <div className="mt-3 grid gap-[5px]">
            {bestCalls.map((item) => (
              <div key={item.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.92rem] font-semibold text-white">
                      {item.symbol} / {item.actionAtCall} / {item.decisionAtCall}
                    </p>
                    <p className="mt-1 text-[0.76rem] text-slate-400">
                      {item.timeframe} / {item.horizon} / called {formatDateTimeLabel(item.calledAt)}
                    </p>
                  </div>
                  <StatusChip label={item.outcome.toUpperCase()} />
                </div>
                <ResolutionEvidence text={item.resolutionEvidence} />
                <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{item.narrative}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Breakeven closes</p>
          <div className="mt-3 grid gap-[5px]">
            {breakevenCalls.length > 0 ? (
              breakevenCalls.map((item) => (
                <div key={item.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.92rem] font-semibold text-white">
                        {item.symbol} / {item.actionAtCall} / {item.decisionAtCall}
                      </p>
                      <p className="mt-1 text-[0.76rem] text-slate-400">
                        {item.timeframe} / {item.horizon} / resolved {item.resolvedAt ? formatDateTimeLabel(item.resolvedAt) : "Still live"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-[0.3rem] bg-slate-600/30 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-300 ring-1 ring-slate-500/30">
                      BE
                    </span>
                  </div>
                  <ResolutionEvidence text={item.resolutionEvidence} />
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{item.narrative}</p>
                </div>
              ))
            ) : (
              <div className="signal-surface-soft rounded-[0.4rem] p-3">
                <p className="text-[0.82rem] leading-5 text-slate-300">
                  No breakeven closes yet — these appear when a call resolves at exactly the entry price.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Misses to learn from</p>
          <div className="mt-3 grid gap-[5px]">
            {misses.map((item) => (
              <div key={item.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.92rem] font-semibold text-white">
                      {item.symbol} / {item.actionAtCall} / {item.decisionAtCall}
                    </p>
                    <p className="mt-1 text-[0.76rem] text-slate-400">
                      {item.timeframe} / {item.horizon} / resolved {item.resolvedAt ? formatDateTimeLabel(item.resolvedAt) : "Still live"}
                    </p>
                  </div>
                  <StatusChip label={item.outcome.toUpperCase()} />
                </div>
                <ResolutionEvidence text={item.resolutionEvidence} />
                <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{item.narrative}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="overflow-hidden p-0">
        <HistoryTableClient
          items={predictionHistory}
          notes={notes}
          currency={displayCurrencyState.currency}
          rates={displayCurrencyState.rates}
        />
      </Panel>
    </div>
  );
}

