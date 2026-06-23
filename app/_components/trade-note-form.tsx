"use client";

import { useState, useTransition, useCallback } from "react";
import type { PersistedJournalEntry, TradeNoteOutcome } from "@/app/_lib/server/workspace-types";
import {
  createJournalEntryApi,
  updateJournalEntryApi,
  deleteJournalEntryApi,
} from "@/app/_lib/workspace-api";
import { useRouter } from "next/navigation";

// ─── quick tag presets ────────────────────────────────────────────────────────

const PRESET_TAGS = [
  "Followed plan", "Broke rules", "Patient", "FOMO",
  "Good discipline", "Impulsive", "Overthought it",
  "Clear head", "Distracted", "Conviction high",
];

const OUTCOME_OPTIONS: { value: TradeNoteOutcome; label: string; colour: string }[] = [
  { value: "Win",       label: "Win",       colour: "text-emerald-300 ring-emerald-500/40 bg-emerald-500/10" },
  { value: "Loss",      label: "Loss",      colour: "text-red-300     ring-red-500/40     bg-red-500/10"     },
  { value: "Breakeven", label: "Breakeven", colour: "text-slate-300   ring-slate-500/40   bg-slate-500/10"   },
  { value: "Skipped",   label: "Skipped",   colour: "text-amber-300   ring-amber-500/40   bg-amber-500/10"   },
];

// ─── props ────────────────────────────────────────────────────────────────────

type TradeNoteFormProps = {
  /** Pass an existing entry to edit it; omit to create a new one */
  entry?: PersistedJournalEntry;
  /** Pre-fill link to a prediction history record */
  predictionId?: string;
  /** Pre-fill link to a Siggi trade */
  tradeId?: string;
  /** Pre-fill the asset symbol (hides the picker when set) */
  symbol?: string;
  /** Pre-fill the outcome from the resolved trade/prediction */
  defaultOutcome?: TradeNoteOutcome;
  /** Available instrument symbols for the picker — shown when no symbol is pre-filled */
  availableSymbols?: string[];
  onSave?: (entry: PersistedJournalEntry) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  /** Compact mode — used when embedded inline in a table row */
  compact?: boolean;
};

// ─── component ────────────────────────────────────────────────────────────────

export function TradeNoteForm({
  entry,
  predictionId,
  tradeId,
  symbol,
  defaultOutcome,
  availableSymbols,
  onSave,
  onCancel,
  onDelete,
  compact = false,
}: TradeNoteFormProps) {
  const router        = useRouter();
  const [pending, startTransition] = useTransition();
  // Asset field — only shown when no symbol is pre-provided
  const [assetInput, setAssetInput] = useState(entry?.asset ?? "");

  // Form state
  const [whatISaw,       setWhatISaw]       = useState(entry?.whatISaw      ?? "");
  const [reasoning,      setReasoning]      = useState(entry?.reasoning     ?? "");
  const [improvement,    setImprovement]    = useState(entry?.improvement   ?? "");
  const [notes,          setNotes]          = useState(entry?.notes         ?? "");
  const [tags,           setTags]           = useState<string[]>(entry?.tags ?? []);
  const [tagInput,       setTagInput]       = useState("");
  const [rating,         setRating]         = useState<number | null>(entry?.rating ?? null);
  const [wouldTake,      setWouldTake]      = useState<boolean | null>(entry?.wouldTakeAgain ?? null);
  const [outcome,        setOutcome]        = useState<TradeNoteOutcome | null>(
    entry?.taggedOutcome ?? defaultOutcome ?? null,
  );
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── tag helpers ─────────────────────────────────────────────────────────────

  function togglePresetTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function addCustomTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  // ── save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        asset:          symbol ?? (assetInput.trim().toUpperCase() || entry?.asset) ?? "",
        whatISaw,
        reasoning,
        improvement,
        notes,
        tags,
        rating,
        wouldTakeAgain: wouldTake,
        taggedOutcome:  outcome,
        predictionId:   predictionId   ?? entry?.predictionId   ?? null,
        tradeId:        tradeId        ?? entry?.tradeId        ?? null,
        entryType:      ((predictionId ?? entry?.predictionId)
                          ? "signal_review"
                          : (tradeId ?? entry?.tradeId)
                            ? "trade_review"
                            : "general") as "trade_review" | "signal_review" | "general",
      };

      let saved: PersistedJournalEntry;
      if (entry) {
        const res = await updateJournalEntryApi(entry.id, payload);
        saved = res.entry;
      } else {
        const res = await createJournalEntryApi(payload);
        saved = res.entry;
      }

      onSave?.(saved);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  // ── delete ──────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!entry) return;
    setDeleting(true);
    try {
      await deleteJournalEntryApi(entry.id);
      onDelete?.();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete note");
      setDeleting(false);
    }
  }

  // ── textarea helper ─────────────────────────────────────────────────────────

  const fieldCls = "w-full resize-none rounded-[0.38rem] border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[0.82rem] text-slate-200 placeholder-slate-600 outline-none transition focus:border-[#00C884]/40 focus:bg-white/[0.06]";
  const labelCls = "mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-slate-500";

  // Unique datalist id — avoid collisions if multiple forms are on the page
  const datalistId = `journal-symbols-${predictionId ?? tradeId ?? "standalone"}`;

  return (
    <div className={`grid gap-3 ${compact ? "" : "max-w-xl"}`}>

      {/* Instrument picker — only when symbol isn't pre-filled by parent */}
      {!symbol && (
        <div>
          <label className={labelCls}>Instrument</label>
          {availableSymbols && availableSymbols.length > 0 ? (
            <>
              <input
                type="text"
                list={datalistId}
                placeholder="e.g. EURUSD, BTC/USD, AAPL…"
                value={assetInput}
                onChange={(e) => setAssetInput(e.target.value)}
                className={fieldCls}
              />
              <datalist id={datalistId}>
                {availableSymbols.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          ) : (
            <input
              type="text"
              placeholder="e.g. EURUSD, BTC/USD, AAPL…"
              value={assetInput}
              onChange={(e) => setAssetInput(e.target.value)}
              className={fieldCls}
            />
          )}
        </div>
      )}

      {/* Show pre-filled symbol as read-only badge */}
      {symbol && (
        <div className="flex items-center gap-2">
          <span className="rounded-[0.3rem] bg-[#00C884]/10 px-2.5 py-1 text-[0.76rem] font-semibold text-[#00C884]/80 ring-1 ring-[#00C884]/20">
            {symbol}
          </span>
          <span className="text-[0.72rem] text-slate-500">linked instrument</span>
        </div>
      )}

      {/* Outcome + Would take again + Rating */}
      <div className="flex flex-wrap items-start gap-3">
        {/* Outcome chips */}
        <div className="flex-1">
          <p className={labelCls}>Outcome</p>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOME_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setOutcome((prev) => (prev === o.value ? null : o.value))}
                className={`rounded-[0.3rem] px-2.5 py-1 text-[0.7rem] font-semibold ring-1 transition ${o.colour} ${
                  outcome === o.value ? "opacity-100" : "opacity-40 hover:opacity-70"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Would take again */}
        <div>
          <p className={labelCls}>Do again?</p>
          <div className="flex gap-1.5">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setWouldTake((prev) => (prev === v ? null : v))}
                className={`rounded-[0.3rem] px-2.5 py-1 text-[0.7rem] font-semibold ring-1 transition ${
                  v
                    ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                    : "bg-red-500/10 text-red-300 ring-red-500/30"
                } ${wouldTake === v ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
              >
                {v ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>

        {/* Rating stars */}
        <div>
          <p className={labelCls}>Decision quality</p>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating((prev) => (prev === n ? null : n))}
                aria-label={`${n} star`}
                className={`text-[1.1rem] transition ${
                  rating !== null && n <= rating ? "text-amber-400" : "text-slate-700 hover:text-amber-400/60"
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* What I saw */}
      <div>
        <label className={labelCls}>What I saw</label>
        <textarea
          rows={compact ? 2 : 3}
          placeholder="What was the setup? Which levels, pattern, or context made you take notice?"
          value={whatISaw}
          onChange={(e) => setWhatISaw(e.target.value)}
          className={fieldCls}
        />
      </div>

      {/* Reasoning */}
      <div>
        <label className={labelCls}>Why I took it / Why I skipped it</label>
        <textarea
          rows={compact ? 2 : 3}
          placeholder="What made you commit — or what made you pass? Be honest."
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          className={fieldCls}
        />
      </div>

      {/* Improvement */}
      <div>
        <label className={labelCls}>What I'd do differently</label>
        <textarea
          rows={compact ? 2 : 3}
          placeholder="Given the same setup tomorrow, what would change? Entry, sizing, timing, patience?"
          value={improvement}
          onChange={(e) => setImprovement(e.target.value)}
          className={fieldCls}
        />
      </div>

      {/* Extra notes */}
      {!compact && (
        <div>
          <label className={labelCls}>Additional notes</label>
          <textarea
            rows={2}
            placeholder="Anything else worth remembering — market context, correlations, news, emotional state…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={fieldCls}
          />
        </div>
      )}

      {/* Tags */}
      <div>
        <p className={labelCls}>Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => togglePresetTag(t)}
              className={`rounded-[0.3rem] px-2 py-0.5 text-[0.67rem] font-medium ring-1 transition ${
                tags.includes(t)
                  ? "bg-[#00C884]/15 text-[#00C884]/80 ring-[#00C884]/30"
                  : "bg-white/[0.03] text-slate-500 ring-white/8 hover:text-slate-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {/* Custom tag input */}
        <div className="mt-1.5 flex gap-2">
          <input
            type="text"
            placeholder="Custom tag…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
            className="min-w-0 flex-1 rounded-[0.38rem] border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[0.78rem] text-slate-200 placeholder-slate-600 outline-none focus:border-[#00C884]/40"
          />
          <button
            type="button"
            onClick={addCustomTag}
            className="rounded-[0.38rem] bg-white/5 px-3 py-1.5 text-[0.74rem] font-semibold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            Add
          </button>
        </div>
        {/* Active custom tags */}
        {tags.filter((t) => !PRESET_TAGS.includes(t)).map((t) => (
          <span
            key={t}
            className="mr-1.5 mt-1.5 inline-flex items-center gap-1 rounded-[0.3rem] bg-[#00C884]/15 px-2 py-0.5 text-[0.67rem] font-medium text-[#00C884]/80 ring-1 ring-[#00C884]/30"
          >
            {t}
            <button
              type="button"
              onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
              className="text-[#00C884] hover:text-[#00F79A]"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-[0.38rem] bg-red-500/10 px-3 py-2 text-[0.78rem] text-red-300 ring-1 ring-red-500/25">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || pending}
          className="rounded-[0.4rem] bg-[#00C884]/20 px-4 py-1.5 text-[0.78rem] font-semibold text-[#00C884]/80 ring-1 ring-[#00C884]/30 transition hover:bg-[#00C884]/30 disabled:opacity-50"
        >
          {saving ? "Saving…" : entry ? "Update note" : "Save note"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[0.4rem] px-3 py-1.5 text-[0.78rem] font-semibold text-slate-400 transition hover:text-white"
          >
            Cancel
          </button>
        )}
        {entry && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto rounded-[0.4rem] px-3 py-1.5 text-[0.74rem] font-semibold text-slate-600 transition hover:text-red-400"
          >
            Delete
          </button>
        )}
        {entry && confirmDelete && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[0.74rem] text-slate-400">Delete this note?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-[0.4rem] bg-red-500/15 px-2.5 py-1 text-[0.72rem] font-semibold text-red-300 ring-1 ring-red-500/30 transition hover:bg-red-500/25 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-[0.72rem] text-slate-500 transition hover:text-white"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── inline note button (used in table rows) ─────────────────────────────────

type InlineNoteButtonProps = {
  predictionId?: string;
  tradeId?: string;
  symbol?: string;
  defaultOutcome?: TradeNoteOutcome;
  existingEntry?: PersistedJournalEntry;
};

export function InlineNoteButton({
  predictionId,
  tradeId,
  symbol,
  defaultOutcome,
  existingEntry,
}: InlineNoteButtonProps) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<PersistedJournalEntry | undefined>(existingEntry);

  const handleSave = useCallback((saved: PersistedJournalEntry) => {
    setEntry(saved);
    setOpen(false);
  }, []);

  const handleDelete = useCallback(() => {
    setEntry(undefined);
    setOpen(false);
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        title={entry ? "View / edit note" : "Add note"}
        className={`flex items-center gap-1 rounded-[0.3rem] px-2 py-0.5 text-[0.68rem] font-semibold ring-1 transition ${
          entry
            ? "bg-[#00C884]/10 text-[#00C884] ring-[#00C884]/25 hover:bg-[#00C884]/20"
            : "bg-white/[0.03] text-slate-500 ring-white/8 hover:bg-white/[0.07] hover:text-slate-300"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M10.5 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5L10.5 2Z" />
          <path d="M10 2v3h3" />
          <path d="M5.5 7.5h5M5.5 9.5h3" />
        </svg>
        {entry ? "Note" : "+ Note"}
      </button>

      {open && (
        <div className="mt-2 rounded-[0.5rem] border border-white/10 bg-[#06101b] p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <TradeNoteForm
            entry={entry}
            predictionId={predictionId}
            tradeId={tradeId}
            symbol={symbol}
            defaultOutcome={defaultOutcome}
            onSave={handleSave}
            onCancel={() => setOpen(false)}
            onDelete={handleDelete}
            compact
          />
        </div>
      )}
    </div>
  );
}
