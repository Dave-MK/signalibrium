import Link from "next/link";
import { tradeTickets } from "../_data/mock-data";
import { formatCurrency, formatRiskReward } from "../_lib/format";
import { ActionLink, KeyValue, PageHeader, Panel, StatusChip } from "../_components/ui";

export default function TradeTicketsPage() {
  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Protected Trade Tickets"
        title="Prepare the trade before the click exists"
        description="The prototype ticket surface is for protected planning, simulation, and journaling. No auto-trading, no blind execution, and no unbounded risk."
        action={<ActionLink href="/journal">Save Flow To Journal</ActionLink>}
      />

      <div className="grid gap-[5px] xl:grid-cols-2">
        {tradeTickets.map((ticket) => (
          <Link key={ticket.id} href={`/trade-tickets/${ticket.id}`}>
            <Panel className="h-full p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="micro-label">Prepared protected trade</p>
                  <h2 className="mt-2 text-xl font-semibold text-white sm:text-[1.35rem]">
                    {ticket.symbol}
                  </h2>
                  <p className="mt-1 text-slate-400">
                    {ticket.strategy} / {ticket.side} / {ticket.orderType}
                  </p>
                </div>
                <StatusChip label={ticket.status.toUpperCase()} />
              </div>

              <div className="mt-5 grid gap-[5px] sm:grid-cols-2">
                <KeyValue label="Entry" value={formatCurrency(ticket.entry)} />
                <KeyValue label="Stop" value={formatCurrency(ticket.stopLoss)} />
                <KeyValue
                  label="Target"
                  value={formatCurrency(ticket.takeProfit)}
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
          </Link>
        ))}
      </div>
    </div>
  );
}
