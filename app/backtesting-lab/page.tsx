import { listAiOpportunities } from "@/app/_lib/server/repositories/ai-opportunities";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listConfirmationChecks } from "@/app/_lib/server/repositories/confirmation-checks";
import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import { getMarketSnapshot } from "@/app/_lib/server/repositories/market-snapshot";
import { formatDateLabel, formatPercent } from "../_lib/format";
import { Sparkline } from "../_components/sparkline";
import { KeyValue, PageHeader, Panel, StatusChip } from "../_components/ui";

function SectionHeader({
  title,
}: {
  title: string;
}) {
  return (
    <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-white">
      {title}
    </h2>
  );
}

export default async function BacktestingLabPage() {
  const [backtests, journalEntries, confirmationChecks, marketSnapshot, marketEvents, aiOpportunities] = await Promise.all([
    listBacktests(),
    listJournalEntries(),
    listConfirmationChecks(),
    getMarketSnapshot(),
    listMarketEvents(),
    listAiOpportunities(),
  ]);
  const focus = backtests[0] ?? null;
  const recentMemories = [...journalEntries]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 3);
  const confirmationFeed = confirmationChecks.slice(0, 4);
  const eventFeed = marketEvents.slice(0, 3);
  const opportunityFeed = aiOpportunities.slice(0, 2);

  if (!focus) {
    return (
      <div className="panel-stack-5">
        <PageHeader
          eyebrow="Research"
          title="Build market memory before trusting forecasts"
          description="No saved research records are available yet."
        />
        <Panel className="p-3 sm:p-3.5">
          <p className="text-[0.84rem] text-slate-300">
            Save backtests, review notes, and opportunity confirmations to activate this workspace.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Research"
        title="Evidence, memory, and confirmation in one place"
        description="This page is where the desk remembers what has worked, what has failed, which drivers matter now, and which opportunities still deserve trust."
      />

      <div className="grid gap-[5px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="panel-stack-5">
          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Backtest Focus" />
            <div className="mt-3 grid gap-[5px] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="signal-surface rounded-[0.46rem] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="micro-label">Primary Replay</p>
                    <h2 className="mt-1.5 text-[1.08rem] font-semibold text-white">
                      {focus.asset} / {focus.strategy}
                    </h2>
                    <p className="mt-1 text-[0.8rem] text-slate-400">
                      {focus.timeframe} · {focus.dateRange}
                    </p>
                  </div>
                  <StatusChip label={focus.status} />
                </div>

                <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
                  <KeyValue label="Total Return" value={formatPercent(focus.totalReturn)} />
                  <KeyValue label="Annualised" value={formatPercent(focus.annualisedReturn)} />
                  <KeyValue label="Win Rate" value={formatPercent(focus.winRate)} />
                  <KeyValue label="Sharpe" value={focus.sharpe.toFixed(2)} />
                  <KeyValue label="Drawdown" value={formatPercent(focus.maxDrawdown)} />
                  <KeyValue label="Profit Factor" value={focus.profitFactor.toFixed(2)} />
                </div>

                <div className="mt-3 grid gap-[5px]">
                  {focus.warnings.map((warning) => (
                    <div
                      key={warning}
                      className="signal-warning-surface rounded-[0.4rem] p-3 text-[0.82rem] leading-5 text-slate-200"
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-[5px]">
                <div className="signal-surface rounded-[0.46rem] p-3">
                  <p className="micro-label">Equity Curve</p>
                  <Sparkline data={focus.equityCurve} className="mt-3 h-30 w-full sm:h-36" />
                </div>
                <div className="signal-surface rounded-[0.46rem] p-3">
                  <p className="micro-label">Drawdown Curve</p>
                  <Sparkline
                    data={focus.drawdownCurve}
                    className="mt-3 h-30 w-full sm:h-36"
                    color="#EF4444"
                  />
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Confirmation Feed" />
            <div className="mt-3 grid gap-[5px]">
              {confirmationFeed.map((check) => (
                <div key={check.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[0.92rem] font-semibold text-white">{check.symbol}</p>
                        <StatusChip label={check.overallStatus.toUpperCase()} />
                      </div>
                      <p className="mt-1 text-[0.78rem] text-slate-400">
                        {check.stance} thesis · score {check.score}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{check.summary}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="panel-stack-5 xl:sticky xl:top-[5.85rem] xl:self-start">
          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Research State" />
            <div className="mt-3 grid gap-[5px]">
              <div className="signal-surface-soft rounded-[0.4rem] p-3">
                <p className="micro-label">Desk Bias</p>
                <p className="mt-1.5 text-[0.96rem] font-semibold text-white">{marketSnapshot.state}</p>
                <p className="mt-1 text-[0.78rem] leading-5 text-slate-400">{marketSnapshot.description}</p>
              </div>
              <div className="signal-surface-soft rounded-[0.4rem] p-3">
                <p className="micro-label">Review Reminder</p>
                <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                  {marketSnapshot.journalReminder}
                </p>
              </div>
            </div>
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Live Drivers" />
            <div className="mt-3 grid gap-[5px]">
              {eventFeed.map((event) => (
                <div key={event.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.9rem] font-semibold text-white">{event.title}</p>
                      <p className="mt-0.5 text-[0.76rem] text-slate-400">
                        {event.scope} · {event.sourceLabel}
                      </p>
                    </div>
                    <StatusChip label={event.status.toUpperCase()} />
                  </div>
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{event.summary}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Recent Memory" />
            <div className="mt-3 grid gap-[5px]">
              {opportunityFeed.map((opportunity) => (
                <div key={opportunity.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <p className="text-[0.9rem] font-semibold text-white">{opportunity.symbol}</p>
                  <p className="mt-1 text-[0.76rem] text-slate-400">
                    {opportunity.title} · {opportunity.action}
                  </p>
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{opportunity.summary}</p>
                </div>
              ))}
              {recentMemories.map((entry) => (
                <div key={entry.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.9rem] font-semibold text-white">{entry.asset}</p>
                      <p className="mt-0.5 text-[0.76rem] text-slate-400">{formatDateLabel(entry.date)}</p>
                    </div>
                    <StatusChip label={entry.status.toUpperCase()} />
                  </div>
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{entry.aiReview}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
