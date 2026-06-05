import { formatInstrumentPriceForDisplay } from "@/app/_lib/currency";
import { summarizePredictionAccuracy } from "@/app/_lib/bot-engine";
import { formatDateTimeLabel, formatPercent } from "@/app/_lib/format";
import { getDisplayCurrencyState } from "@/app/_lib/server/currency-preference";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { PageHeader, Panel, StatusChip } from "../_components/ui";

function ResolutionEvidence({ text }: { text: string | null }) {
  if (!text) {
    return null;
  }

  return <p className="mt-1 text-[0.72rem] leading-4 text-cyan-200">{text}</p>;
}

function SummaryCell({
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
      <p className={`mt-1.5 text-[0.98rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[0.76rem] leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

export default async function HistoryPage() {
  const [predictionHistory, displayCurrencyState] = await Promise.all([
    listPredictionHistory(),
    getDisplayCurrencyState(),
  ]);
  const accuracy = summarizePredictionAccuracy(predictionHistory);
  const bestCalls = predictionHistory
    .filter((item) => item.outcomeAccuracy === "Accurate")
    .slice(0, 4);
  const misses = predictionHistory
    .filter((item) => item.outcomeAccuracy === "Inaccurate")
    .slice(0, 4);
  const activeCalls = predictionHistory
    .filter((item) => item.monitoringStatus === "Active")
    .slice(0, 4);
  const ambiguousCalls = predictionHistory.filter((item) => item.outcome === "Ambiguous");

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Prediction replay"
        description="Check how recent enter-now and wait calls actually played out."
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] sm:grid-cols-4">
          <SummaryCell
            label="Overall accuracy"
            value={`${accuracy.overallAccuracy}%`}
            detail={`${accuracy.accuratePredictions} accurate from ${accuracy.resolvedPredictions} resolved calls`}
            tone="text-emerald-300"
          />
          <SummaryCell
            label="Recent accuracy"
            value={`${accuracy.recentAccuracy}%`}
            detail="Last 12 resolved predictions"
            tone="text-cyan-200"
          />
          <SummaryCell
            label="Tracked predictions"
            value={`${predictionHistory.length}`}
            detail={`${ambiguousCalls.length} same-candle clashes are logged as ambiguous, not counted as wins or losses`}
          />
          <SummaryCell
            label="Purpose"
            value="Trust layer"
            detail="Use this page to see whether enter-now calls matured or failed"
          />
        </div>
      </Panel>

      <div className="grid gap-[5px] xl:grid-cols-3">
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
        <div className="grid gap-[5px] border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[0.69rem] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid-cols-[minmax(0,1.2fr)_0.75fr_0.72fr_0.9fr_1fr_0.85fr_0.85fr_0.8fr]">
          <span>Instrument</span>
          <span>Call</span>
          <span>Trend</span>
          <span>Price</span>
          <span>Entry</span>
          <span>Outcome</span>
          <span>Move</span>
          <span>Accuracy</span>
        </div>

        <div>
          {predictionHistory.map((item) => (
            <div
              key={item.id}
              className="grid gap-[5px] border-b border-white/6 px-3 py-2.5 last:border-b-0 lg:grid-cols-[minmax(0,1.2fr)_0.75fr_0.72fr_0.9fr_1fr_0.85fr_0.85fr_0.8fr] lg:items-center"
            >
              <div className="min-w-0">
                <p className="text-[0.88rem] font-semibold text-white">
                  {item.symbol} <span className="text-slate-400">/ {item.instrumentName}</span>
                </p>
                <p className="mt-0.5 text-[0.74rem] text-slate-400">
                  {item.assetClass} / {item.timeframe} / {item.horizon}
                </p>
              </div>
              <div className="min-w-0">
                <StatusChip label={item.decisionAtCall} />
                <p className="mt-1 text-[0.74rem] text-slate-400">{item.actionAtCall}</p>
              </div>
              <div className="text-[0.82rem] font-semibold text-white">{item.trendAtCall}</div>
              <div className="text-[0.82rem] font-semibold text-white">
                {formatInstrumentPriceForDisplay(
                  item.priceAtCall,
                  displayCurrencyState.currency,
                  displayCurrencyState.rates,
                  item.assetClass,
                )}
              </div>
              <div className="text-[0.76rem] leading-5 text-slate-300">
                {`${formatInstrumentPriceForDisplay(
                  item.entryLowAtCall,
                  displayCurrencyState.currency,
                  displayCurrencyState.rates,
                  item.assetClass,
                )} - ${formatInstrumentPriceForDisplay(
                  item.entryHighAtCall,
                  displayCurrencyState.currency,
                  displayCurrencyState.rates,
                  item.assetClass,
                )}`}
              </div>
              <div className="min-w-0">
                <StatusChip label={item.outcome.toUpperCase()} />
                <p className="mt-1 text-[0.74rem] text-slate-400">
                  {item.resolvedAt ? formatDateTimeLabel(item.resolvedAt) : "Still live"}
                </p>
                <ResolutionEvidence text={item.resolutionEvidence} />
              </div>
              <div className="text-[0.82rem] font-semibold text-white">
                {formatPercent(item.moveFromCallPct, true)}
              </div>
              <div className="min-w-0">
                <p className="text-[0.82rem] font-semibold text-white">{item.accuracyScore}%</p>
                <p className="mt-0.5 text-[0.74rem] text-slate-400">{item.outcomeAccuracy}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
