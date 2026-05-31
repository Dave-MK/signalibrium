import { backtests } from "../_data/mock-data";
import { formatPercent } from "../_lib/format";
import { Sparkline } from "../_components/sparkline";
import { KeyValue, PageHeader, Panel, StatusChip } from "../_components/ui";

export default function BacktestingLabPage() {
  const focus = backtests[0];

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Backtesting Lab"
        title="Test the edge before capital does"
        description="The prototype backtesting surface is shaped around the handover inputs and outputs: asset, strategy, timeframe, capital assumptions, equity curve, drawdown curve, warnings, and AI explanation grounded in measured results."
      />

      <div className="grid gap-[5px] xl:grid-cols-[0.82fr_1.18fr]">
        <Panel className="p-4 sm:p-5">
          <p className="micro-label">Backtest Inputs</p>
          <div className="mt-4 grid gap-[5px]">
            {[
              ["Asset", focus.asset],
              ["Strategy", focus.strategy],
              ["Timeframe", "4H"],
              ["Date Range", "01 Jan 2025 - 31 May 2026"],
              ["Starting Capital", "$100,000"],
              ["Fees", "0.12%"],
              ["Slippage", "0.18%"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="signal-surface-soft rounded-[0.58rem] px-3.5 py-3"
              >
                <p className="micro-label">{label}</p>
                <p className="mt-2 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="micro-label">Output Snapshot</p>
              <h2 className="mt-2 text-xl font-semibold text-white sm:text-[1.35rem]">
                {focus.asset} / {focus.strategy}
              </h2>
            </div>
            <StatusChip label="BACKTESTED" />
          </div>

          <div className="mt-5 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
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
            <KeyValue label="Trade Count" value="61" />
            <KeyValue label="AI Read" value="Edge intact" />
          </div>

          <div className="mt-6 grid gap-[5px] lg:grid-cols-2">
            <div className="signal-surface rounded-[0.62rem] p-4">
              <p className="micro-label">Equity Curve</p>
              <Sparkline data={focus.equityCurve} className="mt-4 h-32 w-full sm:h-40" />
            </div>
            <div className="signal-surface rounded-[0.62rem] p-4">
              <p className="micro-label">Drawdown Curve</p>
              <Sparkline
                data={focus.drawdownCurve}
                className="mt-4 h-32 w-full sm:h-40"
                color="#EF4444"
              />
            </div>
          </div>

          <div className="mt-5 panel-stack-5">
            {focus.warnings.map((warning) => (
              <div
                key={warning}
                className="signal-warning-surface rounded-[0.58rem] p-3.5 text-sm leading-5 text-slate-200"
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
