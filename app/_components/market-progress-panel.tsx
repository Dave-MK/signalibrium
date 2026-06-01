"use client";

import { useState } from "react";
import { deriveMarketProgress } from "../_lib/market-progress";
import { formatCurrency, formatNumber, formatPercent } from "../_lib/format";
import { Panel, StatusChip } from "./ui";
import { LabelWithTip } from "./help-tip";
import { Sparkline } from "./sparkline";

type MarketProgressAsset = {
  atr: number;
  change24h: number;
  liquidity: string;
  name: string;
  price: number;
  regime: string;
  score: number;
  sparkline: number[];
  symbol: string;
  volatility: string;
};

function IndicatorCard({
  label,
  tooltip,
  value,
  detail,
  tone = "text-white",
}: {
  label: string;
  tooltip: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
      <p className="micro-label">
        <LabelWithTip label={label} tooltip={tooltip} />
      </p>
      <p className={`mt-1.5 text-[0.92rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[0.74rem] leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

export function MarketProgressPanel({
  assets,
  description,
  title = "Market Progress",
}: {
  assets: MarketProgressAsset[];
  description?: string;
  title?: string;
}) {
  const [selectedSymbol, setSelectedSymbol] = useState(assets[0]?.symbol ?? "");
  const selectedAsset =
    assets.find((asset) => asset.symbol === selectedSymbol) ?? assets[0] ?? null;

  if (!selectedAsset) {
    return null;
  }

  const progress = deriveMarketProgress(selectedAsset);

  return (
    <Panel className="p-3 sm:p-3.5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="micro-label">{title}</p>
            <h2 className="mt-1.5 text-[1rem] font-semibold text-white sm:text-[1.1rem]">
              {selectedAsset.symbol} / {selectedAsset.name}
            </h2>
            {description ? (
              <p className="mt-1 text-[0.8rem] leading-5 text-slate-400">{description}</p>
            ) : null}
          </div>
          <StatusChip label={selectedAsset.regime.toUpperCase()} />
        </div>

        {assets.length > 1 ? (
          <div className="flex flex-wrap gap-1.25">
            {assets.map((asset) => (
              <button
                key={asset.symbol}
                type="button"
                onClick={() => setSelectedSymbol(asset.symbol)}
                className={`rounded-[0.4rem] px-2.5 py-1.5 text-[0.74rem] font-semibold transition ${
                  asset.symbol === selectedAsset.symbol
                    ? "signal-accent-surface text-white"
                    : "signal-surface-soft text-slate-300 hover:text-white"
                }`}
              >
                {asset.symbol}
              </button>
            ))}
          </div>
        ) : null}

        <div className="signal-surface rounded-[0.46rem] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[1.42rem] font-semibold text-white">
                {formatCurrency(selectedAsset.price)}
              </p>
              <p
                className={`mt-1 text-[0.82rem] font-medium ${
                  selectedAsset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {formatPercent(selectedAsset.change24h, true)} over 24h
              </p>
            </div>
            <div className="text-right text-[0.74rem] text-slate-400">
              <p>High {formatCurrency(progress.highest)}</p>
              <p className="mt-1">Low {formatCurrency(progress.lowest)}</p>
            </div>
          </div>
          <Sparkline data={selectedAsset.sparkline} className="mt-4 h-36 w-full sm:h-44" />
          <div className="mt-2 flex justify-between text-[0.66rem] text-slate-500">
            <span>Start</span>
            <span>Mid-session</span>
            <span>Now</span>
          </div>
        </div>

        <div className="grid gap-1.25 sm:grid-cols-2 xl:grid-cols-3">
          <IndicatorCard
            label="Trend Bias"
            tooltip="A simple read of whether the tracked price path is advancing, falling, or moving sideways."
            value={progress.trendBias}
            detail={progress.structureState}
            tone={progress.trendBias === "Uptrend" ? "text-emerald-300" : progress.trendBias === "Downtrend" ? "text-red-300" : "text-slate-100"}
          />
          <IndicatorCard
            label="Momentum"
            tooltip="Percent move from the start of the tracked line to the latest point."
            value={formatPercent(progress.momentum, true)}
            detail="Change across the visible path"
            tone={progress.momentum >= 0 ? "text-emerald-300" : "text-red-300"}
          />
          <IndicatorCard
            label="ATR"
            tooltip="Average True Range. A volatility measure showing how much the asset typically moves per bar."
            value={formatNumber(selectedAsset.atr)}
            detail={selectedAsset.volatility}
            tone="text-cyan-200"
          />
          <IndicatorCard
            label="Range"
            tooltip="The distance between the highest and lowest visible points, normalized against current price."
            value={formatPercent(progress.normalizedRange)}
            detail="Visible path expansion"
            tone="text-slate-100"
          />
          <IndicatorCard
            label="Liquidity"
            tooltip="How easily the asset can usually be entered or exited without large slippage."
            value={selectedAsset.liquidity}
            detail="Execution quality context"
            tone="text-slate-100"
          />
          <IndicatorCard
            label="Signal Score"
            tooltip="Internal rank score combining structure quality, regime fit, and execution conditions."
            value={String(selectedAsset.score)}
            detail={progress.indicatorRead}
            tone="text-cyan-200"
          />
        </div>
      </div>
    </Panel>
  );
}
