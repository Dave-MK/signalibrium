"use client";

import { useEffect, useMemo, useState } from "react";
import { supportedChartIntervals } from "@/app/_lib/market-data-contract";
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
import { Panel, StatusChip } from "./ui";

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

export function AssetLiveChartPanel({
  symbol,
  name,
  price,
  initialChart,
}: {
  symbol: string;
  name: string;
  price: number;
  initialChart?: LiveCandleSeries | null;
}) {
  const [selectedInterval, setSelectedInterval] = useState<SupportedChartInterval>("1h");
  const [chart, setChart] = useState<LiveCandleSeries | null>(initialChart ?? null);
  const [isLoading, setIsLoading] = useState(!initialChart);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Panel className="p-3 sm:p-3.5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="micro-label">Live Chart</p>
            <h2 className="mt-1.5 text-[1rem] font-semibold text-white sm:text-[1.1rem]">
              {symbol} / {name}
            </h2>
            <p className="mt-1 text-[0.8rem] leading-5 text-slate-400">
              Full live candlestick view with timeframe switching, OHLC structure, and provider-backed refresh.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.25">
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
          </div>
        </div>

        <div className="grid gap-1.25 sm:grid-cols-2 xl:grid-cols-4">
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
            <p className="mt-1 text-[0.74rem] text-slate-400">Visible chart range</p>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
            <p className="micro-label">Volume</p>
            <p className="mt-1.5 text-[0.92rem] font-semibold text-white">
              {chartStats ? formatNumber(chartStats.totalVolume, 0) : "Loading..."}
            </p>
            <p className="mt-1 text-[0.74rem] text-slate-400">Summed over visible candles</p>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
            <p className="micro-label">Updated</p>
            <p className="mt-1.5 text-[0.92rem] font-semibold text-white">
              {chart ? formatDateTimeLabel(chart.fetchedAt) : "Loading..."}
            </p>
            <p className="mt-1 text-[0.74rem] text-slate-400">Auto-refreshes while visible</p>
          </div>
        </div>

        {chart?.proxyNote || chart?.chartNote ? (
          <div className="signal-warning-surface rounded-[0.4rem] p-2.5">
            <p className="text-[0.78rem] font-semibold text-amber-100">
              {chart.chartNote ? "Chart Context" : "Proxy Mapping"}
            </p>
            <p className="mt-1 text-[0.78rem] leading-5 text-slate-300">
              {chart.chartNote ?? chart.proxyNote}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="signal-warning-surface rounded-[0.4rem] p-3">
            <p className="text-[0.82rem] font-semibold text-amber-100">Live chart unavailable</p>
            <p className="mt-1 text-[0.78rem] leading-5 text-slate-300">{error}</p>
          </div>
        ) : null}

        {isLoading && !chart ? (
          <div className="signal-surface rounded-[0.46rem] p-6 text-[0.84rem] text-slate-300">
            Loading live candlestick data...
          </div>
        ) : null}

        {chart?.candles?.length ? <CandleChart candles={chart.candles} /> : null}

        <div className="flex flex-wrap items-center gap-2 text-[0.72rem] text-slate-400">
          <StatusChip label="LIVE CHART" />
          <span>Interval: {selectedInterval}</span>
          <span>Candles: {chart?.candles.length ?? 0}</span>
        </div>
      </div>
    </Panel>
  );
}
