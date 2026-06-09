"use client";

import { useMemo } from "react";
import type { BrokerPosition } from "@/app/_lib/workspace-api";
import type { PriceMap } from "@/app/_lib/use-broker-prices";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number, digits = 2) {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits:  digits,
    maximumFractionDigits:  digits,
  });
}

function fmtPnl(pnl: number, currency: string) {
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  const abs = Math.abs(pnl);
  const formatted =
    abs >= 1_000
      ? `${sym}${(abs / 1000).toFixed(1)}k`
      : `${sym}${fmt(abs)}`;
  return pnl < 0 ? `-${formatted}` : `+${formatted}`;
}

function pnlClass(pnl: number) {
  if (pnl > 0) return "text-emerald-400";
  if (pnl < 0) return "text-red-400";
  return "text-slate-500";
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  positions: BrokerPosition[];
  /** Live prices from WebSocket — merges with the positions' currentPrice */
  livePrices?: PriceMap;
  loading?: boolean;
  error?: string | null;
  fetchedAt?: string | null;
  /** Compact mode for embedding inside a dropdown */
  compact?: boolean;
  className?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PositionsPanel({
  positions,
  livePrices = {},
  loading = false,
  error = null,
  fetchedAt = null,
  compact = false,
  className = "",
}: Props) {
  // Merge live WebSocket prices into position data
  const enriched = useMemo(
    () =>
      positions.map((p) => {
        const live = livePrices[p.symbol] ?? p.currentPrice;
        if (!live || live === p.currentPrice) return p;

        // Recompute unrealized P&L with live price
        const delta       = (live - p.avgEntryPrice) * (p.side === "short" ? -1 : 1);
        const uPnl        = delta * p.quantity;
        const uPnlPct     = p.avgEntryPrice > 0 ? (delta / p.avgEntryPrice) * 100 : 0;
        const marketValue = live * p.quantity;

        return { ...p, currentPrice: live, unrealizedPnl: uPnl, unrealizedPnlPct: uPnlPct, marketValue };
      }),
    [positions, livePrices],
  );

  if (loading && positions.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-[0.75rem] text-slate-500 ${className}`}>
        <span className="h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-slate-400" />
        Loading positions…
      </div>
    );
  }

  if (error) {
    return (
      <p className={`text-[0.72rem] text-red-400 ${className}`}>{error}</p>
    );
  }

  if (enriched.length === 0) {
    return (
      <p className={`text-[0.72rem] text-slate-600 ${className}`}>No open positions.</p>
    );
  }

  // Compact: small stacked list for dropdown
  if (compact) {
    return (
      <div className={`space-y-2 ${className}`}>
        {enriched.map((pos) => (
          <div key={pos.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[0.76rem] font-semibold text-slate-200">
                  {pos.symbol}
                </span>
                <span
                  className={`shrink-0 rounded px-1 py-0 text-[0.6rem] font-medium uppercase ${
                    pos.side === "long"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {pos.side}
                </span>
              </div>
              <p className="text-[0.65rem] text-slate-500">
                {fmt(pos.quantity, 4)} @ {fmt(pos.avgEntryPrice)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`tabular-nums text-[0.76rem] font-semibold ${pnlClass(pos.unrealizedPnl)}`}>
                {fmtPnl(pos.unrealizedPnl, pos.currency)}
              </p>
              <p className={`tabular-nums text-[0.65rem] ${pnlClass(pos.unrealizedPnlPct)}`}>
                {pos.unrealizedPnlPct >= 0 ? "+" : ""}{fmt(pos.unrealizedPnlPct)}%
              </p>
            </div>
          </div>
        ))}
        {fetchedAt && (
          <p className="text-[0.62rem] text-slate-700">
            Updated {new Date(fetchedAt).toLocaleTimeString()}
            {loading && " · refreshing…"}
          </p>
        )}
      </div>
    );
  }

  // Full table view
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-[0.8rem]">
        <thead>
          <tr className="border-b border-white/8 text-left">
            {["Symbol", "Side", "Qty", "Entry", "Current", "Mkt Value", "Unrealized P&L"].map((h) => (
              <th key={h} className="pb-2 pr-4 text-[0.67rem] font-medium text-slate-500 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {enriched.map((pos) => (
            <tr key={pos.id} className="group">
              <td className="py-2 pr-4 font-semibold text-slate-200">{pos.symbol}</td>
              <td className="py-2 pr-4">
                <span
                  className={`rounded px-1.5 py-0.5 text-[0.65rem] font-medium uppercase ${
                    pos.side === "long"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {pos.side}
                </span>
              </td>
              <td className="py-2 pr-4 tabular-nums text-slate-300">
                {fmt(pos.quantity, pos.quantity < 1 ? 6 : 2)}
              </td>
              <td className="py-2 pr-4 tabular-nums text-slate-400">{fmt(pos.avgEntryPrice)}</td>
              <td className="py-2 pr-4 tabular-nums text-slate-300">{fmt(pos.currentPrice)}</td>
              <td className="py-2 pr-4 tabular-nums text-slate-400">
                {fmtPnl(pos.marketValue, pos.currency).replace(/^[+-]/, "")}
              </td>
              <td className="py-2 pr-0 text-right">
                <span className={`tabular-nums font-semibold ${pnlClass(pos.unrealizedPnl)}`}>
                  {fmtPnl(pos.unrealizedPnl, pos.currency)}
                </span>
                <span className={`ml-1.5 tabular-nums text-[0.72rem] ${pnlClass(pos.unrealizedPnlPct)}`}>
                  ({pos.unrealizedPnlPct >= 0 ? "+" : ""}{fmt(pos.unrealizedPnlPct)}%)
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {fetchedAt && (
        <p className="mt-2 text-[0.65rem] text-slate-700">
          Updated {new Date(fetchedAt).toLocaleTimeString()}
          {loading && " · refreshing…"}
        </p>
      )}
    </div>
  );
}
