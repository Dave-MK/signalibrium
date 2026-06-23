import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import { PageHeader, Panel } from "@/app/_components/ui";
import { MarketEventsClient } from "./market-events-client";

export const dynamic = "force-dynamic";

export default async function MarketEventsPage() {
  const events = await listMarketEvents();

  const live     = events.filter((e) => e.status === "Live").length;
  const upcoming = events.filter((e) => e.status === "Upcoming").length;
  const high     = events.filter((e) => e.impact === "High").length;

  const description = [
    live > 0     && `${live} live`,
    upcoming > 0 && `${upcoming} upcoming`,
    high > 0     && `${high} high-impact`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Market Events"
        description={
          description
            ? `${description} — Gemini uses this feed when scoring every signal.`
            : "The event feed Gemini reads when scoring every signal. Auto-populated from news and economic calendar; add your own below."
        }
      />

      <Panel className="p-4">
        <MarketEventsClient initialEvents={events} />
      </Panel>
    </div>
  );
}
