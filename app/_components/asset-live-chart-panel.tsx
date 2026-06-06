"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { supportedChartIntervals } from "@/app/_lib/market-data-contract";
import { getTradingViewSymbolDefinition, listTradingViewWatchlistSymbols } from "@/app/_lib/tradingview-symbols";
import { deriveChartAnalysis } from "@/app/_lib/chart-analysis";
import {
  buildPreferredEntryZone,
  getEntryDecision as getBotEntryDecision,
  inferDirection,
} from "@/app/_lib/bot-engine";
import {
  formatCurrency as formatCurrencyStatic,
  formatChartAxisLabel,
  formatDateTimeLabel,
  formatNumber,
  formatPercent,
} from "@/app/_lib/format";
import { analyzeScannerResult, fetchMarketChart } from "@/app/_lib/workspace-api";
import type { PricedAssetClass } from "@/app/_lib/market-prices";
import type {
  OpportunityAnalysisSnapshot,
  PersistedScannerResult,
} from "@/app/_lib/server/workspace-types";
import type {
  LiveCandle,
  LiveCandleSeries,
  SupportedChartInterval,
} from "@/app/_lib/server/market-data/provider-types";
import { TradingViewChartingLibraryWorkspace } from "./tradingview-charting-library-workspace";
import { useDisplayCurrency } from "./display-currency-provider";
import { Panel, StatusChip } from "./ui";

const intervalMap: Record<SupportedChartInterval, string> = {
  "1min": "1",
  "15min": "15",
  "1h": "60",
  "4h": "240",
  "1day": "D",
};

const chartOverlayPalette = {
  bullishCandle: "#22c55e",
  bearishCandle: "#ef4444",
  ema20: "#22d3ee",
  ema50: "#f59e0b",
  demandZone: "rgba(34, 197, 94, 0.16)",
  supplyZone: "rgba(249, 115, 22, 0.16)",
  entryZone: "rgba(56, 189, 248, 0.14)",
  support: "rgba(45, 212, 191, 0.92)",
  resistance: "rgba(251, 113, 133, 0.92)",
  target: "rgba(163, 230, 53, 0.96)",
  stop: "rgba(248, 113, 113, 0.96)",
  trendline: "rgba(250, 204, 21, 0.96)",
  consolidation: "rgba(168, 85, 247, 0.16)",
  consolidationStroke: "rgba(196, 181, 253, 0.32)",
} as const;

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

function ChartLegendItem({
  label,
  color,
  style = "line",
}: {
  label: string;
  color: string;
  style?: "line" | "dot" | "area";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex shrink-0 ${style === "line" ? "h-[2px] w-4 rounded-full" : style === "area" ? "h-3 w-3 rounded-[3px] border border-white/10" : "h-2.5 w-2.5 rounded-full"}`}
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function CompactAnalysisChart({
  candles,
  analysis,
  analysisOverlay,
  onSelectInterval,
  selectedInterval,
  selectedOpportunityLabel,
}: {
  candles: LiveCandle[];
  analysis: ReturnType<typeof deriveChartAnalysis>;
  analysisOverlay: OpportunityAnalysisSnapshot | null;
  onSelectInterval: (interval: SupportedChartInterval) => void;
  selectedInterval: SupportedChartInterval;
  selectedOpportunityLabel?: string | null;
}) {
  const chartWidth = 960;
  const chartHeight = 360;
  const padding = { top: 24, right: 62, bottom: 30, left: 58 };
  const pricePanelHeight = 268;
  const innerWidth = chartWidth - padding.left - padding.right;
  const [hoverState, setHoverState] = useState<{ index: number; y: number } | null>(null);
  const desiredVisibleCandleCount =
    selectedInterval === "15min" ? 48 : selectedInterval === "1h" ? 60 : 72;
  const visibleCandles = candles.slice(-Math.min(desiredVisibleCandleCount, candles.length));
  const visibleEma20 = analysis.ema20.slice(-visibleCandles.length);
  const visibleEma50 = analysis.ema50.slice(-visibleCandles.length);
  const priceTop = padding.top;
  const chartLeft = padding.left;
  const priceValues = [
    ...visibleCandles.flatMap((candle) => [candle.high, candle.low]),
    ...visibleEma20.filter((value): value is number => value !== null),
    ...visibleEma50.filter((value): value is number => value !== null),
  ];
  const rawPriceMax = Math.max(...priceValues);
  const rawPriceMin = Math.min(...priceValues);
  const rawPriceRange = Math.max(rawPriceMax - rawPriceMin, 0.0001);
  const pricePadding = rawPriceRange * 0.1;
  const priceMax = rawPriceMax + pricePadding;
  const priceMin = rawPriceMin - pricePadding;
  const priceRange = Math.max(priceMax - priceMin, 0.0001);
  const candleSlot = innerWidth / visibleCandles.length;
  const candleBodyWidth = Math.max(6, Math.min(14, candleSlot * 0.54));

  const scalePriceY = (value: number) =>
    priceTop + ((priceMax - value) / priceRange) * pricePanelHeight;
  const tickLabels = visibleCandles.filter(
    (_, index) => index % Math.ceil(visibleCandles.length / 6) === 0,
  );
  const overlay = analysisOverlay?.chartAnnotations ?? null;
  const guideValues = [
    priceMax,
    priceMax - priceRange * 0.25,
    priceMax - priceRange * 0.5,
    priceMax - priceRange * 0.75,
    priceMin,
  ];

  function scaleIndex(index: number) {
    const adjustedIndex = Math.max(index - (candles.length - visibleCandles.length), 0);
    return chartLeft + candleSlot * adjustedIndex + candleSlot / 2;
  }

  function handleMouseMove(event: ReactMouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleX = chartWidth / bounds.width;
    const scaleY = chartHeight / bounds.height;
    const relativeX = (event.clientX - bounds.left) * scaleX;
    const relativeY = (event.clientY - bounds.top) * scaleY;
    const clampedIndex = Math.min(
      visibleCandles.length - 1,
      Math.max(0, Math.round((relativeX - chartLeft - candleSlot / 2) / candleSlot)),
    );
    const clampedY = Math.min(
      priceTop + pricePanelHeight,
      Math.max(priceTop, relativeY),
    );

    setHoverState({ index: clampedIndex, y: clampedY });
  }

  const hoveredIndex = hoverState?.index ?? visibleCandles.length - 1;
  const hoveredCandle = visibleCandles[hoveredIndex];
  const hoverX = chartLeft + candleSlot * hoveredIndex + candleSlot / 2;
  const hoverY = hoverState?.y ?? scalePriceY(hoveredCandle?.close ?? visibleCandles[visibleCandles.length - 1].close);
  const hoveredPrice =
    priceMax - ((hoverY - priceTop) / pricePanelHeight) * priceRange;
  const hoveredChange =
    hoveredCandle && hoveredIndex > 0
      ? hoveredCandle.close - visibleCandles[hoveredIndex - 1].close
      : 0;
  const hoveredPercent =
    hoveredCandle && hoveredIndex > 0 && visibleCandles[hoveredIndex - 1].close > 0
      ? (hoveredChange / visibleCandles[hoveredIndex - 1].close) * 100
      : 0;

  return (
    <div className="signal-surface overflow-hidden rounded-[0.46rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_32%),linear-gradient(180deg,_rgba(8,17,29,0.98),_rgba(4,10,18,0.98))] p-3">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-slate-300">
            <ChartLegendItem label="Bull candles" color={chartOverlayPalette.bullishCandle} style="dot" />
            <ChartLegendItem label="Bear candles" color={chartOverlayPalette.bearishCandle} style="dot" />
            <ChartLegendItem label="EMA 20" color={chartOverlayPalette.ema20} />
            <ChartLegendItem label="EMA 50" color={chartOverlayPalette.ema50} />
            {analysisOverlay ? (
              <>
                <ChartLegendItem label="Demand" color={chartOverlayPalette.demandZone} style="area" />
                <ChartLegendItem label="Supply" color={chartOverlayPalette.supplyZone} style="area" />
                <ChartLegendItem label="Entry zone" color={chartOverlayPalette.entryZone} style="area" />
                <ChartLegendItem label="Support" color={chartOverlayPalette.support} />
                <ChartLegendItem label="Resistance" color={chartOverlayPalette.resistance} />
                <ChartLegendItem label="Trendline" color={chartOverlayPalette.trendline} />
                <ChartLegendItem label="Target" color={chartOverlayPalette.target} />
                <ChartLegendItem label="Stop" color={chartOverlayPalette.stop} />
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-slate-400">
            <StatusChip label={`VIEW ${selectedInterval.toUpperCase()}`} />
            <span>{visibleCandles.length} candles on screen</span>
            {selectedOpportunityLabel ? <span>{selectedOpportunityLabel}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.25 rounded-[0.44rem] border border-white/10 bg-white/[0.03] p-1">
          {supportedChartIntervals.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onSelectInterval(item)}
              className={`rounded-[0.34rem] px-2.5 py-1.25 text-[0.72rem] font-semibold transition ${
                item === selectedInterval
                  ? "signal-accent-surface text-white"
                  : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverState(null)}
      >
        <rect x="0" y={priceTop} width={chartWidth} height={pricePanelHeight} fill="rgba(8, 13, 23, 0.35)" rx="8" />

        {guideValues.map((value) => {
          const y = scalePriceY(value);

          return (
            <g key={`price-guide-${value}`}>
              <line
                x1={chartLeft}
                x2={chartWidth - padding.right}
                y1={y}
                y2={y}
                stroke="rgba(148, 163, 184, 0.08)"
              />
              <text
                x={chartLeft - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(148, 163, 184, 0.88)"
              >
                {formatCurrencyStatic(value)}
              </text>
            </g>
          );
        })}

        {visibleCandles.map((candle, index) => {
          const x = chartLeft + candleSlot * index + candleSlot / 2;
          const openY = scalePriceY(candle.open);
          const closeY = scalePriceY(candle.close);
          const highY = scalePriceY(candle.high);
          const lowY = scalePriceY(candle.low);
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(7, Math.abs(closeY - openY));
          const isBullish = candle.close >= candle.open;
          const bodyFill = isBullish ? `${chartOverlayPalette.bullishCandle}F2` : `${chartOverlayPalette.bearishCandle}F2`;
          const bodyStroke = isBullish ? "rgba(134, 239, 172, 0.7)" : "rgba(254, 202, 202, 0.7)";
          const wickStroke = isBullish ? "rgba(74, 222, 128, 0.84)" : "rgba(252, 165, 165, 0.84)";

          return (
            <g key={`${candle.datetime}-${index}`}>
              <line x1={x} x2={x} y1={highY} y2={lowY} stroke={wickStroke} strokeWidth="1.4" />
              <rect
                x={x - candleBodyWidth / 2}
                y={bodyY}
                width={candleBodyWidth}
                height={bodyHeight}
                rx="1.2"
                fill={bodyFill}
                stroke={bodyStroke}
                strokeWidth="0.9"
              />
            </g>
          );
        })}

        {overlay ? (
          <>
            <rect
              x={chartLeft}
              y={scalePriceY(overlay.demandZone.high)}
              width={innerWidth}
              height={Math.max(4, scalePriceY(overlay.demandZone.low) - scalePriceY(overlay.demandZone.high))}
              fill={chartOverlayPalette.demandZone}
            />
            <rect
              x={chartLeft}
              y={scalePriceY(overlay.supplyZone.high)}
              width={innerWidth}
              height={Math.max(4, scalePriceY(overlay.supplyZone.low) - scalePriceY(overlay.supplyZone.high))}
              fill={chartOverlayPalette.supplyZone}
            />
            <rect
              x={chartLeft}
              y={scalePriceY(overlay.entryZone.high)}
              width={innerWidth}
              height={Math.max(4, scalePriceY(overlay.entryZone.low) - scalePriceY(overlay.entryZone.high))}
              fill={chartOverlayPalette.entryZone}
            />
            <text
              x={chartLeft + 8}
              y={scalePriceY(overlay.supplyZone.high) + 13}
              fontSize="10"
              fill={chartOverlayPalette.supplyZone.replace("0.16", "0.96")}
            >
              Supply zone
            </text>
            <text
              x={chartLeft + 8}
              y={scalePriceY(overlay.demandZone.high) + 13}
              fontSize="10"
              fill={chartOverlayPalette.demandZone.replace("0.16", "0.96")}
            >
              Demand zone
            </text>
            <text
              x={chartLeft + 96}
              y={scalePriceY(overlay.entryZone.high) - 8}
              fontSize="10"
              fill="rgba(125, 211, 252, 0.96)"
            >
              Entry zone
            </text>
            {overlay.consolidationRange ? (
              <rect
                x={chartLeft + innerWidth * 0.58}
                y={scalePriceY(overlay.consolidationRange.high)}
                width={innerWidth * 0.36}
                height={Math.max(
                  4,
                  scalePriceY(overlay.consolidationRange.low) - scalePriceY(overlay.consolidationRange.high),
                )}
                fill={chartOverlayPalette.consolidation}
                stroke={chartOverlayPalette.consolidationStroke}
              />
            ) : null}
            {overlay.supportLevels.slice(0, 2).map((level, index) => (
              <g key={`support-${level}`}>
                <line
                  x1={chartLeft}
                  x2={chartWidth - padding.right}
                  y1={scalePriceY(level)}
                  y2={scalePriceY(level)}
                  stroke={chartOverlayPalette.support}
                  strokeWidth={index === 0 ? "1.4" : "1"}
                />
                <text
                  x={chartWidth - padding.right - 4}
                  y={scalePriceY(level) - 4}
                  textAnchor="end"
                  fontSize="10"
                  fill={chartOverlayPalette.support}
                >
                  {index === 0 ? "Support" : "S2"}
                </text>
              </g>
            ))}
            {overlay.resistanceLevels.slice(0, 2).map((level, index) => (
              <g key={`resistance-${level}`}>
                <line
                  x1={chartLeft}
                  x2={chartWidth - padding.right}
                  y1={scalePriceY(level)}
                  y2={scalePriceY(level)}
                  stroke={chartOverlayPalette.resistance}
                  strokeWidth={index === 0 ? "1.4" : "1"}
                />
                <text
                  x={chartWidth - padding.right - 4}
                  y={scalePriceY(level) - 4}
                  textAnchor="end"
                  fontSize="10"
                  fill={chartOverlayPalette.resistance}
                >
                  {index === 0 ? "Resistance" : "R2"}
                </text>
              </g>
            ))}
            <line
              x1={chartLeft}
              x2={chartWidth - padding.right}
              y1={scalePriceY((overlay.entryZone.low + overlay.entryZone.high) / 2)}
              y2={scalePriceY((overlay.entryZone.low + overlay.entryZone.high) / 2)}
              stroke="rgba(56, 189, 248, 0.9)"
              strokeWidth="1.4"
            />
            <line
              x1={chartLeft}
              x2={chartWidth - padding.right}
              y1={scalePriceY(overlay.stopLevel)}
              y2={scalePriceY(overlay.stopLevel)}
              stroke={chartOverlayPalette.stop}
              strokeWidth="1.4"
            />
            <line
              x1={chartLeft}
              x2={chartWidth - padding.right}
              y1={scalePriceY(overlay.targetLevel)}
              y2={scalePriceY(overlay.targetLevel)}
              stroke={chartOverlayPalette.target}
              strokeWidth="1.4"
            />
            {overlay.trendline ? (
              <line
                x1={scaleIndex(overlay.trendline.startIndex)}
                x2={scaleIndex(overlay.trendline.endIndex)}
                y1={scalePriceY(overlay.trendline.startPrice)}
                y2={scalePriceY(overlay.trendline.endPrice)}
                stroke={chartOverlayPalette.trendline}
                strokeWidth="2"
              />
            ) : null}
          </>
        ) : null}

        <path
          d={buildLinePath(visibleEma20, innerWidth, scalePriceY)}
          transform={`translate(${chartLeft}, 0)`}
          fill="none"
          stroke={chartOverlayPalette.ema20}
          strokeWidth="1.8"
        />
        <path
          d={buildLinePath(visibleEma50, innerWidth, scalePriceY)}
          transform={`translate(${chartLeft}, 0)`}
          fill="none"
          stroke={chartOverlayPalette.ema50}
          strokeWidth="1.8"
        />

        <line
          x1={hoverX}
          x2={hoverX}
          y1={priceTop}
          y2={priceTop + pricePanelHeight}
          stroke="rgba(148, 163, 184, 0.55)"
          strokeWidth="1"
        />
        <line
          x1={chartLeft}
          x2={chartWidth - padding.right}
          y1={hoverY}
          y2={hoverY}
          stroke="rgba(148, 163, 184, 0.4)"
          strokeWidth="1"
        />
        <rect
          x={chartWidth - 92}
          y={hoverY - 10}
          width={78}
          height={18}
          rx="4"
          fill="rgba(8, 13, 23, 0.94)"
          stroke="rgba(71, 85, 105, 0.65)"
        />
        <text
          x={chartWidth - 53}
          y={hoverY + 3}
          textAnchor="middle"
          fontSize="10"
          fill="rgba(226, 232, 240, 0.95)"
        >
          {formatCurrencyStatic(hoveredPrice)}
        </text>

        {tickLabels.map((candle, index) => {
          const actualIndex = visibleCandles.findIndex((item) => item.datetime === candle.datetime);
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
              {formatChartAxisLabel(candle.datetime, visibleCandles.length <= 32)}
            </text>
          );
        })}

        <text x={chartLeft + 4} y={priceTop - 6} fontSize="11" fill="rgba(148, 163, 184, 0.9)">
          Bigger picture view · last {visibleCandles.length} {selectedInterval} candles
        </text>
        {overlay ? (
          <>
            <text x={chartWidth - 220} y={priceTop - 6} fontSize="11" fill="rgba(56, 189, 248, 0.95)">Entry</text>
            <text x={chartWidth - 170} y={priceTop - 6} fontSize="11" fill={chartOverlayPalette.target}>Target</text>
            <text x={chartWidth - 118} y={priceTop - 6} fontSize="11" fill={chartOverlayPalette.stop}>Stop</text>
          </>
        ) : null}

        <rect
          x={chartLeft + 2}
          y={priceTop + 8}
          width={274}
          height={52}
          rx="6"
          fill="rgba(8, 13, 23, 0.94)"
          stroke="rgba(71, 85, 105, 0.55)"
        />
        <text x={chartLeft + 12} y={priceTop + 22} fontSize="10" fill="rgba(226, 232, 240, 0.95)">
          {hoveredCandle ? formatDateTimeLabel(hoveredCandle.datetime) : ""}
        </text>
        <text x={chartLeft + 12} y={priceTop + 36} fontSize="10" fill="rgba(148, 163, 184, 0.96)">
          {hoveredCandle
            ? `O ${formatCurrencyStatic(hoveredCandle.open)}  H ${formatCurrencyStatic(hoveredCandle.high)}  L ${formatCurrencyStatic(hoveredCandle.low)}  C ${formatCurrencyStatic(hoveredCandle.close)}`
            : ""}
        </text>
        <text
          x={chartLeft + 12}
          y={priceTop + 50}
          fontSize="10"
          fill={hoveredChange >= 0 ? "rgba(110, 231, 183, 0.96)" : "rgba(252, 165, 165, 0.96)"}
        >
          {hoveredCandle
            ? `${formatPercent(hoveredPercent, true)}  Vol ${formatNumber(hoveredCandle.volume ?? 0, 0)}`
            : ""}
        </text>
      </svg>

      {analysisOverlay ? (
        <p className="mt-2 text-[0.72rem] leading-5 text-slate-400">
          Entry, target, and stop belong to{" "}
          <span className="font-medium text-slate-200">{selectedOpportunityLabel ?? "the selected opportunity"}</span>.
          Entry marks the preferred trade zone, target shows the first profit objective, and stop marks the invalidation level.
        </p>
      ) : null}
    </div>
  );
}

function IndicatorSignalCard({
  label,
  tone,
  value,
  explanation,
  timeframe,
}: {
  label: string;
  tone: string;
  value: string;
  explanation: string;
  timeframe: string;
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
      <p className="mt-1 text-[0.74rem] leading-5 text-slate-400">{timeframe} / {explanation}</p>
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
    let isDisposed = false;
    let mountFrameId: number | null = null;
    let loadingTimeoutId: number | null = null;

    if (!host) {
      return;
    }

    setIsLoading(true);
    setError(null);
    host.replaceChildren();

    mountFrameId = window.requestAnimationFrame(() => {
      if (isDisposed || !host.isConnected) {
        return;
      }

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
      script.text = JSON.stringify({
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
        if (isDisposed || !host.isConnected) {
          return;
        }

        loadingTimeoutId = window.setTimeout(() => {
          if (!isDisposed) {
            setIsLoading(false);
          }
        }, 600);
      };

      script.onerror = () => {
        if (isDisposed) {
          return;
        }

        setError("TradingView tools could not load in this environment.");
        setIsLoading(false);
      };

      wrapper.appendChild(widget);
      wrapper.appendChild(copyright);
      wrapper.appendChild(script);
      host.replaceChildren(wrapper);
    });

    return () => {
      isDisposed = true;

      if (mountFrameId !== null) {
        window.cancelAnimationFrame(mountFrameId);
      }

      if (loadingTimeoutId !== null) {
        window.clearTimeout(loadingTimeoutId);
      }

      host.replaceChildren();
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
  assetClass = "Crypto",
  analysisOverlay,
  chartVendor,
  chartingLibraryAvailable,
  selectedOpportunityId,
  selectedOpportunityLabel,
  symbol,
  name,
  price,
  initialChart,
}: {
  assetClass?: PricedAssetClass;
  analysisOverlay?: OpportunityAnalysisSnapshot | null;
  chartVendor: "embed" | "charting_library";
  chartingLibraryAvailable: boolean;
  selectedOpportunityId?: string | null;
  selectedOpportunityLabel?: string | null;
  symbol: string;
  name: string;
  price: number;
  initialChart?: LiveCandleSeries | null;
}) {
  const router = useRouter();
  const { formatPrice: formatCurrencyDisplay } = useDisplayCurrency();
  const [selectedInterval, setSelectedInterval] = useState<SupportedChartInterval>("1h");
  const [chart, setChart] = useState<LiveCandleSeries | null>(initialChart ?? null);
  const [isLoading, setIsLoading] = useState(!initialChart);
  const [isFullAnalysisOpen, setIsFullAnalysisOpen] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [analysisRefreshNote, setAnalysisRefreshNote] = useState<string | null>(null);
  const [analysisOverride, setAnalysisOverride] = useState<{
    analysis: OpportunityAnalysisSnapshot | null;
    setupId: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tradingViewSymbol = getTradingViewSymbolDefinition(symbol);
  const shouldUseChartingLibrary = chartVendor === "charting_library" && chartingLibraryAvailable;
  const showChartingLibrarySetupNotice =
    chartVendor === "charting_library" && !chartingLibraryAvailable;
  const liveAnalysisOverlay =
    analysisOverride?.setupId === (selectedOpportunityId ?? null)
      ? analysisOverride.analysis
      : (analysisOverlay ?? null);

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
  const liveEntryDecision = useMemo(() => {
    if (!liveAnalysisOverlay || !chart?.candles?.length) {
      return null;
    }

    const syntheticSetup = {
      id: selectedOpportunityId ?? `${symbol.toLowerCase()}-live-read`,
      symbol,
      strategy: selectedOpportunityLabel ?? "Live read",
      timeframe: selectedInterval,
      score: 80,
      riskScore: 30,
      regime: "Balanced",
      entryZone: `${formatCurrencyDisplay(liveAnalysisOverlay.chartAnnotations.entryZone.low, assetClass)} - ${formatCurrencyDisplay(liveAnalysisOverlay.chartAnnotations.entryZone.high, assetClass)}`,
      stopLoss: formatCurrencyDisplay(liveAnalysisOverlay.chartAnnotations.stopLevel, assetClass),
      takeProfit: formatCurrencyDisplay(liveAnalysisOverlay.chartAnnotations.targetLevel, assetClass),
      riskReward: 2,
      liquidityStatus: "High",
      tradeability: "TRADEABLE",
      assetClass,
      thesis: "",
      linkedAssetSymbol: symbol,
      linkedBacktestId: null,
      analysisStatus: "Analysed",
      analysisUpdatedAt: liveAnalysisOverlay.analyzedAt,
      analysis: liveAnalysisOverlay,
      createdAt: liveAnalysisOverlay.analyzedAt,
      updatedAt: liveAnalysisOverlay.analyzedAt,
    } satisfies PersistedScannerResult;
    const livePrice = chart.candles[chart.candles.length - 1]?.close ?? price;
    const direction = inferDirection(syntheticSetup);
    const preferredZone = buildPreferredEntryZone(syntheticSetup, direction);
    const decision = getBotEntryDecision(livePrice, syntheticSetup);

    return {
      ...decision,
      detail: preferredZone
        ? `${decision.detail} Better fill pocket: ${formatCurrencyDisplay(preferredZone.low, assetClass)} - ${formatCurrencyDisplay(preferredZone.high, assetClass)}.`
        : decision.detail,
    };
  }, [
    assetClass,
    chart,
    formatCurrencyDisplay,
    liveAnalysisOverlay,
    price,
    selectedInterval,
    selectedOpportunityId,
    selectedOpportunityLabel,
    symbol,
  ]);

  async function handleReanalyze() {
    if (!selectedOpportunityId) {
      return;
    }

    try {
      setIsReanalyzing(true);
      setError(null);
      setAnalysisRefreshNote(null);
      const nextSetup = await analyzeScannerResult(selectedOpportunityId);
      setAnalysisOverride({
        analysis: nextSetup.analysis ?? null,
        setupId: selectedOpportunityId,
      });

      const refreshedChart = await fetchMarketChart(
        symbol,
        selectedInterval,
        selectedInterval === "15min" ? 64 : 48,
      );
      setChart(refreshedChart);
      setAnalysisRefreshNote(
        `Analysis refreshed ${new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })}.`,
      );
      startTransition(() => router.refresh());
    } catch (reanalyzeError) {
      setError(
        reanalyzeError instanceof Error
          ? reanalyzeError.message
          : "Unable to refresh chart analysis.",
      );
    } finally {
      setIsReanalyzing(false);
    }
  }

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
              Start with a tighter indicator-led read, then pop into a full-screen chart workspace when you want deeper structure and timing analysis.
            </p>
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
            <CompactAnalysisChart
              candles={chart.candles}
              analysis={analysis}
              analysisOverlay={liveAnalysisOverlay}
              onSelectInterval={setSelectedInterval}
              selectedInterval={selectedInterval}
              selectedOpportunityLabel={selectedOpportunityLabel ?? null}
            />

            <div className="signal-toolbar-card flex flex-wrap items-center justify-between gap-2 rounded-[0.46rem] px-2.5 py-2 text-[0.74rem] text-slate-300">
              <div className="flex flex-wrap items-center gap-1.25">
                <StatusChip label={`ACTIVE ${selectedInterval.toUpperCase()}`} />
                <span>The timeframe controls now sit in the chart header for faster switching.</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.25">
                {selectedOpportunityId ? (
                  <button
                    type="button"
                    onClick={() => void handleReanalyze()}
                    disabled={isReanalyzing}
                    className="signal-surface-soft rounded-[0.4rem] px-3 py-1.5 text-[0.76rem] font-semibold text-white disabled:opacity-50"
                  >
                    {isReanalyzing ? "Re-analysing..." : "Re-analyse"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsFullAnalysisOpen(true)}
                  className="signal-button rounded-[0.46rem] px-3 py-1.5 text-[0.76rem] font-semibold"
                >
                  Open Full Analysis
                </button>
              </div>
            </div>
            {analysisRefreshNote ? (
              <p className="text-[0.74rem] text-emerald-200">{analysisRefreshNote}</p>
            ) : null}

            <div className="signal-accent-surface rounded-[0.46rem] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="micro-label">Overall Read</p>
                  <p className="mt-1.5 text-[1rem] font-semibold text-white">
                    {analysis.overall.bias}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusChip label={selectedInterval} />
                  {liveEntryDecision ? <StatusChip label={liveEntryDecision.label} /> : null}
                </div>
              </div>
              <p className="mt-2 text-[0.82rem] leading-5 text-slate-200">
                {analysis.overall.summary}
              </p>
              {liveEntryDecision ? (
                <p className={`mt-2 text-[0.78rem] font-medium ${liveEntryDecision.tone}`}>
                  {liveEntryDecision.detail}
                </p>
              ) : null}
            </div>

            <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
              {analysis.signalCards.map((card) => (
                <IndicatorSignalCard
                  key={card.label}
                  label={card.label}
                  tone={card.tone}
                  timeframe={selectedInterval}
                  value={
                    card.label === "MACD"
                      ? formatNumber(card.value ?? 0, 3)
                      : card.label === "RSI 14"
                        ? formatNumber(card.value ?? 0, 1)
                        : formatCurrencyDisplay(card.value ?? 0, assetClass)
                  }
                  explanation={card.explanation}
                />
              ))}
            </div>

            {liveAnalysisOverlay ? (
              <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
                <IndicatorSignalCard
                  label="Support"
                  tone="Constructive"
                  timeframe={selectedInterval}
                  value={liveAnalysisOverlay.supportLevels.join(" / ")}
                  explanation={`Demand zone ${liveAnalysisOverlay.demandZone}`}
                />
                <IndicatorSignalCard
                  label="Resistance"
                  tone="Soft"
                  timeframe={selectedInterval}
                  value={liveAnalysisOverlay.resistanceLevels.join(" / ")}
                  explanation={`Supply zone ${liveAnalysisOverlay.supplyZone}`}
                />
                <IndicatorSignalCard
                  label="Trendline"
                  tone="Balanced"
                  timeframe={selectedInterval}
                  value={liveAnalysisOverlay.chartAnnotations.trendline ? "Drawn" : "None"}
                  explanation={liveAnalysisOverlay.trendlineSummary}
                />
                <IndicatorSignalCard
                  label="Consolidation"
                  tone="Balanced"
                  timeframe={selectedInterval}
                  value={liveAnalysisOverlay.chartAnnotations.consolidationRange ? "Active" : "Loose"}
                  explanation={liveAnalysisOverlay.consolidation}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
          <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
            <p className="micro-label">Last</p>
            <p className="mt-1.5 text-[1rem] font-semibold text-white">
              {chartStats ? formatCurrencyDisplay(chartStats.latest.close, assetClass) : formatCurrencyDisplay(price, assetClass)}
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
              {chartStats ? `${formatCurrencyDisplay(chartStats.low, assetClass)} - ${formatCurrencyDisplay(chartStats.high, assetClass)}` : "Loading..."}
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
                  Use the full chart for indicator inspection, drawings, compare mode, and a deeper market read.
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
