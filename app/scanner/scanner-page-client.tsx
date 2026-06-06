"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AssetLiveChartPanel } from "@/app/_components/asset-live-chart-panel";
import { useDisplayCurrency } from "@/app/_components/display-currency-provider";
import { buildBotOpportunityView } from "@/app/_lib/bot-engine";
import { formatDateTimeLabel, formatWinRate } from "@/app/_lib/format";
import { getMarketSession } from "@/app/_lib/market-hours";
import type {
  PersistedAssetRecord,
  PersistedBacktestRecord,
  PersistedConfirmationCheck,
  PersistedMarketEvent,
  PersistedPredictionHistoryRecord,
  PersistedScannerResult,
} from "@/app/_lib/server/workspace-types";
import { ActionLink, PageHeader, Panel, StatusChip } from "../_components/ui";

type MarketTab =
  | "All"
  | "Crypto"
  | "Forex"
  | "Equities"
  | "ETFs"
  | "Commodities"
  | "Indices";

function resolveMarketTab(asset: PersistedAssetRecord | null): MarketTab {
  if (!asset) {
    return "Equities";
  }

  if (asset.assetClass === "Crypto") {
    return "Crypto";
  }

  if (asset.assetClass === "Forex") {
    return "Forex";
  }

  if (asset.assetClass === "ETF") {
    return "ETFs";
  }

  if (asset.assetClass === "Commodity") {
    return "Commodities";
  }

  if (asset.assetClass === "Index") {
    return "Indices";
  }

  return "Equities";
}

function formatRowPrice(
  asset: PersistedAssetRecord | null,
  formatPrice: (value: number, assetClass?: PersistedAssetRecord["assetClass"]) => string,
) {
  if (!asset) {
    return "N/A";
  }

  return formatPrice(asset.price, asset.assetClass);
}

function formatRangeLabel(
  range: string,
  formatPrice: (value: number, assetClass?: PersistedAssetRecord["assetClass"]) => string,
  assetClass?: PersistedAssetRecord["assetClass"],
) {
  const [lowRaw, highRaw] = range.split(" - ").map(Number);

  if (!Number.isFinite(lowRaw) || !Number.isFinite(highRaw)) {
    return range;
  }

  return `${formatPrice(lowRaw, assetClass)} - ${formatPrice(highRaw, assetClass)}`;
}

function formatMarketSessionLabel(state: ReturnType<typeof getMarketSession>["state"]) {
  if (state === "Open") {
    return "MARKET OPEN";
  }

  if (state === "Closed") {
    return "MARKET CLOSED";
  }

  return state;
}

function FullScreenModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(3,6,12,0.86)] p-2.5 backdrop-blur-sm sm:p-4">
      <div className="flex h-full flex-col overflow-hidden rounded-[0.7rem] border border-white/10 bg-[#07111d] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
          <div>
            <p className="micro-label">Fullscreen Review</p>
            <h2 className="mt-1 text-[1rem] font-semibold text-white sm:text-[1.12rem]">
              {title}
            </h2>
            <p className="mt-1 text-[0.78rem] text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="signal-surface-soft rounded-[0.4rem] px-3 py-1.5 text-[0.76rem] font-semibold text-white"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}

function LeaderboardRow({
  asset,
  rank,
  setup,
  view,
  onOpenAnalysis,
  onOpenEvents,
}: {
  asset: PersistedAssetRecord | null;
  rank: number;
  setup: PersistedScannerResult;
  view: ReturnType<typeof buildBotOpportunityView>;
  onOpenAnalysis: (setupId: string) => void;
  onOpenEvents: (setupId: string) => void;
}) {
  const { formatPrice } = useDisplayCurrency();
  const betterEntryLabel = formatRangeLabel(view.discountedEntry, formatPrice, asset?.assetClass);
  const marketSession = getMarketSession(asset);
  return (
    <div className="grid gap-[5px] border-b border-white/6 px-3 py-2.5 last:border-b-0 lg:grid-cols-[3.3rem_minmax(0,1.32fr)_0.78fr_0.74fr_0.78fr_0.95fr_0.82fr_1.02fr_1.08fr_10rem] lg:items-center">
      <div className="text-[0.8rem] font-semibold text-slate-500">#{rank}</div>

      <div className="min-w-0">
        <p className="text-[0.9rem] font-semibold text-white">
          {view.symbol} <span className="text-slate-400">/ {view.instrumentName}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[0.75rem] text-slate-400">
            {view.timeframe} / {view.horizon} / {setup.strategy}
          </span>
          <StatusChip label={formatMarketSessionLabel(marketSession.state)} />
        </div>
        <p className="mt-0.5 text-[0.72rem] text-slate-500">
          {marketSession.venue} / {marketSession.detail}
        </p>
      </div>

      <div className="min-w-0">
        <p className="micro-label">Price</p>
        <p className="mt-1 text-[0.82rem] font-semibold text-white">{formatRowPrice(asset, formatPrice)}</p>
      </div>

      <div className="min-w-0">
        <p className="micro-label">Trend</p>
        <p className="mt-1 text-[0.82rem] font-semibold text-white">{view.direction}</p>
      </div>

      <div className="min-w-0">
        <p className="micro-label">Bias</p>
        <p className="mt-1 text-[0.82rem] font-semibold text-white">{view.opportunityAction}</p>
      </div>

      <div className="min-w-0">
        <p className="micro-label">Action now</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusChip label={view.decision.label} />
          <span className="text-[0.75rem] text-slate-400">{view.confidence}%</span>
        </div>
      </div>

      <div className="min-w-0" title={view.tradeSpanDetail}>
        <p className="micro-label">Trade span</p>
        <p className="mt-1 text-[0.82rem] font-semibold text-cyan-200">{view.tradeSpan}</p>
      </div>

      <div className="min-w-0">
        <p className="micro-label">Better entry</p>
        <p className="mt-1 text-[0.82rem] font-semibold text-white">{betterEntryLabel}</p>
        <p className="mt-0.5 text-[0.72rem] leading-4 text-slate-400">
          {view.direction === "Bearish" ? "Preferred premium short" : "Preferred discounted long"}
        </p>
      </div>

      <div className="min-w-0">
        <p className="micro-label">Why wait or go</p>
        <p className={`mt-1 text-[0.76rem] leading-4 ${view.decision.tone}`}>{view.timingWindow}</p>
      </div>

      <div className="flex flex-wrap gap-[5px] lg:justify-end">
        <button
          type="button"
          onClick={() => onOpenAnalysis(setup.id)}
          className="signal-button rounded-[0.4rem] px-2.5 py-1.75 text-[0.74rem] font-semibold"
        >
          Analysis
        </button>
        <button
          type="button"
          onClick={() => onOpenEvents(setup.id)}
          className="signal-surface-soft rounded-[0.4rem] px-2.5 py-1.75 text-[0.74rem] font-semibold text-white"
        >
          Events
        </button>
      </div>
    </div>
  );
}

export default function ScannerPageClient({
  assets,
  backtests,
  chartVendor,
  chartingLibraryAvailable,
  confirmationChecks,
  marketEvents,
  initialScannerResults,
  predictionHistory,
}: {
  assets: PersistedAssetRecord[];
  backtests: PersistedBacktestRecord[];
  chartVendor: "embed" | "charting_library";
  chartingLibraryAvailable: boolean;
  confirmationChecks: PersistedConfirmationCheck[];
  marketEvents: PersistedMarketEvent[];
  initialScannerResults: PersistedScannerResult[];
  predictionHistory: PersistedPredictionHistoryRecord[];
}) {
  const { formatPrice } = useDisplayCurrency();
  const [analysisSetupId, setAnalysisSetupId] = useState<string | null>(null);
  const [eventsSetupId, setEventsSetupId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MarketTab>("All");

  useEffect(() => {
    if (!analysisSetupId && !eventsSetupId) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAnalysisSetupId(null);
        setEventsSetupId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [analysisSetupId, eventsSetupId]);

  const assetsBySymbol = useMemo(
    () => new Map(assets.map((asset) => [asset.symbol, asset])),
    [assets],
  );

  const rankedViews = useMemo(
    () =>
      [...initialScannerResults]
        .map((setup) => ({
          setup,
          asset: assetsBySymbol.get(setup.symbol) ?? null,
          view: buildBotOpportunityView(
            setup,
            assetsBySymbol.get(setup.symbol) ?? null,
            confirmationChecks,
            marketEvents,
            backtests,
            predictionHistory,
          ),
        }))
        .sort((left, right) => right.view.rankScore - left.view.rankScore)
        .slice(0, 50),
    [assetsBySymbol, backtests, confirmationChecks, initialScannerResults, marketEvents, predictionHistory],
  );

  const tabbedRows = useMemo(() => {
    const buckets: Record<MarketTab, typeof rankedViews> = {
      All: [...rankedViews],
      Crypto: [],
      Forex: [],
      Equities: [],
      ETFs: [],
      Commodities: [],
      Indices: [],
    };

    for (const item of rankedViews) {
      buckets[resolveMarketTab(item.asset)].push(item);
    }

    return buckets;
  }, [rankedViews]);

  const visibleRows = tabbedRows[activeTab].slice(0, 50);

  const selectedAnalysisItem =
    rankedViews.find((item) => item.setup.id === analysisSetupId) ?? null;
  const selectedEventsItem =
    rankedViews.find((item) => item.setup.id === eventsSetupId) ?? null;

  const selectedAnalysisAsset = selectedAnalysisItem
    ? assetsBySymbol.get(selectedAnalysisItem.setup.symbol) ?? null
    : null;
  const selectedEventChecks = selectedEventsItem
    ? confirmationChecks.filter((check) => check.symbol === selectedEventsItem.setup.symbol)
    : [];
  const selectedEventBacktests = selectedEventsItem
    ? backtests.filter((backtest) => backtest.linkedAssetSymbol === selectedEventsItem.setup.symbol)
    : [];
  const selectedEventRows = selectedEventsItem
    ? marketEvents.filter(
        (event) =>
          event.relatedSymbols.includes(selectedEventsItem.setup.symbol) || event.scope === "Macro",
      )
    : [];
  const selectedEventsAsset = selectedEventsItem
    ? assetsBySymbol.get(selectedEventsItem.setup.symbol) ?? null
    : null;
  const selectedEventBetterFill = selectedEventsItem
    ? formatRangeLabel(
        selectedEventsItem.view.discountedEntry,
        formatPrice,
        selectedEventsAsset?.assetClass,
      )
    : null;

  const readyNowCount = visibleRows.filter(
    (item) => item.view.decision.label === "ENTER NOW" && item.view.readiness >= 75,
  ).length;
  const shortTermCount = visibleRows.filter((item) => item.view.horizon !== "Month").length;

  return (
    <>
      <div className="panel-stack-5">
        <PageHeader
          title="Opportunities"
          description="See the strongest cross-market names, then open analysis or event context without leaving the board."
          action={<ActionLink href="/assets">Open Charts</ActionLink>}
        />

        <Panel className="p-3 sm:p-3.5">
          <div className="grid gap-[5px] sm:grid-cols-3">
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="micro-label">{activeTab}</p>
              <p className="mt-1.5 text-[0.96rem] font-semibold text-white">{visibleRows.length}</p>
              <p className="mt-1 text-[0.76rem] text-slate-400">Ranked in the active market tab</p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="micro-label">Short-term focus</p>
              <p className="mt-1.5 text-[0.96rem] font-semibold text-cyan-200">{shortTermCount}</p>
              <p className="mt-1 text-[0.76rem] text-slate-400">Day and week opportunities</p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="micro-label">Ready now</p>
              <p className="mt-1.5 text-[0.96rem] font-semibold text-emerald-300">{readyNowCount}</p>
              <p className="mt-1 text-[0.76rem] text-slate-400">Best discounted entries live now</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-[5px]">
            {(["All", "Crypto", "Forex", "Equities", "ETFs", "Commodities", "Indices"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-[0.4rem] px-3 py-1.75 text-[0.76rem] font-semibold transition ${
                  activeTab === tab
                    ? "signal-button"
                    : "signal-surface-soft text-white"
                }`}
              >
                {tab} <span className="text-slate-400">({tabbedRows[tab].length})</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="overflow-hidden p-0">
          <div className="grid gap-[5px] border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[0.69rem] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid-cols-[3.3rem_minmax(0,1.32fr)_0.78fr_0.74fr_0.78fr_0.95fr_0.82fr_1.02fr_1.08fr_10rem]">
            <span>Rank</span>
            <span>Instrument</span>
            <span>Price</span>
            <span>Trend</span>
            <span>Bias</span>
            <span>Action</span>
            <span>Trade span</span>
            <span>Entry</span>
            <span>Timing</span>
            <span className="lg:text-right">Review</span>
          </div>

          <div>
            {visibleRows.map(({ asset, setup, view }, index) => (
              <LeaderboardRow
                key={setup.id}
                asset={asset}
                rank={index + 1}
                setup={setup}
                view={view}
                onOpenAnalysis={setAnalysisSetupId}
                onOpenEvents={setEventsSetupId}
              />
            ))}
          </div>
        </Panel>
      </div>

      {selectedAnalysisItem ? (
        <FullScreenModal
          title={`${selectedAnalysisItem.setup.symbol} / ${selectedAnalysisAsset?.name ?? selectedAnalysisItem.view.instrumentName}`}
          subtitle="Live chart, indicators, structure, and re-analysis in one fullscreen workspace."
          onClose={() => setAnalysisSetupId(null)}
        >
          <AssetLiveChartPanel
            assetClass={selectedAnalysisAsset?.assetClass}
            analysisOverlay={selectedAnalysisItem.setup.analysis}
            chartVendor={chartVendor}
            chartingLibraryAvailable={chartingLibraryAvailable}
            name={selectedAnalysisAsset?.name ?? selectedAnalysisItem.view.instrumentName}
            price={selectedAnalysisAsset?.price ?? 0}
            selectedOpportunityId={selectedAnalysisItem.setup.id}
            selectedOpportunityLabel={`${selectedAnalysisItem.setup.symbol} / ${selectedAnalysisItem.setup.strategy}`}
            symbol={selectedAnalysisItem.setup.symbol}
          />
        </FullScreenModal>
      ) : null}

      {selectedEventsItem ? (
        <FullScreenModal
          title={`${selectedEventsItem.setup.symbol} / event intelligence`}
          subtitle="Short-term drivers, confirmation memory, and why Siggi is leaning enter now or wait."
          onClose={() => setEventsSetupId(null)}
        >
          <div className="panel-stack-5">
            <Panel className="p-3 sm:p-3.5">
              <div className="grid gap-[5px] lg:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(0,0.48fr))]">
                <div className="signal-surface rounded-[0.46rem] p-3">
                  <p className="micro-label">Siggi call</p>
                  <p className="mt-1.5 text-[1.02rem] font-semibold text-white">
                    {selectedEventsItem.view.decision.label} / {selectedEventsItem.view.opportunityAction}
                  </p>
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">
                    {selectedEventsItem.view.priorityReason}
                  </p>
                  <p className="mt-2 text-[0.76rem] leading-5 text-slate-400">
                    {selectedEventsItem.view.eventEntryGuidance}
                  </p>
                </div>
                <div className="signal-surface-soft rounded-[0.4rem] p-3">
                  <p className="micro-label">Confidence</p>
                  <p className="mt-1.5 text-[0.98rem] font-semibold text-white">
                    {selectedEventsItem.view.confidence}%
                  </p>
                  <p className="mt-1 text-[0.76rem] text-slate-400">Current prediction quality</p>
                </div>
                  <div className="signal-surface-soft rounded-[0.4rem] p-3">
                    <p className="micro-label">Better fill</p>
                    <p className="mt-1.5 text-[0.98rem] font-semibold text-cyan-200">
                      {selectedEventBetterFill}
                    </p>
                    <p className="mt-1 text-[0.76rem] text-slate-400">Preferred pocket</p>
                  </div>
                <div className="signal-surface-soft rounded-[0.4rem] p-3">
                  <p className="micro-label">Event move</p>
                  <p className="mt-1.5 text-[0.98rem] font-semibold text-emerald-300">
                    {selectedEventsItem.view.eventMove}
                  </p>
                  <p className="mt-1 text-[0.76rem] text-slate-400">
                    {selectedEventsItem.view.eventLikelihood}% likelihood
                  </p>
                </div>
                <div className="signal-surface-soft rounded-[0.4rem] p-3">
                  <p className="micro-label">Replay edge</p>
                  <p className="mt-1.5 text-[0.98rem] font-semibold text-emerald-300">
                    {selectedEventBacktests[0]
                      ? formatWinRate(selectedEventBacktests[0].winRate)
                      : "N/A"}
                  </p>
                  <p className="mt-1 text-[0.76rem] text-slate-400">Lead win-rate memory</p>
                </div>
              </div>
            </Panel>

            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Why Siggi is leaning this way</p>
              <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
                {selectedEventsItem.view.scoreBreakdown.map((item) => (
                  <div key={item.label} className="signal-surface-soft rounded-[0.4rem] p-3">
                    <p className="micro-label">{item.label}</p>
                    <p className="mt-1.5 text-[0.96rem] font-semibold text-white">{item.score}%</p>
                    <p className="mt-1 text-[0.76rem] leading-5 text-slate-400">{item.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Scheduled drivers and likely effect</p>
              <div className="mt-3 grid gap-[5px] xl:grid-cols-2">
                {selectedEventRows.map((event) => (
                  <div key={event.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.92rem] font-semibold text-white">{event.title}</p>
                        <p className="mt-1 text-[0.76rem] text-slate-400">
                          {event.status} / {event.scope} / {event.sourceLabel} / {formatDateTimeLabel(event.startsAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusChip label={event.impact.toUpperCase()} />
                        <StatusChip label={event.bias.toUpperCase()} />
                      </div>
                    </div>
                    <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">
                      {event.summary}
                    </p>
                    <p className="mt-2 text-[0.76rem] leading-5 text-slate-400">
                      {event.bias === "Bullish"
                        ? `Likely to help ${selectedEventsItem.setup.symbol} rise if price structure is already constructive.`
                        : event.bias === "Bearish"
                          ? `Likely to pressure ${selectedEventsItem.setup.symbol} lower unless the market absorbs the headline quickly.`
                          : "Raises uncertainty, so confirmation matters more than speed."}
                    </p>
                    <p className="mt-2 text-[0.76rem] leading-5 text-slate-400">
                      {event.status === "Upcoming" && event.impact === "High"
                        ? "Timing note: this is close enough to move price before and after the release, so Siggi should usually wait for the first reaction rather than front-run it."
                        : event.status === "Live" && event.impact === "High"
                          ? "Timing note: the move may already be underway, so Siggi wants proof that the first impulse is holding before treating it as a clean entry."
                          : "Timing note: this can be factored in early, but it should not override price structure on its own."}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Confirmation memory</p>
              <div className="mt-3 grid gap-[5px] xl:grid-cols-2">
                {selectedEventChecks.map((check) => (
                  <div key={check.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.92rem] font-semibold text-white">{check.symbol}</p>
                        <p className="mt-1 text-[0.76rem] text-slate-400">{check.stance} setup</p>
                      </div>
                      <StatusChip label={check.overallStatus.toUpperCase()} />
                    </div>
                    <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{check.summary}</p>
                    <div className="mt-3 grid gap-[5px]">
                      {check.checks.map((item) => (
                        <div key={`${check.id}-${item.label}`} className="rounded-[0.4rem] border border-white/8 bg-white/[0.02] p-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[0.78rem] font-semibold text-white">{item.label}</p>
                            <StatusChip label={item.status.toUpperCase()} />
                          </div>
                          <p className="mt-1 text-[0.74rem] leading-5 text-slate-400">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </FullScreenModal>
      ) : null}
    </>
  );
}
