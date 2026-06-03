import { strategies } from "../_data/mock-data";
import { formatPercent } from "../_lib/format";
import { PageHeader, Panel, StatusChip } from "../_components/ui";

export default function StrategyLabPage() {
  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Playbooks"
        title="Your edge should be explicit before it is trusted"
        description="These playbooks are the rule sets your desk can explain back to you. Each one shows where it fits, when it fails, and what the measured history says about using it."
      />

      <div className="grid gap-[5px] xl:grid-cols-3">
        {strategies.map((strategy) => (
          <Panel key={strategy.id} className="p-3 sm:p-3.5">
            <p className="micro-label">Strategy</p>
            <h2 className="mt-2 text-lg font-semibold text-white sm:text-[1.15rem]">{strategy.name}</h2>
            <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{strategy.thesis}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {strategy.bestRegimes.map((regime) => (
                <StatusChip key={`${strategy.id}-${regime}`} label={regime.toUpperCase()} />
              ))}
            </div>

            <div className="mt-4 grid gap-[5px] sm:grid-cols-2">
              <div>
                <p className="micro-label">Profit Factor</p>
                <p className="mt-1.5 text-[1rem] font-semibold text-white">
                  {strategy.backtest.profitFactor.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="micro-label">Win Rate</p>
                <p className="mt-1.5 text-[1rem] font-semibold text-white">
                  {formatPercent(strategy.backtest.winRate)}
                </p>
              </div>
              <div>
                <p className="micro-label">Max Drawdown</p>
                <p className="mt-1.5 text-[1rem] font-semibold text-white">
                  {formatPercent(strategy.backtest.maxDrawdown)}
                </p>
              </div>
              <div>
                <p className="micro-label">Trade Count</p>
                <p className="mt-1.5 text-[1rem] font-semibold text-white">
                  {strategy.backtest.tradeCount}
                </p>
              </div>
            </div>

            <div className="signal-divider my-4" />

            <div className="panel-stack-5">
              {strategy.rules.map((rule) => (
                <div
                  key={rule}
                  className="signal-surface-soft rounded-[0.4rem] p-3 text-[0.82rem] leading-5 text-slate-200"
                >
                  {rule}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
