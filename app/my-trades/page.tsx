import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import { listBrokerConnections } from "@/app/_lib/server/repositories/broker-connections";
import { PageHeader, Panel } from "@/app/_components/ui";
import { TicketsClient } from "./tickets-client";

export default async function MyTradesPage() {
  const [tickets, connections] = await Promise.all([
    listTradeTickets(),
    listBrokerConnections(),
  ]);

  const activeCount    = tickets.filter((t) => ["Draft","Ready","Submitted","Working","Partially Closed"].includes(t.status)).length;
  const filledCount    = tickets.filter((t) => t.status === "Filled" || t.status === "Closed").length;

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Execution"
        title="My Trades"
        description="Manual trade tickets — create from any live signal or build one from scratch, then submit directly to your connected broker."
      />

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-[5px] sm:grid-cols-3">
        {[
          { label: "Total tickets",  value: tickets.length,  color: "text-slate-200"   },
          { label: "Active / open",  value: activeCount,     color: "text-[#00C884]"    },
          { label: "Filled",         value: filledCount,     color: "text-emerald-300" },
        ].map((s) => (
          <Panel key={s.label} className="p-3">
            <p className="text-[0.60rem] font-semibold uppercase tracking-[0.14em] text-slate-600">{s.label}</p>
            <p className={`mt-1 text-[1.25rem] font-bold ${s.color}`}>{s.value}</p>
          </Panel>
        ))}
      </div>

      <Panel className="p-3 sm:p-4">
        <TicketsClient initialTickets={tickets} connections={connections} />
      </Panel>
    </div>
  );
}
