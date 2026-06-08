import { existsSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { formatInstrumentPriceForDisplay } from "@/app/_lib/currency";
import { buildBotOpportunityView } from "@/app/_lib/bot-engine";
import { getMarketSession } from "@/app/_lib/market-hours";
import { getDisplayCurrencyState } from "@/app/_lib/server/currency-preference";
import { getAssetBySymbol } from "@/app/_lib/server/repositories/assets";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listConfirmationChecks } from "@/app/_lib/server/repositories/confirmation-checks";
import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { buildFallbackChart } from "@/app/_lib/server/market-data/fallback-chart";
import { fetchLiveCandlesForSymbol } from "@/app/_lib/server/market-data/market-data";
import { strategies } from "../../_data/mock-data";
import {
  formatDateTimeLabel,
  formatPercent,
  formatWinRate,
} from "../../_lib/format";
import { AssetLiveChartPanel } from "../../_components/asset-live-chart-panel";
import { ActionLink, KeyValue, Panel, PageHeader, StatusChip } from "../../_components/ui";

function formatMarketSessionLabel(state: ReturnType<typeof getMarketSession>["state"]) {
  if (state === "Open") {
    return "MARKET OPEN";
  }

  if (state === "Closed") {
    return "MARKET CLOSED";
  }

  return state;
}

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams?: Promise<{ setup?: string }>;
}) {
  const { symbol } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const asset = await getAssetBySymbol(symbol);

  if (!asset) {
    notFound();
  }

  const [scannerResults, backtests, confirmationChecks, marketEvents, predictionHistory, displayCurrencyState] = await Promise.all([
    listScannerResults(),
    listBacktests(),
    listConfirmationChecks(),
    listMarketEvents(),
    listPredictionHistory(),
    getDisplayCurrencyState(),
  ]);
  const configuredChartVendor =
    process.env.SIGNALIBRIUM_CHART_VENDOR?.trim().toLowerCase() === "charting_library"
      ? "charting_library"
      : "embed";
  const chartingLibraryAvailable = existsSync(
    path.join(process.cwd(), "public", "charting_library", "charting_library.js"),
  );
  const initialChart = await fetchLiveCandlesForSymbol(asset.symbol, "1h", 64).catch(() =>
    buildFallbackChart(asset.symbol, asset.name, asset.sparkline, asset.lastSyncedAt, "1h"),
  );
  const marketSession = getMarketSession(asset);

  const assetSetups = scannerResults
    .filter((result) => result.symbol === asset.symbol)
    .sort((left, right) => right.score - left.score);
  const selectedSetup =
    assetSetups.find((setup) => setup.id === resolvedSearchParams?.setup) ?? assetSetups[0] ?? null;
  const relatedBacktests = backtests.filter((backtest) => backtest.linkedAssetSymbol === asset.symbol);
  const relatedChecks = confirmationChecks.filter((check) => check.symbol === asset.symbol);
  const relatedEvents = marketEvents.filter(
    (event) => event.relatedSymbols.includes(asset.symbol) || event.scope === "Macro",
  );
  const selectedView = selectedSetup
    ? buildBotOpportunityView(
        selectedSetup,
        asset,
        confirmationChecks,
        marketEvents,
        backtests,
        predictionHistory,
      )
    : null;
  const matchedStrategy = strategies.find((strategy) => strategy.name === asset.activeStrategy) ?? null;
  const formatDisplayPrice = (value: number) =>
    formatInstrumentPriceForDisplay(
      value,
      displayCurrencyState.currency,
      displayCurrencyState.rates,
      asset.assetClass,
    );
  const entryZoneLabel =
    selectedSetup?.analysis
      ? `${formatDisplayPrice(selectedSetup.analysis.chartAnnotations.entryZone.low)} - ${formatDisplayPrice(selectedSetup.analysis.chartAnnotations.entryZone.high)}`
      : selectedView?.entry ?? selectedSetup?.entryZone ?? "Awaiting setup";
  const pipDistanceLabel = selectedView?.pipDistanceToEntry ?? "";
  const stopLabel =
    selectedSetup?.analysis
      ? formatDisplayPrice(selectedSetup.analysis.chartAnnotations.stopLevel)
      : selectedView?.stop ?? "Awaiting setup";
  const targetLabel =
    selectedSetup?.analysis
      ? formatDisplayPrice(selectedSetup.analysis.chartAnnotations.targetLevel)
      : selectedView?.target ?? "Awaiting setup";

  return (
    <div className="panel-stack-5">
      <PageHeader
        title={`${asset.symbol} market map`}
        description={`Track ${asset.name} with the live chart, current setup, and replay context in one place.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={formatMarketSessionLabel(marketSession.state)} />
            <ActionLink href="/scanner">Open Leaderboard</ActionLink>
          </div>
        }
      />

      <AssetLiveChartPanel
        assetClass={asset.assetClass}
        analysisOverlay={selectedSetup?.analysis ?? null}
        chartVendor={configuredChartVendor}
        chartingLibraryAvailable={chartingLibraryAvailable}
        initialChart={initialChart}
        name={asset.name}
        price={asset.price}
        selectedOpportunityId={selectedSetup?.id ?? null}
        selectedOpportunityLabel={
          selectedSetup ? `${selectedSetup.symbol} / ${selectedSetup.strategy}` : null
        }
        symbol={asset.symbol}
      />

      <div className="grid gap-[5px] xl:grid-cols-[1.08fr_0.92fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Lead setup</p>
          {selectedSetup && selectedView ? (
            <>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[1rem] font-semibold text-white sm:text-[1.08rem]">
                    {selectedSetup.strategy}
                  </h2>
                  <p className="mt-1 text-[0.82rem] leading-5 text-slate-300">
                    {selectedView.rationale}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusChip label={selectedView.decision.label} />
                  <StatusChip label={selectedSetup.timeframe} />
                  <StatusChip label={selectedView.opportunityAction === "BUY" ? "LONG" : selectedView.opportunityAction === "SELL" ? "SHORT" : selectedView.opportunityAction} />
                  <StatusChip label={formatMarketSessionLabel(marketSession.state)} />
                </div>
              </div>

              <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
                <KeyValue
                  label="Market session"
                  value={marketSession.state}
                  detail={`${marketSession.venue} / ${marketSession.detail}`}
                />
                <KeyValue
                  label="Trend"
                  value={selectedView.direction}
                  detail={`${selectedView.confidence}% confidence`}
                />
                <KeyValue
                  label="Entry zone"
                  value={entryZoneLabel}
                  detail="Original analysis band"
                />
                {pipDistanceLabel ? (
                  <KeyValue
                    label="Distance to entry"
                    value={pipDistanceLabel}
                    detail="Current price vs entry zone"
                  />
                ) : null}
                <KeyValue label="Stop" value={stopLabel} detail="Invalidation level" />
                <KeyValue label="Target" value={targetLabel} detail="First profit objective" />
                <KeyValue
                  label="Action now"
                  value={selectedView.decision.label}
                  detail={selectedView.timingWindow}
                />
                <KeyValue
                  label="Event tone"
                  value={selectedView.eventTone}
                  detail={selectedView.eventSchedule}
                />
                <KeyValue
                  label="Live replay"
                  value={selectedView.similarMemorySummary}
                  detail="Resolved enter-now memory in similar conditions"
                />
                <KeyValue
                  label="Horizon"
                  value={selectedView.horizon}
                  detail={`${selectedSetup.timeframe} structure`}
                />
              </div>
            </>
          ) : (
            <p className="mt-3 text-[0.82rem] text-slate-400">
              This instrument is synced and chartable, but it does not have a ranked setup attached yet.
            </p>
          )}
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Siggi context</p>
          <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <KeyValue
              label="Forecast"
              value={asset.forecast}
              detail="Current short-term scenario"
            />
            <KeyValue
              label="AI read"
              value={asset.aiBias}
              detail="Why this market is being handled this way"
            />
            <KeyValue
              label="Liquidity"
              value={asset.liquidity}
              detail={asset.volatility}
            />
            <KeyValue
              label="ATR"
              value={formatDisplayPrice(asset.atr)}
              detail={`${asset.tradeable ? "Tradeable" : "Watch only"} / ${asset.regime}`}
            />
          </div>

          {matchedStrategy ? (
            <div className="signal-accent-surface mt-3 rounded-[0.46rem] p-3">
              <p className="micro-label">Playbook</p>
              <p className="mt-1.5 text-[0.96rem] font-semibold text-white">{matchedStrategy.name}</p>
              <p className="mt-1 text-[0.82rem] leading-5 text-slate-200">{matchedStrategy.thesis}</p>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="grid gap-[5px] xl:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Event pressure</p>
          <div className="mt-3 panel-stack-5">
            {relatedEvents.slice(0, 4).map((event) => (
              <div key={event.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.9rem] font-semibold text-white">{event.title}</p>
                    <p className="mt-1 text-[0.76rem] text-slate-400">
                      {event.status} / {event.scope} / {event.sourceLabel} / {formatDateTimeLabel(event.startsAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusChip label={event.impact.toUpperCase()} />
                    <StatusChip label={event.bias.toUpperCase()} />
                  </div>
                </div>
                <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{event.summary}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Confirmation and replay memory</p>
          <div className="mt-3 grid gap-[5px] xl:grid-cols-2">
            <div className="panel-stack-5">
              {relatedChecks.slice(0, 2).map((check) => (
                <div key={check.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.9rem] font-semibold text-white">{check.symbol}</p>
                      <p className="mt-1 text-[0.76rem] text-slate-400">{check.stance} setup</p>
                    </div>
                    <StatusChip label={check.overallStatus.toUpperCase()} />
                  </div>
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{check.summary}</p>
                </div>
              ))}
            </div>

            <div className="panel-stack-5">
              {relatedBacktests.slice(0, 2).map((backtest) => (
                <div key={backtest.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <p className="text-[0.9rem] font-semibold text-white">{backtest.strategy}</p>
                  <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
                    <KeyValue label="Win rate" value={formatWinRate(backtest.winRate)} />
                    <KeyValue label="Profit factor" value={backtest.profitFactor.toFixed(2)} />
                    <KeyValue label="Return" value={formatPercent(backtest.totalReturn)} />
                    <KeyValue label="Max DD" value={formatPercent(backtest.maxDrawdown)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
