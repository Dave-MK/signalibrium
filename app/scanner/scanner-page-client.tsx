"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AssetLiveChartPanel } from "@/app/_components/asset-live-chart-panel";
import { useDisplayCurrency } from "@/app/_components/display-currency-provider";
import { buildBotOpportunityView } from "@/app/_lib/bot-engine";
import { formatDateTimeLabel, formatPercent, formatWinRate } from "@/app/_lib/format";
import { formatPipDistance } from "@/app/_lib/market-prices";
import {
  getInstrumentPlatforms,
  getInstrumentUniverseEntry,
  PLATFORM_META,
  type PlatformKey,
} from "@/app/_lib/instrument-universe";
import { getMarketSession, getNextSessionOpenLabel } from "@/app/_lib/market-hours";
import { analyzeAllStale } from "@/app/_lib/workspace-api";
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
      <div className="flex h-full flex-col overflow-hidden rounded-[0.7rem] border border-white/10 bg-[#111210] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
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

/**
 * Computes the pip/point distance from the live asset price to the nearest
 * edge of the entry zone, using raw numeric entry zone values from the view.
 * Using numbers directly avoids any string-parsing ambiguity.
 */
function livePipDistance(
  asset: PersistedAssetRecord | null,
  entryZoneLow: number,
  entryZoneHigh: number,
): string {
  if (!asset || !(asset.price > 0)) return "";
  if (!Number.isFinite(entryZoneLow) || !Number.isFinite(entryZoneHigh) || entryZoneLow <= 0) return "";
  return formatPipDistance(asset.price, entryZoneLow, entryZoneHigh, asset.assetClass);
}

function PlatformLogos({ platforms }: { platforms: PlatformKey[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {platforms.map((key) => {
        const meta = PLATFORM_META[key];
        return (
          <a
            key={key}
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            title={meta.name}
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-white/[0.08] ring-1 ring-white/10 transition hover:ring-white/30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?domain=${meta.domain}&sz=32`}
              alt={meta.name}
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
            />
          </a>
        );
      })}
    </div>
  );
}

function LeaderboardRow({
  asset,
  rank,
  setup,
  view,
  siggiOpenSymbols,
  onOpenAnalysis,
  onOpenEvents,
}: {
  asset: PersistedAssetRecord | null;
  rank: number;
  setup: PersistedScannerResult;
  view: ReturnType<typeof buildBotOpportunityView>;
  siggiOpenSymbols: Set<string>;
  onOpenAnalysis: (setupId: string) => void;
  onOpenEvents: (setupId: string) => void;
}) {
  const { formatPrice } = useDisplayCurrency();
  const marketSession = getMarketSession(asset);
  const isClosed = marketSession.state === "Closed" || marketSession.state === "Weekend";
  const nextOpenLabel = asset && isClosed ? getNextSessionOpenLabel(asset) : null;
  const siggiInTrade = siggiOpenSymbols.has(view.symbol);
  const universeEntry = getInstrumentUniverseEntry(view.symbol);
  const platforms = universeEntry ? getInstrumentPlatforms(universeEntry) : [];

  return (
    <div className={`border-b border-white/[0.05] last:border-b-0${isClosed ? " opacity-50 grayscale-[40%]" : " scanner-row-live"}`}>

      {/* ── Mobile compact card ── */}
      <div className="px-3 py-2.5 lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[0.66rem] font-semibold tabular-nums text-slate-600">#{rank}</span>
              <p className="truncate text-[0.90rem] font-semibold text-white">{view.symbol}</p>
              <p className={`text-[0.80rem] font-bold ${view.signal === "BUY NOW" ? "text-emerald-400" : view.signal === "SELL NOW" ? "text-rose-400" : "text-amber-300"}`}>
                {view.signal}
              </p>
            </div>
            <p className="mt-0.5 truncate text-[0.72rem] text-slate-400">{view.instrumentName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <StatusChip label={formatMarketSessionLabel(marketSession.state)} />
              <span className="rounded-[0.22rem] bg-white/[0.06] px-1.5 py-0.5 text-[0.62rem] font-medium uppercase tracking-wide text-slate-400">{view.timeframe}</span>
              {siggiInTrade && (
                <span className="rounded-[0.22rem] bg-[#00C884]/15 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-[#00C884] ring-1 ring-[#00C884]/30">🤖 Siggi</span>
              )}
              {setup.analysis?.aiVerdict && (
                <span className={`rounded-[0.22rem] px-1.5 py-0.5 text-[0.62rem] font-semibold ring-1 ${
                  setup.analysis.aiVerdict === "Strong" ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" :
                  setup.analysis.aiVerdict === "Good" ? "bg-[#00C884]/15 text-[#00C884] ring-[#00C884]/30" :
                  setup.analysis.aiVerdict === "Marginal" ? "bg-amber-400/10 text-amber-300 ring-amber-400/20" :
                  "bg-rose-500/15 text-rose-400 ring-rose-500/30"
                }`}>
                  {setup.analysis.aiVerdict}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[0.96rem] font-bold tabular-nums text-[#00C884]/80">{view.confidence}%</p>
            <p className="text-[0.62rem] text-slate-500">confidence</p>
            <p className="mt-1 text-[0.78rem] font-semibold text-white">{view.exactEntry}</p>
            <p className="text-[0.62rem] text-slate-500">enter at</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onOpenAnalysis(setup.id)} className="signal-button rounded-[0.4rem] px-2.5 py-1.5 text-[0.73rem] font-semibold">Analysis</button>
          <button type="button" onClick={() => onOpenEvents(setup.id)} className="signal-surface-soft rounded-[0.4rem] px-2.5 py-1.5 text-[0.73rem] font-semibold text-white">Events</button>
        </div>
      </div>

      {/* ── Desktop full row ── */}
      <div className={`hidden gap-x-3 px-3 py-3 lg:grid lg:grid-cols-[2.6rem_minmax(0,1.18fr)_minmax(0,1.0fr)_0.78fr_0.76fr_0.9fr_0.68fr_1.0fr_9rem] lg:items-start`}>
      {/* Rank */}
      <div className="flex h-full items-center">
        <span className="text-[0.78rem] font-semibold tabular-nums text-slate-600">#{rank}</span>
      </div>

      {/* Instrument */}
      <div className="min-w-0">
        <p className="truncate text-[0.9rem] font-semibold leading-tight text-white">
          {view.symbol}
        </p>
        <p className="mt-0.5 truncate text-[0.75rem] text-slate-400">{view.instrumentName}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StatusChip label={formatMarketSessionLabel(marketSession.state)} />
          <span className="rounded-[0.25rem] bg-white/[0.06] px-1.5 py-0.5 text-[0.64rem] font-medium uppercase tracking-wide text-slate-400">
            {view.timeframe}
          </span>
          <span className="rounded-[0.25rem] bg-white/[0.06] px-1.5 py-0.5 text-[0.64rem] font-medium uppercase tracking-wide text-slate-400">
            {view.horizon}
          </span>
          {siggiInTrade && (
            <span className="rounded-[0.25rem] bg-[#00C884]/15 px-1.5 py-0.5 text-[0.64rem] font-semibold uppercase tracking-wide text-[#00C884] ring-1 ring-[#00C884]/30">
              Siggi in trade
            </span>
          )}
        </div>
        <p className="mt-1 text-[0.68rem] text-slate-600">{setup.strategy}</p>
      </div>

      {/* Trade on — platform logos */}
      <div className="min-w-0">
        <p className="micro-label">Trade on</p>
        <div className="mt-1.5">
          {platforms.length > 0
            ? <PlatformLogos platforms={platforms} />
            : <p className="text-[0.74rem] text-slate-600">—</p>}
        </div>
        <p className="mt-1.5 text-[0.67rem] text-slate-600">{marketSession.venue}</p>
      </div>

      {/* Price (pips) */}
      {(() => {
        const pipGap = livePipDistance(asset, view.entryZoneLow, view.entryZoneHigh);
        return (
          <div className="min-w-0">
            <p className="micro-label">Price (pips)</p>
            <p className="mt-1 text-[0.84rem] font-semibold tabular-nums text-white">
              {formatRowPrice(asset, formatPrice)}
              {pipGap && (
                pipGap.startsWith("in zone") ? (
                  <span className="ml-1.5 text-[0.70rem] font-semibold text-emerald-400" title="Price is inside the entry zone">
                    ({pipGap})
                  </span>
                ) : (
                  <span className="ml-1.5 text-[0.72rem] font-normal text-slate-500" title="Distance from live price to entry zone">
                    ({pipGap})
                  </span>
                )
              )}
            </p>
          </div>
        );
      })()}

      {/* Exact entry */}
      <div className="min-w-0">
        <p className="micro-label">Enter at</p>
        <p className={`mt-1 text-[0.84rem] font-semibold tabular-nums ${
          view.opportunityAction === "BUY" ? "text-emerald-300" :
          view.opportunityAction === "SELL" ? "text-rose-300" :
          "text-slate-400"
        }`}>
          {view.exactEntry}
        </p>
        <p className="mt-0.5 text-[0.68rem] text-slate-600">
          {view.opportunityAction === "BUY" ? "limit buy" :
           view.opportunityAction === "SELL" ? "limit sell" : "no signal"}
        </p>
      </div>

      {/* Action */}
      <div className="min-w-0">
        <p className="micro-label">Action</p>
        <p className={`mt-1 text-[0.86rem] font-bold leading-tight tracking-wide ${
          view.signal === "BUY NOW"  ? "text-emerald-400" :
          view.signal === "SELL NOW" ? "text-rose-400"    :
          "text-amber-300"
        }`}>
          {view.signal}
        </p>
        <p className="mt-0.5 text-[0.68rem] tabular-nums text-slate-500">{view.confidence}% conf</p>
      </div>

      {/* Trade span */}
      <div className="min-w-0" title={view.tradeSpanDetail}>
        <p className="micro-label">Hold</p>
        <p className="mt-1 text-[0.8rem] font-semibold text-[#00C884]/80">{view.tradeSpan}</p>
      </div>

      {/* Timing */}
      <div className="min-w-0">
        <p className="micro-label">Timing</p>
        {nextOpenLabel ? (
          <p className="mt-1 text-[0.74rem] font-semibold leading-5 text-amber-300">{nextOpenLabel}</p>
        ) : (
          <p className={`mt-1 text-[0.74rem] leading-5 ${view.decision.tone}`}>{view.timingWindow}</p>
        )}
        {(() => {
          if (!setup.analysisUpdatedAt) {
            return (
              <span className="mt-1 inline-block rounded-[0.22rem] bg-slate-700/60 px-1.5 py-0.5 text-[0.62rem] font-medium text-slate-400">
                Not analysed
              </span>
            );
          }
          const minsAgo = Math.max(
            0,
            Math.floor((Date.now() - Date.parse(setup.analysisUpdatedAt)) / 60_000),
          );
          const ageLabel =
            minsAgo === 0
              ? "Just now"
              : minsAgo < 60
                ? `${minsAgo} min ago`
                : `${Math.floor(minsAgo / 60)}h ago`;
          const badgeTone =
            minsAgo >= 360
              ? "bg-red-500/15 text-red-400"
              : minsAgo >= 30
                ? "bg-amber-400/10 text-amber-300"
                : "bg-emerald-500/10 text-emerald-400";
          return (
            <span className={`mt-1 inline-block rounded-[0.22rem] px-1.5 py-0.5 text-[0.62rem] font-medium ${badgeTone}`}>
              {`Analysed (${ageLabel})`}
            </span>
          );
        })()}
        {setup.analysis?.aiVerdict && (
          <span className={`mt-1 inline-block rounded-[0.22rem] px-1.5 py-0.5 text-[0.62rem] font-semibold ring-1 ${
            setup.analysis.aiVerdict === "Strong" ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" :
            setup.analysis.aiVerdict === "Good" ? "bg-[#00C884]/15 text-[#00C884] ring-[#00C884]/30" :
            setup.analysis.aiVerdict === "Marginal" ? "bg-amber-400/10 text-amber-300 ring-amber-400/20" :
            "bg-rose-500/15 text-rose-400 ring-rose-500/30"
          }`}>
            Siggi&apos;s Read: {setup.analysis.aiVerdict}
          </span>
        )}
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap gap-1.5 lg:flex-col lg:items-end">
        <button
          type="button"
          onClick={() => onOpenAnalysis(setup.id)}
          className="signal-button rounded-[0.4rem] px-2.5 py-1.5 text-[0.73rem] font-semibold"
        >
          Analysis
        </button>
        <button
          type="button"
          onClick={() => onOpenEvents(setup.id)}
          className="signal-surface-soft rounded-[0.4rem] px-2.5 py-1.5 text-[0.73rem] font-semibold text-white"
        >
          Events
        </button>
      </div>
      </div>{/* end desktop grid */}
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
  siggiOpenSymbols: siggiOpenSymbolsArray,
}: {
  assets: PersistedAssetRecord[];
  backtests: PersistedBacktestRecord[];
  chartVendor: "embed" | "charting_library";
  chartingLibraryAvailable: boolean;
  confirmationChecks: PersistedConfirmationCheck[];
  marketEvents: PersistedMarketEvent[];
  initialScannerResults: PersistedScannerResult[];
  predictionHistory: PersistedPredictionHistoryRecord[];
  siggiOpenSymbols: string[];
}) {
  const router = useRouter();
  const { formatPrice } = useDisplayCurrency();
  const [analysisSetupId, setAnalysisSetupId] = useState<string | null>(null);
  const [eventsSetupId, setEventsSetupId] = useState<string | null>(null);
  const PAGE_SIZE = 50;
  const [activeTab, setActiveTab] = useState<MarketTab>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const refreshStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const siggiOpenSymbolsSet = useMemo(() => new Set(siggiOpenSymbolsArray), [siggiOpenSymbolsArray]);

  // Minute-resolution tick so analysis staleness badges stay accurate without a full refresh
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  function handleRefreshAll() {
    if (isRefreshing) return;

    startRefreshTransition(async () => {
      setRefreshStatus("Re-analysing all opportunities...");

      try {
        const result = await analyzeAllStale();
        const count = result.analysed ?? 0;
        setRefreshStatus(
          count > 0
            ? `${count} ${count === 1 ? "setup" : "setups"} re-analysed — refreshing...`
            : "All setups are already fresh.",
        );
        router.refresh();
      } catch {
        setRefreshStatus("Re-analysis failed — will retry automatically.");
      } finally {
        if (refreshStatusTimeoutRef.current) {
          clearTimeout(refreshStatusTimeoutRef.current);
        }
        refreshStatusTimeoutRef.current = setTimeout(() => setRefreshStatus(null), 5_000);
      }
    });
  }

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
        .sort((left, right) => right.view.rankScore - left.view.rankScore),
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

  // Reset to page 1 whenever the tab changes
  useEffect(() => { setCurrentPage(1); }, [activeTab]);

  const tabRows = tabbedRows[activeTab];
  const totalPages = Math.max(1, Math.ceil(tabRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const visibleRows = tabRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
  const readyNowCount = tabRows.filter(
    (item) => item.view.decision.label === "ENTER NOW" && item.view.readiness >= 75,
  ).length;
  const shortTermCount = tabRows.filter((item) => item.view.horizon !== "Month").length;

  return (
    <>
      <div className="panel-stack-5">
        <PageHeader
          title="Opportunities"
          description="See the strongest cross-market names, then open analysis or event context without leaving the board."
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshAll}
                disabled={isRefreshing}
                className={`flex items-center gap-1.5 rounded-[0.4rem] px-3 py-1.5 text-[0.73rem] font-semibold transition ${
                  isRefreshing
                    ? "cursor-not-allowed bg-white/[0.04] text-slate-500"
                    : "signal-surface-soft text-white hover:bg-white/[0.08]"
                }`}
              >
                <svg
                  viewBox="0 0 16 16"
                  className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* ~300° clockwise arc */}
                  <path d="M13.6 2.4A7 7 0 1 1 2.8 13" />
                  {/* Arrowhead at arc-start: tip at (13.6 2.4), arms angled with the clockwise tangent */}
                  <path d="M15.4 0.7L13.6 2.4L11.8 4.1" />
                </svg>
                {isRefreshing ? "Re-analysing..." : "Refresh all"}
              </button>
              <ActionLink href="/assets">Open Charts</ActionLink>
            </div>
          }
        />
        {refreshStatus && (
          <div className="rounded-[0.4rem] bg-[#00C884]/10 px-3 py-2 text-[0.78rem] font-medium text-[#00C884] ring-1 ring-[#00C884]/20">
            {refreshStatus}
          </div>
        )}

        <Panel className="p-3 sm:p-3.5">
          <div className="grid gap-[5px] sm:grid-cols-3">
            <div className="signal-surface-soft rounded-[0.65rem] p-3">
              <p className="micro-label">{activeTab}</p>
              <p className="mt-1.5 text-[0.96rem] font-semibold text-white">{tabRows.length}</p>
              <p className="mt-1 text-[0.76rem] text-slate-400">
                {totalPages > 1 ? `Page ${safePage} of ${totalPages} · ` : ""}Ranked opportunities
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.65rem] p-3">
              <p className="micro-label">Short-term focus</p>
              <p className="mt-1.5 text-[0.96rem] font-semibold text-[#00C884]/80">{shortTermCount}</p>
              <p className="mt-1 text-[0.76rem] text-slate-400">Day and week opportunities</p>
            </div>
            <div className="signal-surface-soft rounded-[0.65rem] p-3">
              <p className="micro-label">Ready now</p>
              <p className="mt-1.5 text-[0.96rem] font-semibold text-emerald-300">{readyNowCount}</p>
              <p className="mt-1 text-[0.76rem] text-slate-400">In entry zone now</p>
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
          <div className="hidden border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-slate-600 lg:grid lg:grid-cols-[2.6rem_minmax(0,1.18fr)_minmax(0,1.0fr)_0.78fr_0.76fr_0.9fr_0.68fr_1.0fr_9rem] lg:gap-x-3">
            <span>Rank</span>
            <span>Instrument</span>
            <span>Trade on</span>
            <span>Price (pips)</span>
            <span>Enter at</span>
            <span>Action</span>
            <span>Hold</span>
            <span>Timing</span>
            <span className="lg:text-right">Review</span>
          </div>

          <div>
            {visibleRows.map(({ asset, setup, view }, index) => (
              <LeaderboardRow
                key={setup.id}
                asset={asset}
                rank={(safePage - 1) * PAGE_SIZE + index + 1}
                setup={setup}
                view={view}
                siggiOpenSymbols={siggiOpenSymbolsSet}
                onOpenAnalysis={setAnalysisSetupId}
                onOpenEvents={setEventsSetupId}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/6 px-3 py-2.5">
              <p className="text-[0.72rem] text-slate-500">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, tabRows.length)} of {tabRows.length} opportunities
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="flex h-7 items-center gap-1 rounded-[0.35rem] px-2.5 text-[0.72rem] font-semibold transition signal-surface-soft text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-[0.72rem] text-slate-600">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setCurrentPage(p as number)}
                        className={`h-7 min-w-[1.75rem] rounded-[0.35rem] px-2 text-[0.72rem] font-semibold transition ${
                          p === safePage
                            ? "signal-button"
                            : "signal-surface-soft text-white hover:bg-white/[0.08]"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="flex h-7 items-center gap-1 rounded-[0.35rem] px-2.5 text-[0.72rem] font-semibold transition signal-surface-soft text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
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
                <div className="signal-surface rounded-[0.7rem] p-3">
                  <p className="micro-label">Siggi call</p>
                  <p className="mt-1.5 text-[1.02rem] font-semibold text-white">
                    {selectedEventsItem.view.decision.label} / {selectedEventsItem.view.opportunityAction === "BUY" ? "LONG" : selectedEventsItem.view.opportunityAction === "SELL" ? "SHORT" : selectedEventsItem.view.opportunityAction}
                  </p>
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">
                    {selectedEventsItem.view.priorityReason}
                  </p>
                  <p className="mt-2 text-[0.76rem] leading-5 text-slate-400">
                    {selectedEventsItem.view.eventEntryGuidance}
                  </p>
                </div>
                <div className="signal-surface-soft rounded-[0.65rem] p-3">
                  <p className="micro-label">Confidence</p>
                  <p className="mt-1.5 text-[0.98rem] font-semibold text-white">
                    {selectedEventsItem.view.confidence}%
                  </p>
                  <p className="mt-1 text-[0.76rem] text-slate-400">
                    {selectedEventsItem.view.liveRR
                      ? `Live R:R from current price: ${selectedEventsItem.view.liveRR}`
                      : "Current prediction quality"}
                  </p>
                </div>
                <div className="signal-surface-soft rounded-[0.65rem] p-3">
                  <p className="micro-label">Event move</p>
                  <p className="mt-1.5 text-[0.98rem] font-semibold text-emerald-300">
                    {selectedEventsItem.view.eventMove}
                  </p>
                  <p className="mt-1 text-[0.76rem] text-slate-400">
                    {selectedEventsItem.view.eventLikelihood}% likelihood
                  </p>
                </div>
                <div className="signal-surface-soft rounded-[0.65rem] p-3">
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
                  <div key={item.label} className="signal-surface-soft rounded-[0.65rem] p-3">
                    <p className="micro-label">{item.label}</p>
                    <p className="mt-1.5 text-[0.96rem] font-semibold text-white">{item.score}%</p>
                    <p className="mt-1 text-[0.76rem] leading-5 text-slate-400">{item.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>

            {selectedEventsItem.setup.analysis?.aiVerdict && (() => {
              const ai = selectedEventsItem.setup.analysis!;
              return (
                <Panel className="p-3 sm:p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="micro-label">Siggi&apos;s Read</p>
                    <div className="flex items-center gap-2">
                      {ai.aiScore != null && (
                        <span className="text-[0.72rem] tabular-nums text-slate-400">{ai.aiScore}/100</span>
                      )}
                      <span className={`rounded-[0.25rem] px-2 py-0.5 text-[0.72rem] font-semibold ring-1 ${
                        ai.aiVerdict === "Strong" ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" :
                        ai.aiVerdict === "Good" ? "bg-[#00C884]/15 text-[#00C884] ring-[#00C884]/30" :
                        ai.aiVerdict === "Marginal" ? "bg-amber-400/10 text-amber-300 ring-amber-400/20" :
                        "bg-rose-500/15 text-rose-400 ring-rose-500/30"
                      }`}>
                        {ai.aiVerdict}
                      </span>
                    </div>
                  </div>
                  {ai.aiReasoning && (
                    <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{ai.aiReasoning}</p>
                  )}
                  {ai.aiEntryRefinement && (
                    <div className="mt-2 rounded-[0.35rem] border border-[#00C884]/20 bg-[#00C884]/8 px-2.5 py-2">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#00C884]">Entry refinement</p>
                      <p className="mt-0.5 text-[0.78rem] leading-5 text-[#00C884]/80">{ai.aiEntryRefinement}</p>
                    </div>
                  )}
                  {((ai.aiPatterns?.length ?? 0) > 0 || (ai.aiKeyRisks?.length ?? 0) > 0) && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {ai.aiPatterns && ai.aiPatterns.length > 0 && (
                        <div>
                          <p className="micro-label mb-2">Confluences identified</p>
                          <ul className="space-y-1.5">
                            {ai.aiPatterns.map((p) => (
                              <li key={p} className="flex gap-1.5 text-[0.78rem] leading-5 text-slate-300">
                                <span className="mt-0.5 shrink-0 text-emerald-400">↑</span>
                                <span>{p}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {ai.aiKeyRisks && ai.aiKeyRisks.length > 0 && (
                        <div>
                          <p className="micro-label mb-2">Key risks</p>
                          <ul className="space-y-1.5">
                            {ai.aiKeyRisks.map((r) => (
                              <li key={r} className="flex gap-1.5 text-[0.78rem] leading-5 text-slate-400">
                                <span className="mt-0.5 shrink-0 text-rose-400">↓</span>
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </Panel>
              );
            })()}

            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Scheduled drivers and likely effect</p>
              <div className="mt-3 grid gap-[5px] xl:grid-cols-2">
                {selectedEventRows.map((event) => (
                  <div key={event.id} className="signal-surface-soft rounded-[0.65rem] p-3">
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

            {(() => {
              const universeEntry = selectedEventsItem
                ? getInstrumentUniverseEntry(selectedEventsItem.setup.symbol)
                : null;
              const bt = universeEntry?.backtestStats;
              if (!bt) return null;
              return (
                <Panel className="p-3 sm:p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="micro-label">
                      Strategy back-test · {selectedEventsItem!.setup.strategy}
                    </p>
                    <span className="rounded-[0.25rem] bg-amber-400/10 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-amber-300">
                      Estimated
                    </span>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] leading-4 text-amber-200/70">
                    These figures are projected from strategy-class ranges. Real historical fills will replace them as Siggi records live trades.
                  </p>
                  <div className="mt-3 grid gap-[5px] sm:grid-cols-3 xl:grid-cols-6">
                    <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                      <p className="micro-label">Win rate</p>
                      <p className="mt-1 text-[0.92rem] font-semibold text-white">{bt.winRatePct}%</p>
                      <p className="mt-0.5 text-[0.7rem] text-slate-400">{bt.totalTrades} signals</p>
                    </div>
                    <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                      <p className="micro-label">Profit factor</p>
                      <p className="mt-1 text-[0.92rem] font-semibold text-emerald-300">{bt.profitFactor.toFixed(2)}</p>
                      <p className="mt-0.5 text-[0.7rem] text-slate-400">gross profit / loss</p>
                    </div>
                    <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                      <p className="micro-label">Max drawdown</p>
                      <p className="mt-1 text-[0.92rem] font-semibold text-red-300">{bt.maxDrawdownPct}%</p>
                      <p className="mt-0.5 text-[0.7rem] text-slate-400">peak-to-trough</p>
                    </div>
                    <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                      <p className="micro-label">Ann. return</p>
                      <p className="mt-1 text-[0.92rem] font-semibold text-[#00C884]/80">{formatPercent(bt.annualisedReturnPct)}</p>
                      <p className="mt-0.5 text-[0.7rem] text-slate-400">CAGR estimate</p>
                    </div>
                    <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                      <p className="micro-label">Sharpe</p>
                      <p className="mt-1 text-[0.92rem] font-semibold text-white">{bt.sharpe.toFixed(2)}</p>
                      <p className="mt-0.5 text-[0.7rem] text-slate-400">risk-adjusted</p>
                    </div>
                    <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                      <p className="micro-label">Trade on</p>
                      <div className="mt-1.5">
                        <PlatformLogos platforms={getInstrumentPlatforms(universeEntry!)} />
                      </div>
                    </div>
                  </div>
                  {bt.warnings.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {bt.warnings.map((w) => (
                        <p key={w} className="text-[0.74rem] leading-4 text-amber-200/80">
                          {w}
                        </p>
                      ))}
                    </div>
                  )}
                </Panel>
              );
            })()}

            {(() => {
              const evView = selectedEventsItem?.view;
              if (!evView) return null;
              const entryStr = evView.exactEntry.replace(/[$£€,]/g, "");
              const stopStr = evView.stop.replace(/[$£€,]/g, "");
              const entryPrice = Number(entryStr);
              const stopPrice = Number(stopStr);
              const riskPerUnit = entryPrice > 0 && stopPrice > 0 ? Math.abs(entryPrice - stopPrice) : 0;
              const riskPct = entryPrice > 0 && riskPerUnit > 0 ? (riskPerUnit / entryPrice) * 100 : 0;

              // Calculate units for 1% and 2% account risk at representative account sizes
              function calcUnits(accountSize: number, riskFraction: number) {
                if (riskPerUnit <= 0) return "N/A";
                const riskAmount = accountSize * riskFraction;
                const units = riskAmount / riskPerUnit;
                return units >= 1 ? Math.round(units).toLocaleString() : units.toFixed(4);
              }

              return (
                <Panel className="p-3 sm:p-3.5">
                  <p className="micro-label">Position sizing guidance</p>
                  <p className="mt-1.5 text-[0.76rem] leading-5 text-slate-400">
                    Based on entry at <span className="font-medium text-slate-200">{evView.exactEntry}</span> and stop at <span className="font-medium text-slate-200">{evView.stop}</span> — risk per unit is{" "}
                    <span className="font-medium text-slate-200">{riskPerUnit > 0 ? `${riskPct.toFixed(2)}% of entry price` : "unknown (no analysis yet)"}</span>.
                  </p>
                  {riskPerUnit > 0 && (
                    <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
                      <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                        <p className="micro-label">1% risk · $10k account</p>
                        <p className="mt-1 text-[0.92rem] font-semibold text-white">{calcUnits(10_000, 0.01)} units</p>
                        <p className="mt-0.5 text-[0.7rem] text-slate-400">$100 max loss on trade</p>
                      </div>
                      <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                        <p className="micro-label">1% risk · $50k account</p>
                        <p className="mt-1 text-[0.92rem] font-semibold text-white">{calcUnits(50_000, 0.01)} units</p>
                        <p className="mt-0.5 text-[0.7rem] text-slate-400">$500 max loss on trade</p>
                      </div>
                      <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                        <p className="micro-label">2% risk · $10k account</p>
                        <p className="mt-1 text-[0.92rem] font-semibold text-white">{calcUnits(10_000, 0.02)} units</p>
                        <p className="mt-0.5 text-[0.7rem] text-slate-400">$200 max loss on trade</p>
                      </div>
                      <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
                        <p className="micro-label">2% risk · $50k account</p>
                        <p className="mt-1 text-[0.92rem] font-semibold text-white">{calcUnits(50_000, 0.02)} units</p>
                        <p className="mt-0.5 text-[0.7rem] text-slate-400">$1,000 max loss on trade</p>
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-[0.68rem] leading-4 text-slate-600">
                    Risk no more than 1–2% of your account per trade. These are indicative unit sizes — adjust for leverage, lot sizes, and your broker's minimum increments.
                  </p>
                </Panel>
              );
            })()}

            <Panel className="p-3 sm:p-3.5">
              <p className="micro-label">Confirmation memory</p>
              <div className="mt-3 grid gap-[5px] xl:grid-cols-2">
                {selectedEventChecks.map((check) => (
                  <div key={check.id} className="signal-surface-soft rounded-[0.65rem] p-3">
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
