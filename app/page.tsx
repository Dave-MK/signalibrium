import Link from "next/link";
import { listAiOpportunities } from "@/app/_lib/server/repositories/ai-opportunities";
import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listConfirmationChecks } from "@/app/_lib/server/repositories/confirmation-checks";
import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import { getMarketSnapshot } from "@/app/_lib/server/repositories/market-snapshot";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import { listWatchlists } from "@/app/_lib/server/repositories/watchlists";
import type {
  PersistedAiOpportunity,
  PersistedConfirmationCheck,
  PersistedJournalEntry,
  PersistedMarketEvent,
  PersistedTradeTicket,
} from "./_lib/server/workspace-types";
import type { Asset } from "./_data/mock-data";
import {
  formatCurrency,
  formatDateLabel,
  formatPercent,
  formatRiskReward,
} from "./_lib/format";
import {
  getDefaultPersistedWatchlist,
  resolveAssetsForWatchlist,
} from "./_lib/reference-data";
import { Sparkline } from "./_components/sparkline";
import { ActionLink, PageHeader, Panel, StatusChip } from "./_components/ui";

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-white">
        {title}
      </h2>
      {action}
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone = "text-white",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <p className="micro-label">{label}</p>
      <p className={`mt-1.5 text-[1.02rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[0.76rem] leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

function RecommendationCard({
  opportunity,
}: {
  opportunity: PersistedAiOpportunity;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[0.96rem] font-semibold text-white">{opportunity.symbol}</p>
            <StatusChip label={opportunity.action.toUpperCase()} />
          </div>
          <p className="mt-1 text-[0.8rem] text-slate-400">
            {opportunity.title} · {opportunity.side}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.72rem] uppercase tracking-[0.14em] text-slate-500">Confidence</p>
          <p className="mt-1 text-[1rem] font-semibold text-cyan-200">{opportunity.confidence}</p>
        </div>
      </div>

      <p className="mt-3 text-[0.82rem] leading-5 text-slate-300">{opportunity.summary}</p>

      <div className="mt-3 grid gap-[5px] sm:grid-cols-3">
        <MetricTile label="Entry" value={opportunity.entryPlan} detail={opportunity.stopPlan} />
        <MetricTile label="Target" value={opportunity.targetPlan} detail={opportunity.expectedMove} />
        <MetricTile label="Confirmation" value={opportunity.action} detail={opportunity.confirmationContext} tone={opportunity.action === "Wait" ? "text-amber-200" : "text-emerald-300"} />
      </div>
    </div>
  );
}

function MarketEventCard({
  event,
}: {
  event: PersistedMarketEvent;
}) {
  const tone =
    event.bias === "Bullish"
      ? "text-emerald-300"
      : event.bias === "Bearish"
        ? "text-red-300"
        : event.bias === "Mixed"
          ? "text-amber-200"
          : "text-slate-200";

  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
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
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.74rem]">
        <span className={tone}>{event.bias}</span>
        <span className="text-slate-500">Impact {event.impact}</span>
      </div>
    </div>
  );
}

function ConfirmationCard({
  check,
}: {
  check: PersistedConfirmationCheck;
}) {
  const tone =
    check.overallStatus === "Confirmed"
      ? "text-emerald-300"
      : check.overallStatus === "Rejected"
        ? "text-red-300"
        : "text-amber-200";

  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.9rem] font-semibold text-white">{check.symbol}</p>
          <p className="mt-0.5 text-[0.76rem] text-slate-400">{check.stance} thesis</p>
        </div>
        <p className={`text-[0.86rem] font-semibold ${tone}`}>{check.score}</p>
      </div>
      <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{check.summary}</p>
    </div>
  );
}

function AssetStripCard({
  asset,
}: {
  asset: Asset;
}) {
  return (
    <Link
      href={`/assets/${asset.symbol}`}
      className="signal-surface-soft rounded-[0.4rem] p-3 transition hover:border-cyan-300/18 hover:bg-white/[0.03]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.92rem] font-semibold text-white">{asset.symbol}</p>
          <p className="mt-0.5 text-[0.76rem] text-slate-400">{asset.name}</p>
        </div>
        <p className={`text-[0.82rem] font-semibold ${asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"}`}>
          {formatPercent(asset.change24h, true)}
        </p>
      </div>
      <p className="mt-2 text-[1.02rem] font-semibold text-white">{formatCurrency(asset.price)}</p>
      <Sparkline data={asset.sparkline} className="mt-2 h-10 w-full" />
    </Link>
  );
}

function TicketCard({
  ticket,
}: {
  ticket: PersistedTradeTicket;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.92rem] font-semibold text-white">{ticket.symbol}</p>
          <p className="mt-0.5 text-[0.76rem] text-slate-400">
            {ticket.strategy} · {ticket.side}
          </p>
        </div>
        <StatusChip label={ticket.status.toUpperCase()} />
      </div>
      <div className="mt-3 grid gap-[5px] sm:grid-cols-3">
        <MetricTile label="Entry" value={formatCurrency(ticket.entry)} detail={`Stop ${formatCurrency(ticket.stopLoss)}`} />
        <MetricTile label="Target" value={formatCurrency(ticket.takeProfit)} detail={`R/R ${formatRiskReward(ticket.riskReward)}`} />
        <MetricTile label="Risk" value={formatCurrency(ticket.plannedLoss)} detail={`Potential ${formatCurrency(ticket.potentialGain)}`} />
      </div>
    </div>
  );
}

function MemoryCard({
  entry,
}: {
  entry: PersistedJournalEntry;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.9rem] font-semibold text-white">{entry.asset}</p>
          <p className="mt-0.5 text-[0.76rem] text-slate-400">{formatDateLabel(entry.date)}</p>
        </div>
        <StatusChip label={entry.status.toUpperCase()} />
      </div>
      <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{entry.aiReview}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const [watchlists, tradeTickets, journalEntries, assets, backtests, marketSnapshot, aiOpportunities, marketEvents, confirmationChecks] =
    await Promise.all([
      listWatchlists(),
      listTradeTickets(),
      listJournalEntries(),
      listAssets(),
      listBacktests(),
      getMarketSnapshot(),
      listAiOpportunities(),
      listMarketEvents(),
      listConfirmationChecks(),
    ]);

  const activeWatchlist = getDefaultPersistedWatchlist(watchlists);
  const watchlistAssets = (
    activeWatchlist
      ? resolveAssetsForWatchlist(activeWatchlist.itemSymbols, assets)
      : assets
  ).slice(0, 4);
  const topOpportunities = aiOpportunities.slice(0, 3);
  const recentTickets = [...tradeTickets]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 3);
  const recentMemories = [...journalEntries]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 2);
  const researchFocus = backtests[0] ?? null;
  const primaryOpportunity = topOpportunities[0] ?? null;
  const topEvents = marketEvents.slice(0, 2);
  const topConfirmations = confirmationChecks.slice(0, 2);

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Command Center"
        title="One clean read of the market"
        description="Use this page to understand what the market is doing now, what the AI currently favours, what macro or news drivers matter, and what deserves execution next."
        action={<ActionLink href="/scanner">Open AI Opportunities</ActionLink>}
      />

      <div className="grid gap-[5px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="panel-stack-5">
          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Live Market State" />
            <div className="mt-3 grid gap-[5px] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="signal-surface rounded-[0.46rem] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="micro-label">Current Bias</p>
                    <h2 className="mt-1.5 text-[1.18rem] font-semibold text-white">{marketSnapshot.state}</h2>
                  </div>
                  <StatusChip label={marketSnapshot.breadthScore >= 60 ? "BULLISH" : marketSnapshot.breadthScore <= 40 ? "DEFENSIVE" : "BALANCED"} />
                </div>
                <p className="mt-3 text-[0.84rem] leading-5 text-slate-300">{marketSnapshot.description}</p>
                <p className="mt-3 text-[0.74rem] text-slate-500">
                  Last live sync {marketSnapshot.lastRefresh || "awaiting sync"}
                </p>
              </div>

              <div className="grid gap-[5px] sm:grid-cols-2 lg:grid-cols-1">
                <MetricTile
                  label="Breadth"
                  value={`${marketSnapshot.breadthScore}/100`}
                  detail="Desk confidence in the current market backdrop"
                  tone="text-cyan-200"
                />
                <MetricTile
                  label="Watchlist Move"
                  value={formatPercent(marketSnapshot.watchlistMove, true)}
                  detail="Average live move across the active basket"
                  tone={marketSnapshot.watchlistMove >= 0 ? "text-emerald-300" : "text-red-300"}
                />
                <MetricTile
                  label="Risk Open"
                  value={formatPercent(marketSnapshot.openRisk)}
                  detail={`Desk equity ${formatCurrency(marketSnapshot.simulatedEquity)}`}
                />
              </div>
            </div>
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <SectionHeader
              title="AI Recommended Orders"
              action={<Link href="/scanner" className="text-[0.78rem] font-medium text-slate-400 transition hover:text-white">View full feed</Link>}
            />
            <div className="mt-3 grid gap-[5px] xl:grid-cols-3">
              {topOpportunities.length > 0 ? (
                topOpportunities.map((opportunity) => <RecommendationCard key={opportunity.id} opportunity={opportunity} />)
              ) : (
                <div className="signal-surface-soft rounded-[0.4rem] p-3 text-[0.84rem] text-slate-300 xl:col-span-3">
                  No AI-ranked opportunities are available yet.
                </div>
              )}
            </div>
          </Panel>

          <div className="grid gap-[5px] xl:grid-cols-2">
            <Panel className="p-3 sm:p-3.5">
              <SectionHeader
                title="Live Basket"
                action={<Link href="/assets" className="text-[0.78rem] font-medium text-slate-400 transition hover:text-white">Open charts</Link>}
              />
              <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
                {watchlistAssets.length > 0 ? (
                  watchlistAssets.map((asset) => <AssetStripCard key={asset.symbol} asset={asset} />)
                ) : (
                  <div className="signal-surface-soft rounded-[0.4rem] p-3 text-[0.84rem] text-slate-300 sm:col-span-2">
                    Add assets to the active watchlist to keep a tighter market view here.
                  </div>
                )}
              </div>
            </Panel>

            <Panel className="p-3 sm:p-3.5">
              <SectionHeader
                title="Execution Queue"
                action={<Link href="/trade-tickets" className="text-[0.78rem] font-medium text-slate-400 transition hover:text-white">Open execution</Link>}
              />
              <div className="mt-3 grid gap-[5px]">
                {recentTickets.length > 0 ? (
                  recentTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
                ) : (
                  <div className="signal-surface-soft rounded-[0.4rem] p-3 text-[0.84rem] text-slate-300">
                    No execution plans are currently saved.
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>

        <div className="panel-stack-5 xl:sticky xl:top-[5.85rem] xl:self-start">
          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Current Focus" />
            <div className="mt-3">
              <p className="micro-label">Best Next Idea</p>
              <h2 className="mt-1.5 text-[1.08rem] font-semibold text-white">
                {primaryOpportunity ? `${primaryOpportunity.symbol} / ${primaryOpportunity.side}` : "Awaiting next opportunity"}
              </h2>
              <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">
                {primaryOpportunity
                  ? primaryOpportunity.summary
                  : "When the intelligence layer ranks a new idea highly enough, it will appear here."}
              </p>
            </div>

            <div className="mt-3 grid gap-[5px]">
              <MetricTile
                label="Ready Setups"
                value={String(marketSnapshot.tradeableSetups)}
                detail="Ideas currently aligned with the desk rules"
                tone="text-emerald-300"
              />
              <MetricTile
                label="Watch Setups"
                value={String(marketSnapshot.blockedSetups)}
                detail="Ideas still waiting for confirmation"
              />
            </div>
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <SectionHeader
              title="News And Drivers"
              action={<Link href="/backtesting-lab" className="text-[0.78rem] font-medium text-slate-400 transition hover:text-white">Open research</Link>}
            />
            <div className="mt-3 grid gap-[5px]">
              {topEvents.map((event) => (
                <MarketEventCard key={event.id} event={event} />
              ))}
            </div>
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Confirmation Memory" />
            <div className="mt-3 grid gap-[5px]">
              {topConfirmations.map((check) => (
                <ConfirmationCard key={check.id} check={check} />
              ))}
            </div>
            {researchFocus ? (
              <div className="mt-3 signal-surface-soft rounded-[0.4rem] p-3">
                <p className="text-[0.9rem] font-semibold text-white">{researchFocus.strategy}</p>
                <p className="mt-1 text-[0.76rem] text-slate-400">{researchFocus.asset} · {researchFocus.timeframe}</p>
                <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
                  <MetricTile label="Return" value={formatPercent(researchFocus.totalReturn)} detail={`Win rate ${formatPercent(researchFocus.winRate)}`} tone="text-emerald-300" />
                  <MetricTile label="Drawdown" value={formatPercent(researchFocus.maxDrawdown)} detail={`PF ${researchFocus.profitFactor.toFixed(2)}`} tone="text-red-300" />
                </div>
              </div>
            ) : null}
            {recentMemories.map((entry) => (
              <div key={entry.id} className="mt-3">
                <MemoryCard entry={entry} />
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
