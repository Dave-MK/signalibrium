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

function ResolutionEvidence({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-1 text-[0.72rem] leading-4 text-[#00C884]/80">{text}</p>;
}

function OutcomeChip({ outcome }: { outcome: string }) {
  if (outcome === "Hit Target") return <span className="inline-flex items-center rounded-[0.3rem] bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">WIN</span>;
  if (outcome === "Stopped")    return <span className="inline-flex items-center rounded-[0.3rem] bg-red-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-red-300 ring-1 ring-red-500/30">LOSS</span>;
  if (outcome === "Breakeven")  return <span className="inline-flex items-center rounded-[0.3rem] bg-slate-600/30 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-300 ring-1 ring-slate-500/30">BREAKEVEN</span>;
  if (outcome === "Monitoring") return <span className="inline-flex items-center rounded-[0.3rem] bg-[#00C884]/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[#00C884] ring-1 ring-[#00C884]/20">LIVE</span>;
  return <span className="inline-flex items-center rounded-[0.3rem] bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 ring-1 ring-white/8">{outcome.toUpperCase()}</span>;
}

export default async function HistoryPage() {
  const [predictionHistory, displayCurrencyState, journalEntries] = await Promise.all([
    listPredictionHistory(),
    getDisplayCurrencyState(),
    listJournalEntries(),
  ]);

  const notes: Record<string, typeof journalEntries[0]> = {};
  for (const e of journalEntries) {
    if (e.predictionId) notes[e.predictionId] = e;
  }

  // Split real predictions from demo seed data — never mix them in stats
  const realPredictions = predictionHistory.filter((p) => p.resolvedSource !== "seed_replay");
  const seedPredictions = predictionHistory.filter((p) => p.resolvedSource === "seed_replay");

  const accuracy = summarizePredictionAccuracy(predictionHistory); // already filters seed_replay internally

  // Rolling 10-trade accuracy sparkline — real predictions only, oldest → newest
  const resolvedReal = [...realPredictions]
    .filter((p) => p.monitoringStatus === "Resolved" && p.outcome !== "Ambiguous")
    .sort((a, b) => Date.parse(a.resolvedAt ?? a.calledAt) - Date.parse(b.resolvedAt ?? b.calledAt));
  const WINDOW = 10;
  const rollingAccuracy: number[] = resolvedReal.map((_, i, arr) => {
    const window = arr.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const wins = window.filter((p) => p.outcome === "Hit Target" || p.outcome === "Breakeven").length;
    return Math.round((wins / window.length) * 100);
  });

  const bestCalls    = realPredictions.filter((item) => item.outcome === "Hit Target").slice(0, 4);
  const breakevenCalls = realPredictions.filter((item) => item.outcome === "Breakeven").slice(0, 4);
  const misses       = realPredictions.filter((item) => item.outcome === "Stopped").slice(0, 4);
  const activeCalls  = realPredictions.filter((item) => item.monitoringStatus === "Active").slice(0, 4);
  const ambiguousCalls = realPredictions.filter((item) => item.outcome === "Ambiguous");

  const hasRealHistory = realPredictions.length > 0;

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Signal history"
        description="Every signal the system has locked in — entry price, stop, target, and what actually happened. Stats only count real live predictions, never demo seed data."
        action={<PredictionResetButton />}
      />

      {/* ── No real history yet ── */}
      {!hasRealHistory && (
        <Panel className="p-4 sm:p-5">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00C884]/10 ring-1 ring-[#00C884]/20">
              <svg viewBox="0 0 20 20" fill="none" className="h-6 w-6 text-[#00C884]" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 3v7l4 2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="10" cy="10" r="7" />
              </svg>
            </div>
            <div>
              <p className="text-[0.95rem] font-semibold text-white">No real signal history yet</p>
              <p className="mt-1 max-w-sm text-[0.82rem] leading-5 text-slate-400">
                Predictions appear here as the system makes live calls. Every entry will show the exact price,
                stop, target, and resolution — no estimates, no demo data.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* ── Accuracy breakdown — only shown once real history exists ── */}
      {hasRealHistory && (
        <>
          {/* Compact visual scorecard strip */}
          <div className="grid gap-[5px] sm:grid-cols-3">
            {/* 1. Signal Direction */}
            <Panel className="p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Signal direction</p>
                {rollingAccuracy.length >= 3 && (
                  <Sparkline data={rollingAccuracy} className="h-7 w-16 shrink-0" />
                )}
              </div>
              <p className={`mt-2 text-[1.6rem] font-bold leading-none ${accuracy.signalDirectionAccuracy >= 60 ? "text-emerald-300" : "text-amber-300"}`}>
                {accuracy.signalDirectionAccuracy}%
              </p>
              <div className="mt-2">
                <StatBar label="" value={accuracy.signalDirectionAccuracy} color={accuracy.signalDirectionAccuracy >= 60 ? "#34d399" : "#f59e0b"} />
              </div>
              <p className="mt-1.5 text-[0.69rem] text-slate-500">
                {accuracy.signalDirectionWins}W · {accuracy.signalDirectionResolved - accuracy.signalDirectionWins}L · {accuracy.signalDirectionResolved} resolved
              </p>
            </Panel>

            {/* 2. Siggi Trade Win Rate */}
            <Panel className="p-3">
              <p className="text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Siggi's trade win rate</p>
              <div className="mt-2 flex items-center gap-3">
                <DonutChart
                  size={56}
                  thickness={9}
                  centerLabel={accuracy.siggiTradeWinRate !== null ? `${accuracy.siggiTradeWinRate}%` : "—"}
                  segments={[
                    { value: accuracy.siggiTradesWon, color: "#34d399", label: "W" },
                    { value: accuracy.siggiTradesResolved - accuracy.siggiTradesWon, color: "#f87171", label: "L" },
                  ]}
                />
                <div className="min-w-0">
                  <p className={`text-[1.4rem] font-bold leading-none ${accuracy.siggiTradeWinRate !== null ? "text-emerald-300" : "text-slate-500"}`}>
                    {accuracy.siggiTradeWinRate !== null ? `${accuracy.siggiTradeWinRate}%` : "Building…"}
                  </p>
                  <p className="mt-1 text-[0.69rem] text-slate-500">
                    {accuracy.siggiTradesWon}W · {accuracy.siggiTradesResolved - accuracy.siggiTradesWon}L
                    {accuracy.siggiTradeWinRate === null ? " · need 5+" : ""}
                  </p>
                </div>
              </div>
            </Panel>

            {/* 3. Skip Quality */}
            <Panel className="p-3">
              <p className="text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Gate filter quality</p>
              <p className={`mt-2 text-[1.6rem] font-bold leading-none ${accuracy.skipQuality !== null ? (accuracy.skipQuality >= 60 ? "text-emerald-300" : accuracy.skipQuality >= 40 ? "text-amber-300" : "text-red-300") : "text-slate-500"}`}>
                {accuracy.skipQuality !== null ? `${accuracy.skipQuality}%` : "Building…"}
              </p>
              {accuracy.skipQuality !== null && (
                <div className="mt-2">
                  <StatBar label="" value={accuracy.skipQuality} color={accuracy.skipQuality >= 60 ? "#34d399" : accuracy.skipQuality >= 40 ? "#f59e0b" : "#f87171"} />
                </div>
              )}
              <p className="mt-1.5 text-[0.69rem] text-slate-500">
                {accuracy.skippedWouldBeLoss} of {accuracy.skippedResolved} skipped were correct skips
                {accuracy.skipQuality === null ? " · need 5+" : ""}
              </p>
            </Panel>
          </div>

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
                detail={`${accuracy.overallAccuracy}% win rate · ${accuracy.breakevenPredictions} breakeven`}
                tone="text-white"
              />
              <SummaryCard
                label="Recent win rate"
                value={`${accuracy.recentAccuracy}%`}
                detail="Last 12 resolved real predictions"
                tone="text-[#00C884]/80"
              />
              <SummaryCard
                label="Real predictions tracked"
                value={`${realPredictions.length}`}
                detail={`${ambiguousCalls.length} ambiguous · ${accuracy.breakevenPredictions} breakeven`}
              />
            </div>
          </Panel>

          <div className="grid gap-[5px] xl:grid-cols-4">
            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Active live calls</p>
              <div className="mt-3 grid gap-[5px]">
                {activeCalls.length > 0 ? (
                  activeCalls.map((item) => (
                    <div key={item.id} className="signal-surface-soft rounded-[0.65rem] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.92rem] font-semibold text-white">{item.symbol}</p>
                          <p className="mt-0.5 text-[0.76rem] font-medium text-[#00C884]">{item.actionAtCall === "BUY" ? "LONG ▲" : item.actionAtCall === "SELL" ? "SHORT ▼" : item.actionAtCall} · {item.timeframe} · {item.decisionAtCall}</p>
                          <p className="mt-0.5 text-[0.72rem] text-slate-400">
                            Entry {item.entryAtCall} · Stop {item.stopAtCall} · Target {item.targetAtCall}
                          </p>
                          <p className="mt-0.5 text-[0.70rem] text-slate-500">Locked {formatDateTimeLabel(item.calledAt)}</p>
                        </div>
                        <StatusChip label="LIVE" />
                      </div>
                      <ResolutionEvidence text={item.resolutionEvidence} />
                      <p className="mt-2 text-[0.80rem] leading-5 text-slate-300">{item.narrative}</p>
                    </div>
                  ))
                ) : (
                  <div className="signal-surface-soft rounded-[0.65rem] p-3">
                    <p className="text-[0.82rem] leading-5 text-slate-400">
                      No live calls being tracked yet. They appear here the moment Siggi locks in an ENTER NOW signal.
                    </p>
                  </div>
                )}
              </div>
            </Panel>

            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Best calls</p>
              <div className="mt-3 grid gap-[5px]">
                {bestCalls.length > 0 ? bestCalls.map((item) => (
                  <div key={item.id} className="signal-surface-soft rounded-[0.65rem] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.92rem] font-semibold text-white">{item.symbol}</p>
                        <p className="mt-0.5 text-[0.76rem] font-medium text-emerald-300">{item.actionAtCall === "BUY" ? "LONG ▲" : item.actionAtCall === "SELL" ? "SHORT ▼" : item.actionAtCall} · {item.timeframe} · {item.strategyAtCall}</p>
                        <p className="mt-0.5 text-[0.72rem] text-slate-400">
                          Entry {item.entryAtCall} · Stop {item.stopAtCall} · Target {item.targetAtCall}
                        </p>
                        <p className="mt-0.5 text-[0.70rem] text-slate-500">Called {formatDateTimeLabel(item.calledAt)} · Resolved {item.resolvedAt ? formatDateTimeLabel(item.resolvedAt) : "—"}</p>
                      </div>
                      <OutcomeChip outcome={item.outcome} />
                    </div>
                    <ResolutionEvidence text={item.resolutionEvidence} />
                    <p className="mt-2 text-[0.80rem] leading-5 text-slate-300">{item.narrative}</p>
                  </div>
                )) : (
                  <div className="signal-surface-soft rounded-[0.65rem] p-3">
                    <p className="text-[0.82rem] leading-5 text-slate-400">Wins appear here as predictions resolve.</p>
                  </div>
                )}
              </div>
            </Panel>

            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Breakeven closes</p>
              <div className="mt-3 grid gap-[5px]">
                {breakevenCalls.length > 0 ? (
                  breakevenCalls.map((item) => (
                    <div key={item.id} className="signal-surface-soft rounded-[0.65rem] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[0.92rem] font-semibold text-white">{item.symbol}</p>
                          <p className="mt-0.5 text-[0.72rem] text-slate-400">
                            Entry {item.entryAtCall} · Stop {item.stopAtCall} · Target {item.targetAtCall}
                          </p>
                          <p className="mt-0.5 text-[0.70rem] text-slate-500">Resolved {item.resolvedAt ? formatDateTimeLabel(item.resolvedAt) : "—"}</p>
                        </div>
                        <span className="shrink-0 rounded-[0.3rem] bg-slate-600/30 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-300 ring-1 ring-slate-500/30">BE</span>
                      </div>
                      <ResolutionEvidence text={item.resolutionEvidence} />
                      <p className="mt-2 text-[0.80rem] leading-5 text-slate-300">{item.narrative}</p>
                    </div>
                  ))
                ) : (
                  <div className="signal-surface-soft rounded-[0.65rem] p-3">
                    <p className="text-[0.82rem] leading-5 text-slate-400">No breakeven closes yet.</p>
                  </div>
                )}
              </div>
            </Panel>

            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Misses to learn from</p>
              <div className="mt-3 grid gap-[5px]">
                {misses.length > 0 ? misses.map((item) => (
                  <div key={item.id} className="signal-surface-soft rounded-[0.65rem] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.92rem] font-semibold text-white">{item.symbol}</p>
                        <p className="mt-0.5 text-[0.76rem] font-medium text-red-300">{item.actionAtCall === "BUY" ? "LONG ▲" : item.actionAtCall === "SELL" ? "SHORT ▼" : item.actionAtCall} · {item.timeframe} · {item.strategyAtCall}</p>
                        <p className="mt-0.5 text-[0.72rem] text-slate-400">
                          Entry {item.entryAtCall} · Stop {item.stopAtCall} · Target {item.targetAtCall}
                        </p>
                        <p className="mt-0.5 text-[0.70rem] text-slate-500">Called {formatDateTimeLabel(item.calledAt)} · Resolved {item.resolvedAt ? formatDateTimeLabel(item.resolvedAt) : "—"}</p>
                      </div>
                      <OutcomeChip outcome={item.outcome} />
                    </div>
                    <ResolutionEvidence text={item.resolutionEvidence} />
                    <p className="mt-2 text-[0.80rem] leading-5 text-slate-300">{item.narrative}</p>
                  </div>
                )) : (
                  <div className="signal-surface-soft rounded-[0.65rem] p-3">
                    <p className="text-[0.82rem] leading-5 text-slate-400">No losses yet — they appear here when a prediction resolves at the stop.</p>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          {/* Full prediction table */}
          <Panel className="overflow-hidden p-0">
            <HistoryTableClient
              items={realPredictions}
              notes={notes}
              currency={displayCurrencyState.currency}
              rates={displayCurrencyState.rates}
            />
          </Panel>
        </>
      )}

      {/* ── Demo seed data — shown separately, clearly labelled ── */}
      {seedPredictions.length > 0 && (
        <Panel className="p-3 sm:p-3.5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="micro-label">Demo data ({seedPredictions.length} records)</p>
              <p className="mt-1 text-[0.75rem] text-slate-500">
                Pre-seeded sample records used to populate the app on first launch. These are{" "}
                <span className="text-amber-400">not counted in any accuracy statistics.</span>{" "}
                Use the Reset button above to clear them.
              </p>
            </div>
          </div>
          <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-3">
            {seedPredictions.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-[0.4rem] bg-amber-400/4 p-3 ring-1 ring-amber-400/10">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[0.85rem] font-semibold text-slate-300">{item.symbol}</p>
                    <p className="mt-0.5 text-[0.70rem] text-slate-500">{item.actionAtCall === "BUY" ? "LONG ▲" : item.actionAtCall === "SELL" ? "SHORT ▼" : item.actionAtCall} · {item.timeframe} · {item.strategyAtCall}</p>
                    <p className="mt-0.5 text-[0.68rem] text-slate-600">
                      Entry {item.entryAtCall} · Stop {item.stopAtCall} · Target {item.targetAtCall}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-[0.25rem] bg-amber-400/10 px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider text-amber-500 ring-1 ring-amber-400/20">DEMO</span>
                </div>
              </div>
            ))}
          </div>
          {seedPredictions.length > 6 && (
            <p className="mt-2 text-[0.72rem] text-slate-600">+{seedPredictions.length - 6} more demo records — reset to clear all of them.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
