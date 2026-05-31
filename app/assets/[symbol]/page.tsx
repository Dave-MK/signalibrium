import { notFound } from "next/navigation";
import { getAssetBySymbol } from "@/app/_lib/server/repositories/assets";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import { listWatchlists } from "@/app/_lib/server/repositories/watchlists";
import { strategies } from "../../_data/mock-data";
import {
  formatCurrency,
  formatDateLabel,
  formatNumber,
  formatPercent,
  formatRiskReward,
} from "../../_lib/format";
import { Sparkline } from "../../_components/sparkline";
import {
  ActionLink,
  KeyValue,
  PageHeader,
  Panel,
  StatusChip,
} from "../../_components/ui";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const asset = await getAssetBySymbol(symbol);

  if (!asset) {
    notFound();
  }

  const [watchlists, tradeTickets, journalEntries, scannerResults, backtests] =
    await Promise.all([
      listWatchlists(),
      listTradeTickets(),
      listJournalEntries(),
      listScannerResults(),
      listBacktests(),
    ]);

  const assetSetups = scannerResults.filter((result) => result.symbol === asset.symbol);
  const matchedStrategy = strategies.find(
    (strategy) => strategy.name === asset.activeStrategy,
  );
  const relatedBacktests = backtests.filter((backtest) => backtest.asset === asset.symbol);
  const relatedTickets = tradeTickets.filter((ticket) => ticket.symbol === asset.symbol);
  const relatedTicketIds = new Set(relatedTickets.map((ticket) => ticket.id));
  const relatedJournalEntries = journalEntries.filter(
    (entry) => entry.asset === asset.symbol || (entry.ticketId ? relatedTicketIds.has(entry.ticketId) : false),
  );
  const containingWatchlists = watchlists.filter((watchlist) =>
    watchlist.itemSymbols.includes(asset.symbol),
  );
  const latestJournalEntry = [...relatedJournalEntries].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  )[0];

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Asset Detail"
        title={`${asset.symbol} intelligence view`}
        description={`${asset.name} currently maps to the ${asset.activeStrategy} playbook. This page combines chart context, active setups, backtest confidence, regime assessment, risk profile, and AI explanation.`}
        action={
          relatedTickets[0] ? (
            <ActionLink href={`/trade-tickets/${relatedTickets[0].id}`}>Open Linked Ticket</ActionLink>
          ) : (
            <ActionLink href="/scanner">Prepare From Scanner</ActionLink>
          )
        }
      />

      <div className="grid gap-[5px] xl:grid-cols-[1.25fr_0.8fr]">
        <Panel className="p-3 sm:p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="micro-label">Price Structure</p>
              <h2 className="mt-1.5 text-[1.55rem] font-semibold text-white">
                {formatCurrency(asset.price)}
              </h2>
              <p
                className={`mt-1.5 text-[0.82rem] ${
                  asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {formatPercent(asset.change24h, true)} over the latest session
              </p>
            </div>
            <StatusChip label={asset.regime.toUpperCase()} />
          </div>

          <div className="signal-surface mt-4 rounded-[0.46rem] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip label="SMA 50" />
              <StatusChip label="SMA 200" />
              <StatusChip label="RSI" />
              <StatusChip label="ATR" />
            </div>
            <Sparkline data={asset.sparkline} className="mt-4 h-36 w-full sm:h-44" />
            <div className="mt-4 grid gap-[5px] sm:grid-cols-3">
              <KeyValue label="ATR" value={formatNumber(asset.atr)} />
              <KeyValue label="Liquidity" value={asset.liquidity} />
              <KeyValue label="Volatility" value={asset.volatility} />
            </div>
          </div>
        </Panel>

        <div className="panel-stack-5">
          <Panel className="p-3 sm:p-3.5">
            <p className="micro-label">Risk Profile</p>
            <div className="mt-3 grid gap-[5px]">
              <KeyValue
                label="Tradeability"
                value={asset.tradeable ? "Ticket ready" : "Watchlist only"}
                detail="Protected sizing is allowed only when regime and liquidity line up."
              />
              <KeyValue
                label="Forecast"
                value={asset.forecast}
                detail="Scenario framing generated from deterministic structure and regime context."
              />
              <KeyValue
                label="AI Explanation"
                value={asset.aiBias}
                detail="Grounded language, not prediction theatre."
              />
            </div>
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <p className="micro-label">Workspace Context</p>
            <div className="mt-3 grid gap-[5px] sm:grid-cols-3">
              <KeyValue
                label="Watchlists"
                value={String(containingWatchlists.length)}
                detail={containingWatchlists[0]?.name ?? "Not currently saved"}
              />
              <KeyValue
                label="Trade Tickets"
                value={String(relatedTickets.length)}
                detail={relatedTickets[0]?.status ?? "No linked ticket yet"}
              />
              <KeyValue
                label="Journal Entries"
                value={String(relatedJournalEntries.length)}
                detail={latestJournalEntry ? formatDateLabel(latestJournalEntry.date) : "No saved review yet"}
              />
            </div>

            {relatedTickets.length > 0 ? (
              <div className="mt-3 panel-stack-5">
                {relatedTickets.slice(0, 2).map((ticket) => (
                  <div
                    key={ticket.id}
                    className="signal-surface-soft rounded-[0.4rem] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.88rem] font-semibold text-white">{ticket.strategy}</p>
                        <p className="mt-0.5 text-[0.78rem] text-slate-400">
                          Entry {formatCurrency(ticket.entry)} / Target {formatCurrency(ticket.takeProfit)}
                        </p>
                      </div>
                      <StatusChip label={ticket.status.toUpperCase()} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {latestJournalEntry ? (
              <div className="signal-accent-surface mt-3 rounded-[0.4rem] p-3">
                <p className="text-[0.84rem] font-semibold text-white">Latest journal read</p>
                <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-200">
                  {latestJournalEntry.aiReview}
                </p>
              </div>
            ) : null}
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <p className="micro-label">Strategy Match</p>
            <h2 className="mt-2.5 text-[1rem] font-semibold text-white sm:text-[1.1rem]">
              {matchedStrategy?.name}
            </h2>
            <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">
              {matchedStrategy?.thesis}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {matchedStrategy?.bestRegimes.map((regime) => (
                <StatusChip key={regime} label={regime.toUpperCase()} />
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-[5px] xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Active Setups</p>
          <div className="mt-3 panel-stack-5">
            {assetSetups.map((setup) => (
              <div
                key={setup.id}
                className="signal-surface-soft rounded-[0.4rem] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.92rem] font-semibold text-white">{setup.strategy}</p>
                    <p className="text-[0.82rem] text-slate-400">{setup.timeframe}</p>
                  </div>
                  <StatusChip label={setup.tradeability} />
                </div>
                <div className="mt-3 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
                  <KeyValue label="Entry" value={setup.entryZone} />
                  <KeyValue label="Stop" value={setup.stopLoss} />
                  <KeyValue label="Target" value={setup.takeProfit} />
                  <KeyValue
                    label="Risk/Reward"
                    value={formatRiskReward(setup.riskReward)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Backtest Summary</p>
          <div className="mt-3 panel-stack-5">
            {relatedBacktests.map((backtest) => (
              <div
                key={backtest.id}
                className="signal-surface-soft rounded-[0.4rem] p-3"
              >
                <p className="text-[0.92rem] font-semibold text-white">{backtest.strategy}</p>
                <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
                  <KeyValue
                    label="Total Return"
                    value={formatPercent(backtest.totalReturn)}
                  />
                  <KeyValue
                    label="Max Drawdown"
                    value={formatPercent(backtest.maxDrawdown)}
                  />
                  <KeyValue
                    label="Win Rate"
                    value={formatPercent(backtest.winRate)}
                  />
                  <KeyValue
                    label="Profit Factor"
                    value={backtest.profitFactor.toFixed(2)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
