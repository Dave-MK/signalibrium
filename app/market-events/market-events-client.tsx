"use client";

import { useState, useTransition } from "react";
import type { PersistedMarketEvent } from "@/app/_lib/server/workspace-types";

const IMPACT_STYLE: Record<PersistedMarketEvent["impact"], string> = {
  High:   "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
  Medium: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  Low:    "bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20",
};

const BIAS_STYLE: Record<PersistedMarketEvent["bias"], string> = {
  Bullish: "text-emerald-400",
  Bearish: "text-rose-400",
  Neutral: "text-slate-400",
  Mixed:   "text-amber-400",
};

const STATUS_ORDER: PersistedMarketEvent["status"][] = ["Live", "Upcoming", "Recent"];

const STATUS_LABEL: Record<PersistedMarketEvent["status"], string> = {
  Live:     "Live",
  Upcoming: "Upcoming",
  Recent:   "Recent",
};

const STATUS_DOT: Record<PersistedMarketEvent["status"], string> = {
  Live:     "bg-rose-400 animate-pulse",
  Upcoming: "bg-amber-400",
  Recent:   "bg-slate-500",
};

function formatRelativeTime(iso: string) {
  const diff = Date.now() - Date.parse(iso);
  const abs = Math.abs(diff);
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m ago`;
  if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)}h ago`;
  return `${Math.round(abs / 86_400_000)}d ago`;
}

function EventCard({
  event,
  onStatusChange,
  onDelete,
}: {
  event: PersistedMarketEvent;
  onStatusChange: (id: string, status: PersistedMarketEvent["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const [busy, startTransition] = useTransition();

  function patch(status: PersistedMarketEvent["status"]) {
    startTransition(async () => {
      await fetch(`/api/market-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onStatusChange(event.id, status);
    });
  }

  function remove() {
    startTransition(async () => {
      await fetch(`/api/market-events/${event.id}`, { method: "DELETE" });
      onDelete(event.id);
    });
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-4 space-y-2.5">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold ${IMPACT_STYLE[event.impact]}`}>
            {event.impact} Impact
          </span>
          <span className="text-[0.7rem] text-slate-500">{event.scope}</span>
          <span className={`text-[0.7rem] font-semibold ${BIAS_STYLE[event.bias]}`}>{event.bias}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[0.65rem] text-slate-600 truncate max-w-[10rem]">{event.sourceLabel}</span>
          <span className="text-[0.65rem] text-slate-700">·</span>
          <span className="text-[0.65rem] text-slate-600 shrink-0">{formatRelativeTime(event.updatedAt)}</span>
        </div>
      </div>

      {/* Title + summary */}
      <div>
        <p className="text-[0.85rem] font-semibold text-slate-100 leading-snug">{event.title}</p>
        <p className="mt-1 text-[0.76rem] text-slate-400 leading-relaxed">{event.summary}</p>
      </div>

      {/* Related symbols */}
      {event.relatedSymbols.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {event.relatedSymbols.map((sym) => (
            <span key={sym} className="rounded px-1.5 py-0.5 text-[0.62rem] font-mono font-semibold bg-[#00C884]/8 text-[#00C884] ring-1 ring-[#00C884]/15">
              {sym}
            </span>
          ))}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 pt-1">
        {event.status === "Live" && (
          <button
            disabled={busy}
            onClick={() => patch("Recent")}
            className="rounded px-2.5 py-1 text-[0.7rem] font-semibold text-slate-300 bg-white/5 hover:bg-white/10 transition disabled:opacity-40"
          >
            Mark Resolved
          </button>
        )}
        {event.status === "Upcoming" && (
          <button
            disabled={busy}
            onClick={() => patch("Live")}
            className="rounded px-2.5 py-1 text-[0.7rem] font-semibold text-slate-300 bg-white/5 hover:bg-white/10 transition disabled:opacity-40"
          >
            Mark Live
          </button>
        )}
        <button
          disabled={busy}
          onClick={remove}
          className="ml-auto rounded px-2.5 py-1 text-[0.7rem] font-semibold text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function AddEventForm({ onAdded }: { onAdded: (e: PersistedMarketEvent) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [form, setForm] = useState({
    title: "",
    summary: "",
    impact: "Medium" as PersistedMarketEvent["impact"],
    bias: "Mixed" as PersistedMarketEvent["bias"],
    scope: "Macro" as PersistedMarketEvent["scope"],
    status: "Live" as PersistedMarketEvent["status"],
    relatedSymbols: "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/market-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `manual-${Date.now()}`,
          title: form.title.trim(),
          summary: form.summary.trim(),
          impact: form.impact,
          bias: form.bias,
          scope: form.scope,
          status: form.status,
          relatedSymbols: form.relatedSymbols
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          startsAt: new Date().toISOString(),
          sourceLabel: "Manual",
          sourceType: "Policy",
        }),
      });
      const data = await res.json();
      if (data.marketEvent) {
        onAdded(data.marketEvent as PersistedMarketEvent);
        setForm({ title: "", summary: "", impact: "Medium", bias: "Mixed", scope: "Macro", status: "Live", relatedSymbols: "" });
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-4 py-3 text-[0.78rem] font-semibold text-slate-500 hover:border-white/20 hover:text-slate-300 transition w-full"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M10 4.5v11M4.5 10h11" />
        </svg>
        Add manual event
      </button>
    );
  }

  const field = "rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-[0.78rem] text-slate-200 w-full focus:outline-none focus:border-[#00C884]/40";
  const sel   = `${field} bg-[#0d1117]`;

  return (
    <form onSubmit={submit} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
      <p className="text-[0.8rem] font-semibold text-slate-200">Add event</p>
      <input required className={field} placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      <textarea required className={`${field} min-h-[3rem] resize-y`} placeholder="Summary — one sentence on market impact" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select className={sel} value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value as typeof form.impact }))}>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select className={sel} value={form.bias} onChange={(e) => setForm((f) => ({ ...f, bias: e.target.value as typeof form.bias }))}>
          <option value="Bullish">Bullish</option>
          <option value="Bearish">Bearish</option>
          <option value="Neutral">Neutral</option>
          <option value="Mixed">Mixed</option>
        </select>
        <select className={sel} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as typeof form.scope }))}>
          <option value="Macro">Macro</option>
          <option value="Sector">Sector</option>
          <option value="Asset">Asset</option>
          <option value="Liquidity">Liquidity</option>
        </select>
        <select className={sel} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof form.status }))}>
          <option value="Live">Live</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Recent">Recent</option>
        </select>
      </div>
      <input className={field} placeholder="Related symbols — comma separated (e.g. XAUUSD, EURUSD)" value={form.relatedSymbols} onChange={(e) => setForm((f) => ({ ...f, relatedSymbols: e.target.value }))} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded px-3 py-1.5 text-[0.78rem] font-semibold bg-[#00C884]/15 text-[#00C884] hover:bg-[#00C884]/25 transition disabled:opacity-40">
          {busy ? "Saving…" : "Save event"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-[0.78rem] font-semibold text-slate-500 hover:text-slate-300 transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function MarketEventsClient({ initialEvents }: { initialEvents: PersistedMarketEvent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [filterImpact, setFilterImpact] = useState<PersistedMarketEvent["impact"] | "All">("All");

  function handleStatusChange(id: string, status: PersistedMarketEvent["status"]) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  }

  function handleDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function handleAdded(event: PersistedMarketEvent) {
    setEvents((prev) => [event, ...prev]);
  }

  const filtered = filterImpact === "All" ? events : events.filter((e) => e.impact === filterImpact);
  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: filtered.filter((e) => e.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate-600">Impact</span>
        {(["All", "High", "Medium", "Low"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setFilterImpact(v)}
            className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-semibold transition ${
              filterImpact === v
                ? "bg-[#00C884]/15 text-[#00C884] ring-1 ring-[#00C884]/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {v}
          </button>
        ))}
        <span className="ml-auto text-[0.7rem] text-slate-600">{filtered.length} event{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Add form */}
      <AddEventForm onAdded={handleAdded} />

      {grouped.length === 0 && (
        <p className="text-center py-10 text-[0.8rem] text-slate-600">No events match the current filter.</p>
      )}

      {/* Grouped sections */}
      {grouped.map(({ status, items }) => (
        <div key={status} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
            <p className="text-[0.72rem] font-semibold uppercase tracking-widest text-slate-500">
              {STATUS_LABEL[status]} · {items.length}
            </p>
          </div>
          <div className="space-y-2">
            {items.map((e) => (
              <EventCard key={e.id} event={e} onStatusChange={handleStatusChange} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
