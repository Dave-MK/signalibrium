import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { formatPercent } from "../_lib/format";
import { Sparkline } from "../_components/sparkline";
import { KeyValue, PageHeader, Panel, StatusChip } from "../_components/ui";

export default async function BacktestingLabPage() {
  const backtests = await listBacktests();
  const focus = backtests[0] ?? null;

  if (!focus) {
    return (
      <div className="panel-stack-5">
        <PageHeader
          eyebrow="Backtesting Lab"
          title="Test the edge before capital does"
          description="No persisted backtest records are available yet."
        />
        <Panel className="p-3 sm:p-3.5">
          <p className="text-[0.84rem] text-slate-300">
            Seed or create a backtest record to activate this lab view.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Backtesting Lab"
        title="Test the edge before capital does"
        description="The prototype backtesting surface is shaped around the handover inputs and outputs: asset, strategy, timeframe, capital assumptions, equity curve, drawdown curve, warnings, and AI explanation grounded in measured results."
      />

      <div className="grid gap-[5px] xl:grid-cols-[0.82fr_1.18fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Backtest Inputs</p>
          <div className="mt-3 grid gap-[5px]">
            {[
              ["Asset", focus.asset],
              ["Strategy", focus.strategy],
              ["Timeframe", focus.timeframe],
              ["Date Range", focus.dateRange],
              ["Starting Capital", `$${focus.startingCapital.toLocaleString("en-US")}`],
              ["Fees", `${(focus.feesBps / 100).toFixed(2)}%`],
              ["Slippage", `${(focus.slippageBps / 100).toFixed(2)}%`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="signal-surface-soft rounded-[0.4rem] px-3 py-2.5"
              >
                <p className="micro-label">{label}</p>
                <p className="mt-1.5 text-[0.84rem] font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="micro-label">Output Snapshot</p>
              <h2 className="mt-1.5 text-lg font-semibold text-white sm:text-[1.15rem]">
                {focus.asset} / {focus.strategy}
              </h2>
            </div>
            <StatusChip label="BACKTESTED" />
          </div>

          <div className="mt-4 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
            <KeyValue
              label="Total Return"
              value={formatPercent(focus.totalReturn)}
            />
            <KeyValue
              label="Annualised"
              value={formatPercent(focus.annualisedReturn)}
            />
            <KeyValue label="Win Rate" value={formatPercent(focus.winRate)} />
            <KeyValue label="Sharpe" value={focus.sharpe.toFixed(2)} />
            <KeyValue
              label="Max Drawdown"
              value={formatPercent(focus.maxDrawdown)}
            />
            <KeyValue
              label="Profit Factor"
              value={focus.profitFactor.toFixed(2)}
            />
            <KeyValue label="Trade Count" value={String(focus.equityCurve.length)} />
            <KeyValue label="AI Read" value={focus.aiRead} />
          </div>

          <div className="mt-4 grid gap-[5px] lg:grid-cols-2">
            <div className="signal-surface rounded-[0.46rem] p-3">
              <p className="micro-label">Equity Curve</p>
              <Sparkline data={focus.equityCurve} className="mt-3 h-28 w-full sm:h-36" />
            </div>
            <div className="signal-surface rounded-[0.46rem] p-3">
              <p className="micro-label">Drawdown Curve</p>
              <Sparkline
                data={focus.drawdownCurve}
                className="mt-3 h-28 w-full sm:h-36"
                color="#EF4444"
              />
            </div>
          </div>

          <div className="mt-4 panel-stack-5">
            {focus.warnings.map((warning) => (
              <div
                key={warning}
                className="signal-warning-surface rounded-[0.4rem] p-3 text-[0.82rem] leading-5 text-slate-200"
              >
                {warning}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
