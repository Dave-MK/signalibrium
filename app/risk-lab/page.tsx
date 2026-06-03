import Link from "next/link";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRiskReward,
} from "../_lib/format";
import { KeyValue, PageHeader, Panel, StatusChip } from "../_components/ui";

const accountSize = 182450;
const riskPerTrade = 1;

export default async function RiskLabPage() {
  const tradeTickets = await listTradeTickets();
  const focus = tradeTickets[0] ?? null;

  if (!focus) {
    return (
      <div className="panel-stack-5">
        <PageHeader
          eyebrow="Risk Command"
          title="Risk sizing before any trade earns approval"
          description="Risk command needs at least one execution ticket before it can compute sizing and gate checks."
        />
        <Panel className="p-3 sm:p-3.5">
          <p className="text-[0.84rem] text-slate-300">
            No execution tickets are available yet.
          </p>
          <Link
            href="/trade-tickets"
            className="signal-button mt-3 inline-flex rounded-[0.46rem] px-3.5 py-2 text-[0.82rem] font-semibold"
          >
            Create An Execution Ticket
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Risk Command"
        title="Risk sizing before any trade earns approval"
        description="This surface keeps the desk honest: account size, risk budget, invalidation, target, size, planned loss, potential gain, and gate warnings all have to line up."
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="micro-label">Ticket Focus</p>
            <h2 className="mt-1.5 text-lg font-semibold text-white sm:text-[1.15rem]">
              {focus.symbol} / {focus.strategy}
            </h2>
            <p className="mt-0.5 text-[0.84rem] text-slate-400">
              Risk command is reading from your current execution tickets.
            </p>
          </div>
          <StatusChip label={focus.status.toUpperCase()} />
        </div>
      </Panel>

      <div className="grid gap-[5px] xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Sizing Snapshot</p>
          <div className="mt-4 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
            <KeyValue
              label="Account Size"
              value={formatCurrency(accountSize)}
              detail="Desk capital base"
              tooltip="The notional account value used to size simulated trades in your desk."
            />
            <KeyValue
              label="Risk Per Trade"
              value={formatPercent(riskPerTrade)}
              detail="Hard risk budget"
              tooltip="The maximum percentage of account capital that can be lost if the stop-loss is hit."
            />
            <KeyValue
              label="Entry"
              value={formatCurrency(focus.entry)}
              tooltip="The planned fill price used for the current ticket."
            />
            <KeyValue
              label="Stop-Loss"
              value={formatCurrency(focus.stopLoss)}
              tooltip="The invalidation price where the position should be exited to protect capital."
            />
            <KeyValue
              label="Take-Profit"
              value={formatCurrency(focus.takeProfit)}
              tooltip="The planned first profit objective for the trade."
            />
            <KeyValue
              label="Position Size"
              value={`${formatNumber(focus.quantity, 0)} units`}
              tooltip="The number of units allowed while staying inside the defined risk budget."
            />
            <KeyValue
              label="Planned Loss"
              value={formatCurrency(focus.plannedLoss)}
              tooltip="The expected loss if the position enters and then reaches the stop-loss."
            />
            <KeyValue
              label="Potential Gain"
              value={formatCurrency(focus.potentialGain)}
              tooltip="The projected profit if price reaches the take-profit target from the planned entry."
            />
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Risk Read</p>
          <div className="mt-3 panel-stack-5">
            <div className="signal-accent-surface rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">
                Risk/Reward {formatRiskReward(focus.riskReward)}
              </p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                The selected ticket remains acceptable when invalidation is explicit
                and the projected gain outweighs the capped planned loss.
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Volatility warning</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                If ATR expands, keep sizing below theoretical maximum and re-check the
                structure before status changes.
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Execution note</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                {focus.notes.trim()
                  ? focus.notes
                  : "No execution notes saved yet. Use the ticket detail view to capture trigger, liquidity, or discipline notes."}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="p-3 sm:p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="micro-label">Risk Gate Checks</p>
            <h2 className="mt-1.5 text-lg font-semibold text-white sm:text-[1.15rem]">
              Approval logic for the current ticket
            </h2>
          </div>
          <StatusChip label="WATCH" />
        </div>
        <div className="mt-4 grid gap-[5px] lg:grid-cols-2">
          {focus.gateResults.map((gate) => (
            <div
              key={gate.label}
              className="signal-surface-soft rounded-[0.4rem] p-3"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-[0.9rem] font-semibold text-white">{gate.label}</p>
                <StatusChip label={gate.status} />
              </div>
              <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{gate.detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
