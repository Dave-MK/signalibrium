"use client";

import { useState, useCallback } from "react";
import type { PersistedJournalEntry, TradeNoteOutcome } from "@/app/_lib/server/workspace-types";
import { TradeNoteForm } from "@/app/_components/trade-note-form";
import { JournalCsvExportButton } from "@/app/_components/csv-export-button";
import { formatDateTimeLabel } from "@/app/_lib/format";

// ─── Bulk review item type ────────────────────────────────────────────────────

type ReviewItem = {
  id: string;
  symbol: string;
  instrumentName: string;
  side: string;
  status: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  realizedPnlGbp: number;
  openedAt: string;
  closedAt: string | null;
  type: "trade" | "signal";
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const OUTCOME_STYLE: Record<TradeNoteOutcome, string> = {
  Win:       "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  Loss:      "bg-red-500/15 text-red-300 ring-red-500/30",
  Breakeven: "bg-slate-600/30 text-slate-300 ring-slate-500/30",
  Skipped:   "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

const TYPE_LABEL: Record<PersistedJournalEntry["entryType"], string> = {
  trade_review:  "Trade",
  signal_review: "Signal",
  general:       "General",
};

// ─── individual entry card ────────────────────────────────────────────────────

function EntryCard({
  entry,
  onUpdated,
}: {
  entry: PersistedJournalEntry;
  onUpdated: (e: PersistedJournalEntry | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);

  const summary =
    entry.whatISaw?.trim() ||
    entry.reasoning?.trim() ||
    entry.notes?.trim() ||
    "No notes written yet.";

  return (
    <div className="signal-surface-soft rounded-[0.5rem] border border-white/[0.05]">
      {/* Header row */}
      <button
        type="button"
        onClick={() => { setExpanded((p) => !p); setEditing(false); }}
        className="flex w-full items-start gap-3 p-3.5 text-left"
      >
        {/* Symbol + type */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {entry.asset && (
              <p className="text-[0.9rem] font-semibold text-white">{entry.asset}</p>
            )}
            <span className="rounded-[0.28rem] bg-white/[0.05] px-1.5 py-0.5 text-[0.63rem] font-semibold uppercase tracking-wider text-slate-500">
              {TYPE_LABEL[entry.entryType ?? "general"]}
            </span>
            {entry.taggedOutcome && (
              <span className={`rounded-[0.28rem] px-2 py-0.5 text-[0.63rem] font-semibold uppercase tracking-wider ring-1 ${OUTCOME_STYLE[entry.taggedOutcome]}`}>
                {entry.taggedOutcome}
              </span>
            )}
            {entry.rating && (
              <span className="text-[0.75rem] text-amber-400">
                {"★".repeat(entry.rating)}{"☆".repeat(5 - entry.rating)}
              </span>
            )}
            {entry.wouldTakeAgain !== null && (
              <span className={`text-[0.7rem] font-semibold ${entry.wouldTakeAgain ? "text-emerald-400" : "text-red-400"}`}>
                {entry.wouldTakeAgain ? "↩ Would repeat" : "↩ Wouldn't repeat"}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[0.76rem] text-slate-400">{summary}</p>
        </div>
        {/* Date + chevron */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-[0.68rem] text-slate-600">{formatDateTimeLabel(entry.createdAt)}</p>
          {/* Tags */}
          <div className="flex flex-wrap justify-end gap-1">
            {(entry.tags ?? []).slice(0, 3).map((t) => (
              <span key={t} className="rounded-[0.25rem] bg-white/[0.04] px-1.5 py-0.5 text-[0.6rem] text-slate-500">
                {t}
              </span>
            ))}
          </div>
          <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 text-slate-600 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" strokeWidth="1.8"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && !editing && (
        <div className="border-t border-white/[0.05] px-3.5 pb-3.5 pt-3">
          <div className="grid gap-3">
            {entry.whatISaw && (
              <div>
                <p className="mb-1 text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">What I saw</p>
                <p className="text-[0.82rem] leading-5 text-slate-300">{entry.whatISaw}</p>
              </div>
            )}
            {entry.reasoning && (
              <div>
                <p className="mb-1 text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Why I took / skipped it</p>
                <p className="text-[0.82rem] leading-5 text-slate-300">{entry.reasoning}</p>
              </div>
            )}
            {entry.improvement && (
              <div>
                <p className="mb-1 text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">What I'd do differently</p>
                <p className="text-[0.82rem] leading-5 text-slate-300">{entry.improvement}</p>
              </div>
            )}
            {entry.notes && (
              <div>
                <p className="mb-1 text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Additional notes</p>
                <p className="text-[0.82rem] leading-5 text-slate-300">{entry.notes}</p>
              </div>
            )}
            {(entry.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map((t) => (
                  <span key={t} className="rounded-[0.28rem] bg-cyan-500/10 px-2 py-0.5 text-[0.67rem] text-cyan-300 ring-1 ring-cyan-500/20">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              {entry.predictionId && (
                <a href={`/history#${entry.predictionId}`} className="text-[0.72rem] text-cyan-400 underline underline-offset-2 hover:text-cyan-200">
                  → View signal
                </a>
              )}
              {entry.tradeId && (
                <a href="/siggis-trades" className="text-[0.72rem] text-cyan-400 underline underline-offset-2 hover:text-cyan-200">
                  → View trade
                </a>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ml-auto text-[0.72rem] text-slate-500 transition hover:text-cyan-300"
              >
                Edit note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit form */}
      {expanded && editing && (
        <div className="border-t border-white/[0.05] px-3.5 pb-3.5 pt-3">
          <TradeNoteForm
            entry={entry}
            onSave={(saved) => { onUpdated(saved); setEditing(false); }}
            onCancel={() => setEditing(false)}
            onDelete={() => onUpdated(null)}
            compact
          />
        </div>
      )}
    </div>
  );
}

// ─── create form panel ────────────────────────────────────────────────────────

function CreatePanel({
  onCreated,
  availableSymbols,
}: {
  onCreated: (e: PersistedJournalEntry) => void;
  availableSymbols?: string[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[0.5rem] border border-dashed border-white/10 py-3.5 text-[0.8rem] font-semibold text-slate-500 transition hover:border-cyan-500/30 hover:text-cyan-300"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M8 3v10M3 8h10" />
        </svg>
        New journal entry
      </button>
    );
  }

  return (
    <div className="rounded-[0.5rem] border border-white/10 bg-[#06101b] p-4">
      <p className="mb-3 text-[0.8rem] font-semibold text-white">New journal entry</p>
      <TradeNoteForm
        availableSymbols={availableSymbols}
        onSave={(e) => { onCreated(e); setOpen(false); }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

// ─── filter bar ──────────────────────────────────────────────────────────────

type Filter = "All" | TradeNoteOutcome | "Trade" | "Signal" | "General";

// ─── Bulk review modal ────────────────────────────────────────────────────────

function BulkReviewModal({
  items,
  onClose,
  onNoted,
}: {
  items: ReviewItem[];
  onClose: () => void;
  onNoted: (entry: PersistedJournalEntry, itemId: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);

  const remaining = items.filter((i) => !done.has(i.id));
  const current = remaining[0] ?? null;

  function skip() {
    if (!current) return;
    setDone((d) => new Set([...d, current.id]));
    setShowForm(false);
  }

  function handleSaved(entry: PersistedJournalEntry) {
    if (!current) return;
    onNoted(entry, current.id);
    setDone((d) => new Set([...d, current.id]));
    setShowForm(false);
  }

  if (!current) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[0.6rem] border border-white/10 bg-[#07111d] p-6 shadow-2xl text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="text-[0.94rem] font-semibold text-white">All caught up!</p>
          <p className="mt-1 text-[0.78rem] text-slate-400">
            You've reviewed everything in the queue. Come back after the next batch of trades resolve.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-[0.4rem] bg-cyan-500/15 px-5 py-2 text-[0.78rem] font-semibold text-cyan-300 ring-1 ring-cyan-500/25 hover:bg-cyan-500/25"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const pnl = current.realizedPnlGbp;
  const outcomeColor =
    current.status === "Hit Target" ? "text-emerald-300"
    : current.status === "Stopped" ? "text-red-300"
    : "text-slate-300";

  const defaultOutcome: TradeNoteOutcome | undefined =
    current.status === "Hit Target" ? "Win"
    : current.status === "Stopped" ? "Loss"
    : current.status === "Breakeven" ? "Breakeven"
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[0.6rem] border border-white/10 bg-[#07111d] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
              Bulk review · {remaining.length} remaining
            </p>
            <div className="mt-0.5 h-1 w-32 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-cyan-500/60 transition-all"
                style={{ width: `${((items.length - remaining.length) / items.length) * 100}%` }}
              />
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m3 3 10 10M13 3 3 13" />
            </svg>
          </button>
        </div>

        {/* Card */}
        <div className="p-4 space-y-3">
          <div className="signal-surface-soft rounded-[0.45rem] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[0.96rem] font-bold text-white">{current.symbol}</p>
                  <span className={`text-[0.75rem] font-semibold ${current.side === "BUY" ? "text-emerald-300" : "text-amber-200"}`}>
                    {current.side === "BUY" ? "LONG" : current.side === "SELL" ? "SHORT" : current.side}
                  </span>
                  <span className="rounded px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider bg-white/[0.05] text-slate-400">
                    {current.type === "trade" ? "Siggi trade" : "Signal"}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.72rem] text-slate-400">{current.instrumentName}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-[0.82rem] font-bold ${outcomeColor}`}>{current.status}</p>
                {pnl !== 0 && (
                  <p className={`text-[0.76rem] font-semibold ${pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {pnl >= 0 ? "+" : ""}£{Math.abs(pnl).toFixed(0)}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.70rem] text-slate-500">
              <span>Entry <span className="text-slate-300">{current.entryPrice.toFixed(2)}</span></span>
              <span>Stop <span className="text-slate-300">{current.stopPrice.toFixed(2)}</span></span>
              <span>Target <span className="text-slate-300">{current.targetPrice.toFixed(2)}</span></span>
              {current.closedAt && <span>Closed <span className="text-slate-300">{formatDateTimeLabel(current.closedAt)}</span></span>}
            </div>
          </div>

          {!showForm ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex-1 rounded-[0.4rem] bg-cyan-500/15 py-2 text-[0.76rem] font-semibold text-cyan-300 ring-1 ring-cyan-500/25 hover:bg-cyan-500/25"
              >
                ✍️ Add note
              </button>
              <button
                type="button"
                onClick={skip}
                className="flex-1 rounded-[0.4rem] py-2 text-[0.76rem] font-semibold text-slate-500 ring-1 ring-white/8 hover:text-slate-300"
              >
                Skip →
              </button>
            </div>
          ) : (
            <div>
              <TradeNoteForm
                tradeId={current.type === "trade" ? current.id : undefined}
                predictionId={current.type === "signal" ? current.id : undefined}
                symbol={current.symbol}
                defaultOutcome={defaultOutcome}
                onSave={handleSaved}
                onCancel={() => setShowForm(false)}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── main client component ────────────────────────────────────────────────────

export function JournalClient({
  initialEntries,
  availableSymbols,
  unreviewedItems = [],
}: {
  initialEntries: PersistedJournalEntry[];
  availableSymbols?: string[];
  unreviewedItems?: ReviewItem[];
}) {
  const [entries,      setEntries]      = useState<PersistedJournalEntry[]>(initialEntries);
  const [filter,       setFilter]       = useState<Filter>("All");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [reviewMode,   setReviewMode]   = useState(false);
  // Track which items have been reviewed this session (removed from queue)
  const [reviewedIds,  setReviewedIds]  = useState<Set<string>>(new Set());
  const pendingReview = unreviewedItems.filter((i) => !reviewedIds.has(i.id));

  const handleCreated = useCallback((e: PersistedJournalEntry) => {
    setEntries((prev) => [e, ...prev]);
  }, []);

  const handleUpdated = useCallback((id: string, updated: PersistedJournalEntry | null) => {
    setEntries((prev) =>
      updated === null
        ? prev.filter((e) => e.id !== id)
        : prev.map((e) => (e.id === id ? updated : e)),
    );
  }, []);

  // Search helper — matches symbol, notes fields, or tags
  const q = searchQuery.trim().toLowerCase();
  function matchesSearch(e: PersistedJournalEntry) {
    if (!q) return true;
    return (
      e.asset?.toLowerCase().includes(q) ||
      e.notes?.toLowerCase().includes(q) ||
      e.whatISaw?.toLowerCase().includes(q) ||
      e.reasoning?.toLowerCase().includes(q) ||
      e.improvement?.toLowerCase().includes(q) ||
      e.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }

  // Outcome/type filter
  const filtered = entries.filter((e) => {
    if (!matchesSearch(e)) return false;
    if (filter === "All")       return true;
    if (filter === "Win")       return e.taggedOutcome === "Win";
    if (filter === "Loss")      return e.taggedOutcome === "Loss";
    if (filter === "Breakeven") return e.taggedOutcome === "Breakeven";
    if (filter === "Skipped")   return e.taggedOutcome === "Skipped";
    if (filter === "Trade")     return e.entryType === "trade_review";
    if (filter === "Signal")    return e.entryType === "signal_review";
    if (filter === "General")   return e.entryType === "general";
    return true;
  });

  const FILTERS: Filter[] = ["All", "Trade", "Signal", "Win", "Loss", "Breakeven", "Skipped", "General"];

  return (
    <div className="grid gap-3">
      {/* Bulk review modal */}
      {reviewMode && pendingReview.length > 0 && (
        <BulkReviewModal
          items={pendingReview}
          onClose={() => setReviewMode(false)}
          onNoted={(entry, itemId) => {
            setEntries((prev) => [entry, ...prev]);
            setReviewedIds((s) => new Set([...s, itemId]));
          }}
        />
      )}

      {/* Review prompt banner */}
      {pendingReview.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-[0.45rem] border border-cyan-500/15 bg-cyan-500/5 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-[0.78rem] font-semibold text-white">
              {pendingReview.length} trade{pendingReview.length === 1 ? "" : "s"} waiting for review
            </p>
            <p className="text-[0.70rem] text-slate-400">
              Flash-card review mode — work through them one at a time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReviewMode(true)}
            className="shrink-0 rounded-[0.35rem] bg-cyan-500/15 px-3 py-1.5 text-[0.72rem] font-semibold text-cyan-300 ring-1 ring-cyan-500/25 transition hover:bg-cyan-500/25"
          >
            Review now →
          </button>
        </div>
      )}

      {/* Stats strip + export */}
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-[5px] sm:grid-cols-4">
          {[
            { label: "Total entries",  value: entries.length },
            { label: "Wins noted",     value: entries.filter((e) => e.taggedOutcome === "Win").length,  tone: "text-emerald-300" },
            { label: "Losses noted",   value: entries.filter((e) => e.taggedOutcome === "Loss").length, tone: "text-red-300"     },
            { label: "Would repeat",   value: entries.filter((e) => e.wouldTakeAgain === true).length,  tone: "text-cyan-200"   },
          ].map((s) => (
            <div key={s.label} className="signal-surface-soft rounded-[0.5rem] px-3.5 py-3">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{s.label}</p>
              <p className={`mt-1 text-[1.15rem] font-bold ${s.tone ?? "text-white"}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="shrink-0 pt-0.5">
          <JournalCsvExportButton entries={entries} />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
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
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by symbol, notes, tags…"
          className="w-full rounded-[0.4rem] border border-white/8 bg-white/[0.03] py-2 pl-8 pr-3 text-[0.78rem] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m3 3 10 10M13 3 3 13" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-[0.32rem] px-2.5 py-1 text-[0.7rem] font-semibold ring-1 transition ${
              filter === f
                ? "bg-cyan-500/15 text-cyan-200 ring-cyan-500/30"
                : "bg-white/[0.03] text-slate-500 ring-white/8 hover:text-slate-300"
            }`}
          >
            {f}
            {f !== "All" && (
              <span className="ml-1.5 text-[0.62rem] opacity-60">
                {entries.filter((e) => {
                  if (f === "Trade")   return e.entryType === "trade_review";
                  if (f === "Signal")  return e.entryType === "signal_review";
                  if (f === "General") return e.entryType === "general";
                  return e.taggedOutcome === f;
                }).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Create panel */}
      <CreatePanel onCreated={handleCreated} availableSymbols={availableSymbols} />

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="signal-surface-soft rounded-[0.5rem] px-4 py-8 text-center">
          <p className="text-[0.82rem] text-slate-500">
            {entries.length === 0
              ? "No journal entries yet. Click \"New journal entry\" above to start reviewing your trades and calls."
              : searchQuery
                ? `No entries match "${searchQuery}". Try clearing the search or changing the filter.`
                : "No entries match the current filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-[5px]">
          {filtered.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              onUpdated={(updated) => handleUpdated(e.id, updated)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
