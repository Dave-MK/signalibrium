"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supportedChartIntervals } from "@/app/_lib/market-data-contract";
import { getTradingViewSymbolDefinition, listTradingViewWatchlistSymbols } from "@/app/_lib/tradingview-symbols";
import { deriveChartAnalysis } from "@/app/_lib/chart-analysis";
import {
  formatCurrency,
  formatChartAxisLabel,
  formatDateTimeLabel,
  formatNumber,
  formatPercent,
} from "@/app/_lib/format";
import { fetchMarketChart } from "@/app/_lib/workspace-api";
import type {
  LiveCandle,
  LiveCandleSeries,
  SupportedChartInterval,
} from "@/app/_lib/server/market-data/provider-types";
import { TradingViewChartingLibraryWorkspace } from "./tradingview-charting-library-workspace";
import { Panel, StatusChip } from "./ui";

const intervalMap: Record<SupportedChartInterval, string> = {
  "15min": "15",
  "1h": "60",
  "4h": "240",
  "1day": "D",
};

function CandleChart({
  candles,
}: {
  candles: LiveCandle[];
}) {
  const chartWidth = 760;
  const chartHeight = 320;
  const padding = { top: 12, right: 12, bottom: 26, left: 54 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const range = Math.max(high - low, 0.0001);
  const candleSlot = innerWidth / candles.length;
  const candleBodyWidth = Math.max(3, Math.min(12, candleSlot * 0.6));

  function scaleY(value: number) {
    return padding.top + ((high - value) / range) * innerHeight;
  }

  const guideValues = [high, high - range * 0.33, high - range * 0.66, low];
  const tickLabels = candles.filter((_, index) => index % Math.ceil(candles.length / 4) === 0);

  return (
    <div className="signal-surface rounded-[0.46rem] p-3">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-70 w-full">
        {guideValues.map((value) => {
          const y = scaleY(value);

          return (
            <g key={value}>
              <line
                x1={padding.left}
                x2={chartWidth - padding.right}
                y1={y}
                y2={y}
                stroke="rgba(148, 163, 184, 0.12)"
                strokeDasharray="3 4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="rgba(148, 163, 184, 0.85)"
              >
                {formatNumber(value, value >= 100 ? 0 : 2)}
              </text>
            </g>
          );
        })}

        {candles.map((candle, index) => {
          const x = padding.left + candleSlot * index + candleSlot / 2;
          const openY = scaleY(candle.open);
          const closeY = scaleY(candle.close);
          const highY = scaleY(candle.high);
          const lowY = scaleY(candle.low);
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
          const isBullish = candle.close >= candle.open;
          const bodyFill = isBullish ? "#22d3ee" : "#f87171";
          const wickStroke = isBullish ? "rgba(34, 211, 238, 0.85)" : "rgba(248, 113, 113, 0.85)";

          return (
            <g key={`${candle.datetime}-${index}`}>
              <line
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
                stroke={wickStroke}
                strokeWidth="1.5"
              />
              <rect
                x={x - candleBodyWidth / 2}
                y={bodyY}
                width={candleBodyWidth}
                height={bodyHeight}
                rx="1.5"
                fill={bodyFill}
                opacity={0.95}
              />
            </g>
          );
        })}

        {tickLabels.map((candle, index) => {
          const actualIndex = candles.findIndex((item) => item.datetime === candle.datetime);
          const x = padding.left + candleSlot * actualIndex + candleSlot / 2;

          return (
            <text
              key={`${candle.datetime}-${index}-tick`}
              x={x}
              y={chartHeight - 6}
              textAnchor="middle"
              fontSize="11"
              fill="rgba(148, 163, 184, 0.85)"
            >
              {formatChartAxisLabel(candle.datetime, candles.length <= 32)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function deriveChartStats(candles: LiveCandle[]) {
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? latest;
  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const priceChange = latest.close - previous.close;
  const percentChange = previous.close > 0 ? (priceChange / previous.close) * 100 : 0;
  const totalVolume = candles.reduce((total, candle) => total + (candle.volume ?? 0), 0);

  return {
    latest,
    high,
    low,
    priceChange,
    percentChange,
    totalVolume,
  };
}

function buildLinePath(
  series: Array<number | null>,
  chartWidth: number,
  scaleY: (value: number) => number,
) {
  const step = chartWidth / Math.max(series.length - 1, 1);
  let path = "";

  for (let index = 0; index < series.length; index += 1) {
    const value = series[index];

    if (value === null || !Number.isFinite(value)) {
      continue;
    }

    const x = index * step;
    const y = scaleY(value);
    path += `${path ? " L" : "M"} ${x} ${y}`;
  }

  return path;
}

function CompactAnalysisChart({
  candles,
  analysis,
}: {
  candles: LiveCandle[];
  analysis: ReturnType<typeof deriveChartAnalysis>;
}) {
  const chartWidth = 960;
  const chartHeight = 430;
  const padding = { top: 20, right: 14, bottom: 18, left: 10 };
  const pricePanelHeight = 220;
  const rsiPanelHeight = 72;
  const macdPanelHeight = 82;
  const panelGap = 18;
  const innerWidth = chartWidth - padding.left - padding.right;
  const priceTop = padding.top;
  const rsiTop = priceTop + pricePanelHeight + panelGap;
  const macdTop = rsiTop + rsiPanelHeight + panelGap;
  const chartLeft = padding.left;
  const priceValues = [
    ...candles.flatMap((candle) => [candle.high, candle.low]),
    ...analysis.ema20.filter((value): value is number => value !== null),
    ...analysis.ema50.filter((value): value is number => value !== null),
  ];
  const priceMax = Math.max(...priceValues);
  const priceMin = Math.min(...priceValues);
  const priceRange = Math.max(priceMax - priceMin, 0.0001);
  const candleSlot = innerWidth / candles.length;
  const candleBodyWidth = Math.max(3, Math.min(10, candleSlot * 0.56));

  const scalePriceY = (value: number) =>
    priceTop + ((priceMax - value) / priceRange) * pricePanelHeight;
  const scaleRsiY = (value: number) => rsiTop + ((100 - value) / 100) * rsiPanelHeight;
  const macdValues = [
    ...analysis.macd.filter((value): value is number => value !== null),
    ...analysis.macdSignal.filter((value): value is number => value !== null),
    ...analysis.macdHistogram.filter((value): value is number => value !== null),
  ];
  const macdMax = Math.max(...macdValues, 0.0001);
  const macdMin = Math.min(...macdValues, -0.0001);
  const macdRange = Math.max(macdMax - macdMin, 0.0001);
  const scaleMacdY = (value: number) =>
    macdTop + ((macdMax - value) / macdRange) * macdPanelHeight;
  const zeroLineY = scaleMacdY(0);
  const tickLabels = candles.filter((_, index) => index % Math.ceil(candles.length / 5) === 0);

  return (
    <div className="signal-surface rounded-[0.46rem] p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.72rem] text-slate-300">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-cyan-300" />
          EMA 20
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          EMA 50
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-violet-300" />
          RSI 14
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          MACD
        </span>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full">
        <rect x="0" y={priceTop} width={chartWidth} height={pricePanelHeight} fill="rgba(8, 13, 23, 0.35)" rx="8" />
        <rect x="0" y={rsiTop} width={chartWidth} height={rsiPanelHeight} fill="rgba(8, 13, 23, 0.28)" rx="8" />
        <rect x="0" y={macdTop} width={chartWidth} height={macdPanelHeight} fill="rgba(8, 13, 23, 0.28)" rx="8" />

        {[priceTop + pricePanelHeight * 0.25, priceTop + pricePanelHeight * 0.5, priceTop + pricePanelHeight * 0.75].map((y) => (
          <line
            key={`price-guide-${y}`}
            x1={chartLeft}
            x2={chartWidth - padding.right}
            y1={y}
            y2={y}
            stroke="rgba(148, 163, 184, 0.08)"
            strokeDasharray="3 4"
          />
        ))}
        {[30, 50, 70].map((value) => (
          <line
            key={`rsi-guide-${value}`}
            x1={chartLeft}
            x2={chartWidth - padding.right}
            y1={scaleRsiY(value)}
            y2={scaleRsiY(value)}
            stroke={value === 50 ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.08)"}
            strokeDasharray="3 4"
          />
        ))}
        <line
          x1={chartLeft}
          x2={chartWidth - padding.right}
          y1={zeroLineY}
          y2={zeroLineY}
          stroke="rgba(148, 163, 184, 0.1)"
          strokeDasharray="3 4"
        />

        {candles.map((candle, index) => {
          const x = chartLeft + candleSlot * index + candleSlot / 2;
          const openY = scalePriceY(candle.open);
          const closeY = scalePriceY(candle.close);
          const highY = scalePriceY(candle.high);
          const lowY = scalePriceY(candle.low);
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(1.4, Math.abs(closeY - openY));
          const isBullish = candle.close >= candle.open;
          const bodyFill = isBullish ? "rgba(34, 211, 238, 0.95)" : "rgba(248, 113, 113, 0.95)";
          const wickStroke = isBullish ? "rgba(34, 211, 238, 0.8)" : "rgba(248, 113, 113, 0.8)";

          return (
            <g key={`${candle.datetime}-${index}`}>
              <line x1={x} x2={x} y1={highY} y2={lowY} stroke={wickStroke} strokeWidth="1.3" />
              <rect
                x={x - candleBodyWidth / 2}
                y={bodyY}
                width={candleBodyWidth}
                height={bodyHeight}
                rx="1.4"
                fill={bodyFill}
              />
            </g>
          );
        })}

        <path
          d={buildLinePath(analysis.ema20, innerWidth, scalePriceY)}
          transform={`translate(${chartLeft}, 0)`}
          fill="none"
          stroke="rgba(34, 211, 238, 0.95)"
          strokeWidth="2"
        />
        <path
          d={buildLinePath(analysis.ema50, innerWidth, scalePriceY)}
          transform={`translate(${chartLeft}, 0)`}
          fill="none"
          stroke="rgba(251, 191, 36, 0.9)"
          strokeWidth="2"
        />
        <path
          d={buildLinePath(analysis.rsi, innerWidth, scaleRsiY)}
          transform={`translate(${chartLeft}, 0)`}
          fill="none"
          stroke="rgba(196, 181, 253, 0.92)"
          strokeWidth="2"
        />
        <path
          d={buildLinePath(analysis.macd, innerWidth, scaleMacdY)}
          transform={`translate(${chartLeft}, 0)`}
          fill="none"
          stroke="rgba(34, 197, 94, 0.95)"
          strokeWidth="2"
        />
        <path
          d={buildLinePath(analysis.macdSignal, innerWidth, scaleMacdY)}
          transform={`translate(${chartLeft}, 0)`}
          fill="none"
          stroke="rgba(251, 191, 36, 0.9)"
          strokeWidth="1.8"
        />

        {analysis.macdHistogram.map((value, index) => {
          if (value === null || !Number.isFinite(value)) {
            return null;
          }

          const x = chartLeft + candleSlot * index + candleSlot / 2;
          const y = scaleMacdY(value);
          const barY = Math.min(y, zeroLineY);
          const barHeight = Math.max(1.2, Math.abs(zeroLineY - y));

          return (
            <rect
              key={`histogram-${candles[index]?.datetime ?? index}`}
              x={x - Math.max(1.5, candleBodyWidth * 0.35)}
              y={barY}
              width={Math.max(3, candleBodyWidth * 0.7)}
              height={barHeight}
              rx="1"
              fill={value >= 0 ? "rgba(52, 211, 153, 0.72)" : "rgba(248, 113, 113, 0.72)"}
            />
          );
        })}

        {tickLabels.map((candle, index) => {
          const actualIndex = candles.findIndex((item) => item.datetime === candle.datetime);
          const x = chartLeft + candleSlot * actualIndex + candleSlot / 2;

          return (
            <text
              key={`${candle.datetime}-${index}-tick`}
              x={x}
              y={chartHeight - 3}
              textAnchor="middle"
              fontSize="11"
              fill="rgba(148, 163, 184, 0.82)"
            >
              {formatChartAxisLabel(candle.datetime, candles.length <= 32)}
            </text>
          );
        })}

        <text x={chartLeft + 4} y={priceTop - 6} fontSize="11" fill="rgba(148, 163, 184, 0.9)">Price + EMA 20/50</text>
        <text x={chartLeft + 4} y={rsiTop - 6} fontSize="11" fill="rgba(148, 163, 184, 0.9)">RSI 14</text>
        <text x={chartLeft + 4} y={macdTop - 6} fontSize="11" fill="rgba(148, 163, 184, 0.9)">MACD 12,26,9</text>
      </svg>
    </div>
  );
}

function IndicatorSignalCard({
  label,
  tone,
  value,
  explanation,
}: {
  label: string;
  tone: string;
  value: string;
  explanation: string;
}) {
  const toneClass =
    tone === "Constructive"
      ? "text-emerald-300"
      : tone === "Soft"
        ? "text-red-300"
        : "text-slate-100";

  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="micro-label">{label}</p>
        <p className={`text-[0.72rem] font-semibold ${toneClass}`}>{tone}</p>
      </div>
      <p className="mt-1.5 text-[0.94rem] font-semibold text-white">{value}</p>
      <p className="mt-1 text-[0.74rem] leading-5 text-slate-400">{explanation}</p>
    </div>
  );
}

function TradingViewEmbedWorkspace({
  chartSymbol,
  displaySymbol,
  selectedInterval,
  heightClassName = "h-[calc(100vh-12rem)]",
}: {
  chartSymbol: string;
  displaySymbol: string;
  selectedInterval: SupportedChartInterval;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const watchlist = useMemo(() => listTradingViewWatchlistSymbols(), []);

  useEffect(() => {
    const host = containerRef.current;

    if (!host) {
      return;
    }

    setIsLoading(true);
    setError(null);
    host.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container h-full w-full";
    wrapper.style.height = "100%";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.width = "100%";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget h-full w-full";
    widget.style.flex = "1 1 auto";
    widget.style.height = "100%";
    widget.style.minHeight = "0";
    widget.style.width = "100%";

    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright pt-1 text-[0.68rem] text-slate-500";
    copyright.innerHTML = `<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="text-cyan-300">Advanced chart tools</span></a> by TradingView`;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: chartSymbol,
      interval: intervalMap[selectedInterval],
      timezone: "Europe/London",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: false,
      details: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hotlist: false,
      save_image: true,
      withdateranges: true,
      watchlist,
      compareSymbols: [],
      studies: [],
      support_host: "https://www.tradingview.com",
      backgroundColor: "#0b1220",
      gridColor: "rgba(148, 163, 184, 0.08)",
      toolbar_bg: "#0f1725",
    });

    script.onload = () => {
      window.setTimeout(() => {
        setIsLoading(false);
      }, 600);
    };

    script.onerror = () => {
      setError("TradingView tools could not load in this environment.");
      setIsLoading(false);
    };

    wrapper.appendChild(widget);
    wrapper.appendChild(copyright);
    wrapper.appendChild(script);
    host.appendChild(wrapper);

    return () => {
      host.innerHTML = "";
    };
  }, [chartSymbol, displaySymbol, selectedInterval, watchlist]);

  return (
    <div className="relative">
      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[0.46rem] bg-[rgba(8,12,20,0.46)] backdrop-blur-[1px]">
          <div className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] text-slate-200">
            Loading advanced chart workspace...
          </div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={`signal-surface overflow-hidden rounded-[0.46rem] p-0 ${heightClassName}`}
        aria-label={`${displaySymbol} advanced trading chart`}
      />

      {error ? (
        <div className="signal-warning-surface mt-[5px] rounded-[0.4rem] p-3">
          <p className="text-[0.82rem] font-semibold text-amber-100">Advanced chart unavailable</p>
          <p className="mt-1 text-[0.78rem] leading-5 text-slate-300">{error}</p>
        </div>
      ) : null}
    </div>
  );
}

export function AssetLiveChartPanel({
  chartVendor,
  chartingLibraryAvailable,
  symbol,
  name,
  price,
  initialChart,
}: {
  chartVendor: "embed" | "charting_library";
  chartingLibraryAvailable: boolean;
  symbol: string;
  name: string;
  price: number;
  initialChart?: LiveCandleSeries | null;
}) {
  const [selectedInterval, setSelectedInterval] = useState<SupportedChartInterval>("1h");
  const [chart, setChart] = useState<LiveCandleSeries | null>(initialChart ?? null);
  const [isLoading, setIsLoading] = useState(!initialChart);
  const [isFullAnalysisOpen, setIsFullAnalysisOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tradingViewSymbol = getTradingViewSymbolDefinition(symbol);
  const shouldUseChartingLibrary = chartVendor === "charting_library" && chartingLibraryAvailable;
  const showChartingLibrarySetupNotice =
    chartVendor === "charting_library" && !chartingLibraryAvailable;

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;
    let initialLoadId: number | null = null;

    async function loadChart() {
      try {
        setIsLoading(true);
        setError(null);
        const nextChart = await fetchMarketChart(
          symbol,
          selectedInterval,
          selectedInterval === "15min" ? 64 : 48,
        );

        if (!cancelled) {
          setChart(nextChart);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load live chart data.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    initialLoadId = window.setTimeout(() => {
      void loadChart();
    }, initialChart && selectedInterval === initialChart.interval ? 12_000 : 0);

    intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadChart();
      }
    }, 95_000);

    return () => {
      cancelled = true;

      if (initialLoadId !== null) {
        window.clearTimeout(initialLoadId);
      }

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [initialChart, selectedInterval, symbol]);

  const chartStats = useMemo(
    () => (chart?.candles?.length ? deriveChartStats(chart.candles) : null),
    [chart],
  );
  const analysis = useMemo(
    () =>
      chart?.candles?.length ? deriveChartAnalysis(chart.candles, symbol, name) : null,
    [chart, name, symbol],
  );

  useEffect(() => {
    if (!isFullAnalysisOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFullAnalysisOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullAnalysisOpen]);

  return (
    <>
      <Panel className="p-3 sm:p-3.5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="micro-label">Market Read</p>
            <h2 className="mt-1.5 text-[1rem] font-semibold text-white sm:text-[1.1rem]">
              {symbol} / {name}
            </h2>
            <p className="mt-1 text-[0.8rem] leading-5 text-slate-400">
              Start with a tighter indicator-led read, then pop into a full-screen chart workspace when you want deeper execution analysis.
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-1.25">
            {supportedChartIntervals.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSelectedInterval(item)}
                className={`rounded-[0.4rem] px-2.5 py-1.5 text-[0.74rem] font-semibold transition ${
                  item === selectedInterval
                    ? "signal-accent-surface text-white"
                    : "signal-surface-soft text-slate-300 hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsFullAnalysisOpen(true)}
              className="signal-button rounded-[0.46rem] px-3 py-1.5 text-[0.76rem] font-semibold"
            >
              Open Full Analysis
            </button>
          </div>
        </div>

        <div className="signal-toolbar-card flex flex-wrap items-center gap-2 rounded-[0.46rem] px-2.5 py-2 text-[0.74rem] text-slate-300">
          <StatusChip label="AUTO INDICATORS" />
          <span>EMA 20, EMA 50, RSI 14, and MACD are applied automatically.</span>
          <span>Use the compact read to judge structure fast.</span>
          <span>Use full analysis for drawings, comparison, and deeper chart work.</span>
        </div>

        {analysis && chart?.candles?.length ? (
          <>
            <CompactAnalysisChart candles={chart.candles} analysis={analysis} />

            <div className="signal-accent-surface rounded-[0.46rem] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="micro-label">Overall Read</p>
                  <p className="mt-1.5 text-[1rem] font-semibold text-white">
                    {analysis.overall.bias}
                  </p>
                </div>
                <StatusChip label={analysis.overall.bias.toUpperCase()} />
              </div>
              <p className="mt-2 text-[0.82rem] leading-5 text-slate-200">
                {analysis.overall.summary}
              </p>
            </div>

            <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
              {analysis.signalCards.map((card) => (
                <IndicatorSignalCard
                  key={card.label}
                  label={card.label}
                  tone={card.tone}
                  value={
                    card.label === "MACD"
                      ? formatNumber(card.value ?? 0, 3)
                      : card.label === "RSI 14"
                        ? formatNumber(card.value ?? 0, 1)
                        : formatCurrency(card.value ?? 0)
                  }
                  explanation={card.explanation}
                />
              ))}
            </div>
          </>
        ) : null}

        <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
          <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
            <p className="micro-label">Last</p>
            <p className="mt-1.5 text-[1rem] font-semibold text-white">
              {chartStats ? formatCurrency(chartStats.latest.close) : formatCurrency(price)}
            </p>
            <p
              className={`mt-1 text-[0.78rem] font-medium ${
                chartStats && chartStats.percentChange >= 0 ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {chartStats ? formatPercent(chartStats.percentChange, true) : "Loading..."}
            </p>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
            <p className="micro-label">Range</p>
            <p className="mt-1.5 text-[0.92rem] font-semibold text-white">
              {chartStats ? `${formatCurrency(chartStats.low)} - ${formatCurrency(chartStats.high)}` : "Loading..."}
            </p>
            <p className="mt-1 text-[0.74rem] text-slate-400">Visible live range</p>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
            <p className="micro-label">Volume</p>
            <p className="mt-1.5 text-[0.92rem] font-semibold text-white">
              {chartStats ? formatNumber(chartStats.totalVolume, 0) : "Loading..."}
            </p>
            <p className="mt-1 text-[0.74rem] text-slate-400">Summed across visible bars</p>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
            <p className="micro-label">Updated</p>
            <p className="mt-1.5 text-[0.92rem] font-semibold text-white">
              {chart ? formatDateTimeLabel(chart.fetchedAt) : "Loading..."}
            </p>
            <p className="mt-1 text-[0.74rem] text-slate-400">Auto-refreshes while visible</p>
          </div>
        </div>

        {showChartingLibrarySetupNotice ? (
          <div className="signal-warning-surface rounded-[0.4rem] p-2.5">
            <p className="text-[0.78rem] font-semibold text-amber-100">Charting Library setup needed</p>
            <p className="mt-1 text-[0.78rem] leading-5 text-slate-300">
              `SIGNALIBRIUM_CHART_VENDOR` is set to `charting_library`, but the licensed TradingView bundle was not found at `public/charting_library/charting_library.js`. The workspace is falling back to the embed chart until those files are added locally.
            </p>
          </div>
        ) : null}

        {tradingViewSymbol?.note || chart?.proxyNote || chart?.chartNote ? (
          <div className="signal-warning-surface rounded-[0.4rem] p-2.5">
            <p className="text-[0.78rem] font-semibold text-amber-100">Chart Context</p>
            <p className="mt-1 text-[0.78rem] leading-5 text-slate-300">
              {tradingViewSymbol?.note ?? chart?.chartNote ?? chart?.proxyNote}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="signal-warning-surface rounded-[0.4rem] p-3">
            <p className="text-[0.82rem] font-semibold text-amber-100">Live chart data unavailable</p>
            <p className="mt-1 text-[0.78rem] leading-5 text-slate-300">{error}</p>
          </div>
        ) : null}

        {isLoading && !chart ? (
          <div className="signal-surface rounded-[0.46rem] p-6 text-[0.84rem] text-slate-300">
            Loading live candlestick data...
          </div>
        ) : null}

        {chart?.candles?.length ? (
          <details className="signal-surface-soft rounded-[0.4rem] p-3">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[0.76rem] font-semibold text-slate-200 marker:hidden">
              <StatusChip label="PROVIDER SNAPSHOT" />
              <span>{selectedInterval} candle feed</span>
              <span className="text-slate-500">{chart.candles.length} candles</span>
            </summary>
            <p className="mt-2 text-[0.74rem] leading-5 text-slate-400">
              Use this only when you want to inspect the raw synced feed behind the main chart workspace.
            </p>
            <div className="mt-3">
              <CandleChart candles={chart.candles} />
            </div>
          </details>
        ) : null}
      </div>
      </Panel>

      {isFullAnalysisOpen ? (
        <div className="fixed inset-0 z-50 bg-[rgba(3,6,12,0.78)] p-3 backdrop-blur-sm sm:p-5">
          <div className="flex h-full flex-col overflow-hidden rounded-[0.7rem] border border-white/10 bg-[#07111d] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 px-4 py-3 sm:px-5">
              <div>
                <p className="micro-label">Full Analysis</p>
                <h3 className="mt-1 text-[1.02rem] font-semibold text-white sm:text-[1.12rem]">
                  {symbol} / {name}
                </h3>
                <p className="mt-1 text-[0.78rem] text-slate-400">
                  Use the full chart for indicator inspection, drawings, compare mode, and a deeper execution read.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip label={shouldUseChartingLibrary ? "PRO CHART MODE" : "FULL WORKSPACE"} />
                <button
                  type="button"
                  onClick={() => setIsFullAnalysisOpen(false)}
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-1.5 text-[0.76rem] font-semibold text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="panel-stack-5">
                <div className="signal-toolbar-card flex flex-wrap items-center gap-2 rounded-[0.46rem] px-2.5 py-2 text-[0.74rem] text-slate-300">
                  <StatusChip label="FULL SCREEN CHART" />
                  <span>Auto-indicator read stays on the page.</span>
                  <span>Use the TradingView workspace for deep chart work and manual confirmation.</span>
                </div>

                {shouldUseChartingLibrary ? (
                  <TradingViewChartingLibraryWorkspace
                    symbol={symbol}
                    displaySymbol={symbol}
                    selectedInterval={selectedInterval}
                    heightClassName="h-[calc(100vh-15rem)]"
                  />
                ) : tradingViewSymbol ? (
                  <TradingViewEmbedWorkspace
                    chartSymbol={tradingViewSymbol.widgetSymbol}
                    displaySymbol={symbol}
                    selectedInterval={selectedInterval}
                    heightClassName="h-[calc(100vh-15rem)]"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
