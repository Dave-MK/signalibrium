import { existsSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { getAssetBySymbol } from "@/app/_lib/server/repositories/assets";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import { listWatchlists } from "@/app/_lib/server/repositories/watchlists";
import { buildFallbackChart } from "@/app/_lib/server/market-data/fallback-chart";
import { fetchLiveCandlesForSymbol } from "@/app/_lib/server/market-data/market-data";
import { strategies } from "../../_data/mock-data";
import {
  formatDateLabel,
  formatCurrency,
  formatPercent,
  formatRiskReward,
} from "../../_lib/format";
import {
  ActionLink,
  KeyValue,
  Panel,
  PageHeader,
  StatusChip,
} from "../../_components/ui";
import { AssetLiveChartPanel } from "../../_components/asset-live-chart-panel";

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
  const configuredChartVendor =
    process.env.SIGNALIBRIUM_CHART_VENDOR?.trim().toLowerCase() === "charting_library"
      ? "charting_library"
      : "embed";
  const chartingLibraryAvailable = existsSync(
    path.join(process.cwd(), "public", "charting_library", "charting_library.js"),
  );
  const initialChart = await fetchLiveCandlesForSymbol(asset.symbol, "1h", 48).catch(
    () => buildFallbackChart(asset.symbol, asset.name, asset.sparkline, asset.lastSyncedAt, "1h"),
  );

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
        eyebrow="Asset Workstation"
        title={`${asset.symbol} market map`}
        description={`${asset.name} currently maps to the ${asset.activeStrategy} playbook. Use this view to follow price, inspect structure, connect live setups, and decide whether the name deserves an execution plan.`}
        action={
          relatedTickets[0] ? (
            <ActionLink href={`/trade-tickets/${relatedTickets[0].id}`}>Open Execution Plan</ActionLink>
          ) : (
            <ActionLink href="/scanner">Open Opportunity Radar</ActionLink>
          )
        }
      />

      <AssetLiveChartPanel
        chartVendor={configuredChartVendor}
        chartingLibraryAvailable={chartingLibraryAvailable}
        symbol={asset.symbol}
        name={asset.name}
        price={asset.price}
        initialChart={initialChart}
      />

      <div className="grid gap-[5px] xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">AI Read</p>
          <div className="mt-3 grid gap-[5px]">
            <KeyValue
              label="Tradeability"
              value={asset.tradeable ? "Ticket ready" : "Watchlist only"}
              detail="Protected sizing is allowed only when regime and liquidity line up."
              tooltip="Whether the asset currently clears the app's regime and liquidity filters for a prepared trade ticket."
            />
            <KeyValue
              label="Forecast"
              value={asset.forecast}
              detail="Scenario framing generated from deterministic structure and regime context."
              tooltip="A plain-language scenario describing what needs to happen next for the current thesis to stay valid."
            />
            <KeyValue
              label="AI Explanation"
              value={asset.aiBias}
              detail="Grounded language, not prediction theatre."
              tooltip="A concise interpretation layer built from the stored asset state rather than a live predictive model."
            />
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Desk Context</p>
          <div className="mt-3 grid gap-[5px] sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <KeyValue
              label="Watchlists"
              value={String(containingWatchlists.length)}
              detail={containingWatchlists[0]?.name ?? "Not currently saved"}
              tooltip="How many of your saved watchlists currently include this asset."
            />
            <KeyValue
              label="Trade Tickets"
              value={String(relatedTickets.length)}
              detail={relatedTickets[0]?.status ?? "No linked ticket yet"}
              tooltip="The count of prepared or simulated execution plans in your desk that reference this asset."
            />
            <KeyValue
              label="Journal Entries"
              value={String(relatedJournalEntries.length)}
              detail={latestJournalEntry ? formatDateLabel(latestJournalEntry.date) : "No saved review yet"}
              tooltip="Saved trade reviews or notes that either mention this asset directly or are linked through one of its tickets."
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
              <p className="text-[0.84rem] font-semibold text-white">Latest review memory</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-200">
                {latestJournalEntry.aiReview}
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Playbook Match</p>
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

      <div className="grid gap-[5px] xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Live Setups</p>
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
                  <KeyValue
                    label="Stop"
                    value={setup.stopLoss}
                    tooltip="The price level where the setup is considered invalid and the trade should be exited."
                  />
                  <KeyValue
                    label="Target"
                    value={setup.takeProfit}
                    tooltip="The first planned take-profit zone for the setup."
                  />
                  <KeyValue
                    label="Risk/Reward"
                    value={formatRiskReward(setup.riskReward)}
                    tooltip="The projected upside divided by the planned downside for the setup."
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Edge Replay Summary</p>
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
                    tooltip="Overall percentage gain or loss across the tested period."
                  />
                  <KeyValue
                    label="Max Drawdown"
                    value={formatPercent(backtest.maxDrawdown)}
                    tooltip="The deepest peak-to-trough decline experienced during the backtest."
                  />
                  <KeyValue
                    label="Win Rate"
                    value={formatPercent(backtest.winRate)}
                    tooltip="The percentage of simulated trades that closed profitable."
                  />
                  <KeyValue
                    label="Profit Factor"
                    value={backtest.profitFactor.toFixed(2)}
                    tooltip="Gross profits divided by gross losses. Higher means the strategy kept more of what it made."
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
