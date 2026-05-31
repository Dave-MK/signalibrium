import { tradeTickets } from "../_data/mock-data";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRiskReward,
} from "../_lib/format";
import { KeyValue, PageHeader, Panel, StatusChip } from "../_components/ui";

export default function RiskLabPage() {
  const focus = tradeTickets[0];
  const riskPerTrade = 1;
  const accountSize = 182450;

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Risk Lab"
        title="Risk sizing before ticket approval"
        description="The V1 risk surface focuses on protected decision quality: account size, risk per trade, entry, stop-loss, take-profit, position size, max planned loss, potential gain, and risk gate warnings."
      />

      <div className="grid gap-[5px] xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-4 sm:p-5">
          <p className="micro-label">Sizing Snapshot</p>
          <div className="mt-5 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
            <KeyValue
              label="Account Size"
              value={formatCurrency(accountSize)}
              detail="Prototype capital base"
            />
            <KeyValue
              label="Risk Per Trade"
              value={formatPercent(riskPerTrade)}
              detail="Hard risk budget"
            />
            <KeyValue label="Entry" value={formatCurrency(focus.entry)} />
            <KeyValue label="Stop-Loss" value={formatCurrency(focus.stopLoss)} />
            <KeyValue
              label="Take-Profit"
              value={formatCurrency(focus.takeProfit)}
            />
            <KeyValue
              label="Position Size"
              value={`${formatNumber(focus.quantity, 0)} units`}
            />
            <KeyValue
              label="Planned Loss"
              value={formatCurrency(focus.plannedLoss)}
            />
            <KeyValue
              label="Potential Gain"
              value={formatCurrency(focus.potentialGain)}
            />
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <p className="micro-label">Decision Layer</p>
          <div className="mt-4 panel-stack-5">
            <div className="signal-accent-surface rounded-[0.58rem] p-3.5">
              <p className="font-semibold text-white">
                Risk/Reward {formatRiskReward(focus.riskReward)}
              </p>
              <p className="mt-2 text-sm leading-5 text-slate-300">
                The ticket is acceptable because invalidation is explicit and the
                projected gain remains larger than the capped planned loss.
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.58rem] p-3.5">
              <p className="font-semibold text-white">Volatility warning</p>
              <p className="mt-2 text-sm leading-5 text-slate-300">
                ATR is rising. Signalibrium is allowing the trade, but position size
                remains below full theoretical allocation.
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.58rem] p-3.5">
              <p className="font-semibold text-white">Liquidity warning</p>
              <p className="mt-2 text-sm leading-5 text-slate-300">
                Spread remains acceptable for protected simulation. Re-check before
                moving toward live execution later.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="micro-label">Risk Gate Checks</p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-[1.35rem]">
              Ticket approval logic
            </h2>
          </div>
          <StatusChip label="WATCH" />
        </div>
        <div className="mt-5 grid gap-[5px] lg:grid-cols-2">
          {focus.gateResults.map((gate) => (
            <div
              key={gate.label}
              className="signal-surface-soft rounded-[0.58rem] p-3.5"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="font-semibold text-white">{gate.label}</p>
                <StatusChip label={gate.status} />
              </div>
              <p className="mt-3 text-sm leading-5 text-slate-300">{gate.detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
