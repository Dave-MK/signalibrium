"use client";

import { useState } from "react";
import { formatInstrumentPriceForDisplay } from "@/app/_lib/currency";
import type { PricedAssetClass } from "@/app/_lib/market-prices";
import { formatDateTimeLabel, formatPercent } from "@/app/_lib/format";
import { StatusChip } from "@/app/_components/ui";
import { InlineNoteButton } from "@/app/_components/trade-note-form";
import type {
  PersistedJournalEntry,
  PersistedPredictionHistoryRecord,
  SupportedDisplayCurrency,
  TradeNoteOutcome,
} from "@/app/_lib/server/workspace-types";

// ─── local helpers (duplicated from page so this file is self-contained) ─────

function OutcomeChip({ outcome }: { outcome: string }) {
  if (outcome === "Hit Target")
    return <span className="inline-flex items-center rounded-[0.3rem] bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">WIN</span>;
  if (outcome === "Stopped")
    return <span className="inline-flex items-center rounded-[0.3rem] bg-red-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-red-300 ring-1 ring-red-500/30">LOSS</span>;
  if (outcome === "Breakeven")
    return <span className="inline-flex items-center rounded-[0.3rem] bg-slate-600/30 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-300 ring-1 ring-slate-500/30">BREAKEVEN</span>;
  if (outcome === "Monitoring")
    return <span className="inline-flex items-center rounded-[0.3rem] bg-cyan-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-cyan-400 ring-1 ring-cyan-500/20">LIVE</span>;
  return <span className="inline-flex items-center rounded-[0.3rem] bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 ring-1 ring-white/8">{outcome.toUpperCase()}</span>;
}

function ResolutionEvidence({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-1 text-[0.72rem] leading-4 text-cyan-200">{text}</p>;
}

function outcomeToNoteOutcome(outcome: string): TradeNoteOutcome | undefined {
  if (outcome === "Hit Target") return "Win";
  if (outcome === "Stopped")    return "Loss";
  if (outcome === "Breakeven")  return "Breakeven";
  return undefined;
}

// ─── types ────────────────────────────────────────────────────────────────────

type OutcomeFilter = "All" | "Hit Target" | "Stopped" | "Breakeven" | "Monitoring" | "Skipped" | "Traded";
type CurrencyRateMap = Record<string, number>;

type Props = {
  items:    PersistedPredictionHistoryRecord[];
  notes:    Record<string, PersistedJournalEntry>;
  currency: SupportedDisplayCurrency;
  rates:    CurrencyRateMap;
};

const PAGE_SIZE = 30;

// ─── component ────────────────────────────────────────────────────────────────

export function HistoryTableClient({ items, notes, currency, rates }: Props) {
  const [search,        setSearch]        = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("All");
  const [shown,         setShown]         = useState(PAGE_SIZE);

  const q = search.trim().toLowerCase();

  const filtered = items.filter((item) => {
    // Search: symbol or instrumentName
    if (q && !item.symbol.toLowerCase().includes(q) && !item.instrumentName.toLowerCase().includes(q)) return false;
    // Outcome filter
    if (outcomeFilter === "All")       return true;
    if (outcomeFilter === "Skipped")   return item.tradedStatus === "skipped";
    if (outcomeFilter === "Traded")    return item.tradedStatus === "traded";
    return item.outcome === outcomeFilter;
  });

  const visible = filtered.slice(0, shown);

  const OUTCOME_FILTERS: OutcomeFilter[] = ["All", "Hit Target", "Stopped", "Breakeven", "Monitoring", "Traded", "Skipped"];

  function fmtPrice(val: number, assetClass: string) {
    return formatInstrumentPriceForDisplay(val, currency, rates as Parameters<typeof formatInstrumentPriceForDisplay>[2], assetClass as PricedAssetClass | undefined);
  }

  return (
    <>
      {/* ── Search + filter bar ── */}
      <div className="border-b border-white/6 bg-white/[0.01] px-3 py-2.5 space-y-2">
        {/* Search input */}
        <div className="relative max-w-xs">
          <svg
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            fill="none" stroke="currentColor" strokeWidth="1.7"
          >
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShown(PAGE_SIZE); }}
            placeholder="Search symbol…"
            className="w-full rounded-[0.35rem] border border-white/8 bg-white/[0.03] py-1.5 pl-8 pr-3 text-[0.75rem] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 focus:outline-none"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(""); setShown(PAGE_SIZE); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 3 10 10M13 3 3 13" /></svg>
            </button>
          )}
        </div>

        {/* Outcome filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {OUTCOME_FILTERS.map((f) => {
            const count = f === "All" ? items.length
              : f === "Skipped" ? items.filter((i) => i.tradedStatus === "skipped").length
              : f === "Traded"  ? items.filter((i) => i.tradedStatus === "traded").length
              : items.filter((i) => i.outcome === f).length;
            return (
              <button
                key={f}
                type="button"
                onClick={() => { setOutcomeFilter(f); setShown(PAGE_SIZE); }}
                className={`rounded-[0.30rem] px-2 py-0.5 text-[0.66rem] font-semibold ring-1 transition ${
                  outcomeFilter === f
                    ? "bg-cyan-500/15 text-cyan-200 ring-cyan-500/30"
                    : "bg-white/[0.03] text-slate-500 ring-white/8 hover:text-slate-300"
                }`}
              >
                {f} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
          <span className="ml-auto text-[0.66rem] text-slate-600 self-center">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* ── Desktop column headers ── */}
      <div className="hidden border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[0.69rem] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid lg:grid-cols-[minmax(0,1.2fr)_0.75fr_0.72fr_0.9fr_1fr_0.85fr_0.85fr_0.8fr_auto] lg:gap-3">
        <span>Instrument</span>
        <span>Call</span>
        <span>Trend</span>
        <span>Price</span>
        <span>Entry zone</span>
        <span>Outcome</span>
        <span>Move</span>
        <span>Accuracy</span>
        <span>Note</span>
      </div>

      {/* ── Rows ── */}
      <div>
        {visible.length === 0 ? (
          <div className="px-4 py-8 text-center text-[0.82rem] text-slate-500">
            {items.length === 0
              ? "No prediction history yet."
              : `No predictions match "${search || outcomeFilter}".`}
          </div>
        ) : (
          visible.map((item) => {
            const isSeed = (!item.resolvedSource || item.resolvedSource === "seed_replay") && item.monitoringStatus === "Resolved";
            const existingNote   = notes[item.id];
            const defaultOutcome = outcomeToNoteOutcome(item.outcome);
            return (
              <div key={item.id} id={item.id} className="border-b border-white/6 px-3 py-2.5 last:border-b-0">
                {/* Mobile */}
                <div className="lg:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[0.88rem] font-semibold text-white">{item.symbol}</p>
                        <StatusChip label={item.actionAtCall === "BUY" ? "LONG" : item.actionAtCall === "SELL" ? "SHORT" : item.actionAtCall} />
                        {item.tradedStatus === "skipped" && <span className="rounded px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider bg-amber-900/40 text-amber-300">SIGGI SKIPPED</span>}
                        {item.tradedStatus === "traded"  && <span className="rounded px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider bg-cyan-900/40 text-cyan-300">SIGGI TRADED</span>}
                        {isSeed && <span className="rounded px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider bg-amber-900/50 text-amber-300">SEED</span>}
                      </div>
                      <p className="mt-0.5 text-[0.72rem] text-slate-400">{item.instrumentName} · {item.timeframe} · {item.horizon}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <OutcomeChip outcome={item.outcome} />
                      <p className="mt-1 text-[0.74rem] font-semibold text-white">{item.accuracyScore}%</p>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.72rem] text-slate-400">
                    <span>{item.trendAtCall}</span>
                    <span>Move: <span className="font-medium text-white">{formatPercent(item.moveFromCallPct, true)}</span></span>
                    <span>{item.resolvedAt ? formatDateTimeLabel(item.resolvedAt) : "Still live"}</span>
                  </div>
                  <ResolutionEvidence text={item.resolutionEvidence} />
                  {item.tradedStatus === "skipped" && item.siggiSkipReason && (
                    <p className="mt-1.5 rounded-[0.3rem] bg-amber-500/8 px-2 py-1 text-[0.70rem] leading-[1.4] text-amber-300/80">
                      <span className="font-semibold text-amber-300">Siggi skipped:</span> {item.siggiSkipReason}
                    </p>
                  )}
                  <div className="mt-2">
                    <InlineNoteButton predictionId={item.id} symbol={item.symbol} defaultOutcome={defaultOutcome} existingEntry={existingNote} />
                  </div>
                </div>

                {/* Desktop */}
                <div className="hidden lg:grid lg:grid-cols-[minmax(0,1.2fr)_0.75fr_0.72fr_0.9fr_1fr_0.85fr_0.85fr_0.8fr_auto] lg:items-start lg:gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[0.88rem] font-semibold text-white">{item.symbol} <span className="text-slate-400">/ {item.instrumentName}</span></p>
                      {item.tradedStatus === "skipped" && <span className="rounded px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider bg-amber-900/40 text-amber-300">SKIPPED</span>}
                      {item.tradedStatus === "traded"  && <span className="rounded px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider bg-cyan-900/40 text-cyan-300">TRADED</span>}
                      {isSeed && <span className="rounded px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider bg-amber-900/50 text-amber-300">SEED</span>}
                    </div>
                    <p className="mt-0.5 text-[0.74rem] text-slate-400">{item.assetClass} / {item.timeframe} / {item.horizon}</p>
                    {item.tradedStatus === "skipped" && item.siggiSkipReason && (
                      <p className="mt-1 text-[0.68rem] leading-[1.4] text-amber-300/70">{item.siggiSkipReason}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <StatusChip label={item.decisionAtCall} />
                    <p className="mt-1 text-[0.74rem] text-slate-400">{item.actionAtCall === "BUY" ? "LONG ▲" : item.actionAtCall === "SELL" ? "SHORT ▼" : item.actionAtCall}</p>
                  </div>
                  <div className="text-[0.82rem] font-semibold text-white">{item.trendAtCall}</div>
                  <div className="text-[0.82rem] font-semibold text-white">{fmtPrice(item.priceAtCall, item.assetClass)}</div>
                  <div className="text-[0.76rem] leading-5 text-slate-300">
                    {fmtPrice(item.entryLowAtCall, item.assetClass)} – {fmtPrice(item.entryHighAtCall, item.assetClass)}
                  </div>
                  <div className="min-w-0">
                    <OutcomeChip outcome={item.outcome} />
                    <p className="mt-1 text-[0.74rem] text-slate-400">{item.resolvedAt ? formatDateTimeLabel(item.resolvedAt) : "Still live"}</p>
                    <ResolutionEvidence text={item.resolutionEvidence} />
                  </div>
                  <div className="text-[0.82rem] font-semibold text-white">{formatPercent(item.moveFromCallPct, true)}</div>
                  <div className="min-w-0"><p className="text-[0.82rem] font-semibold text-white">{item.accuracyScore}%</p></div>
                  <div className="pt-0.5">
                    <InlineNoteButton predictionId={item.id} symbol={item.symbol} defaultOutcome={defaultOutcome} existingEntry={existingNote} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Load more ── */}
      {filtered.length > shown && (
        <div className="border-t border-white/6 px-3 py-3 text-center">
          <button
            type="button"
            onClick={() => setShown((s) => s + PAGE_SIZE)}
            className="rounded-[0.4rem] border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[0.76rem] font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200"
          >
            Show more ({filtered.length - shown} remaining)
          </button>
        </div>
      )}
    </>
  );
}
