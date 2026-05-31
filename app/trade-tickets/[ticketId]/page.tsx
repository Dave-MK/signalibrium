import { notFound } from "next/navigation";
import { getTradeTicketById } from "../../_data/mock-data";
import { formatCurrency, formatNumber, formatRiskReward } from "../../_lib/format";
import { ActionLink, KeyValue, PageHeader, Panel, StatusChip } from "../../_components/ui";

export default async function TradeTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const ticket = getTradeTicketById(ticketId);

  if (!ticket) {
    notFound();
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Trade Ticket"
        title={`${ticket.symbol} protected trade ticket`}
        description={ticket.rationale}
        action={<ActionLink href="/journal">Save To Journal</ActionLink>}
      />

      <div className="grid gap-[5px] xl:grid-cols-[1.05fr_0.95fr]">
        <Panel className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="micro-label">Ticket Details</p>
              <h2 className="mt-2 text-xl font-semibold text-white sm:text-[1.35rem]">
                {ticket.strategy}
              </h2>
              <p className="mt-1 text-slate-400">
                {ticket.side} / {ticket.orderType} / Protected simulation only
              </p>
            </div>
            <StatusChip label={ticket.status.toUpperCase()} />
          </div>

          <div className="mt-5 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-3">
            <KeyValue label="Entry" value={formatCurrency(ticket.entry)} />
            <KeyValue label="Stop-Loss" value={formatCurrency(ticket.stopLoss)} />
            <KeyValue
              label="Take-Profit"
              value={formatCurrency(ticket.takeProfit)}
            />
            <KeyValue
              label="Quantity"
              value={`${formatNumber(ticket.quantity, 0)} units`}
            />
            <KeyValue
              label="Estimated Value"
              value={formatCurrency(ticket.estimatedValue)}
            />
            <KeyValue
              label="Risk/Reward"
              value={formatRiskReward(ticket.riskReward)}
            />
            <KeyValue
              label="Planned Loss"
              value={formatCurrency(ticket.plannedLoss)}
            />
            <KeyValue
              label="Potential Gain"
              value={formatCurrency(ticket.potentialGain)}
            />
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <p className="micro-label">Execution Actions</p>
          <div className="mt-4 panel-stack-5">
            <div className="signal-accent-surface rounded-[0.58rem] p-3.5">
              <p className="font-semibold text-white">Simulate protected trade</p>
              <p className="mt-2 text-sm leading-5 text-slate-300">
                Creates a paper trade with explicit stop-loss and take-profit
                assumptions, then logs the ticket for journal review.
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.58rem] p-3.5">
              <p className="font-semibold text-white">Later live action</p>
              <p className="mt-2 text-sm leading-5 text-slate-300">
                Reserved for future broker connectivity after legal, security, and
                execution validation.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="p-4 sm:p-5">
        <p className="micro-label">Risk Gate Results</p>
        <div className="mt-5 grid gap-[5px] lg:grid-cols-2">
          {ticket.gateResults.map((gate) => (
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
