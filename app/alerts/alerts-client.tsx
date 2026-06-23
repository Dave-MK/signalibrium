"use client";

import { useState, useTransition } from "react";
import type { PersistedPriceAlert } from "@/app/_lib/server/workspace-types";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtPrice(p: number) {
  return p < 0.01
    ? p.toFixed(6)
    : p < 10
      ? p.toFixed(4)
      : p < 10_000
        ? p.toFixed(2)
        : p.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateAlertForm({ onCreated }: { onCreated: (a: PersistedPriceAlert) => void }) {
  const [open, setOpen]       = useState(false);
  const [symbol, setSymbol]   = useState("");
  const [label, setLabel]     = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [price, setPrice]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [pending, startT]     = useTransition();

  function reset() {
    setSymbol(""); setLabel(""); setCondition("above"); setPrice(""); setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = parseFloat(price);
    if (!symbol.trim()) { setError("Symbol is required."); return; }
    if (!label.trim())  { setError("Label is required."); return; }
    if (!Number.isFinite(p) || p <= 0) { setError("Enter a valid positive price."); return; }
    setError(null);
    startT(async () => {
      try {
        const res = await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, label, condition, targetPrice: p }),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json() as PersistedPriceAlert;
        onCreated(created);
        reset();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save alert.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-[0.4rem] border border-dashed border-white/10 px-3.5 py-2.5 text-[0.78rem] font-semibold text-slate-500 transition hover:border-[#00C884]/30 hover:text-[#00C884]"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M8 3v10M3 8h10" />
        </svg>
        New price alert
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[0.5rem] border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <p className="text-[0.82rem] font-semibold text-white">New price alert</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Symbol</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. XAUUSD"
            className="w-full rounded-[0.35rem] border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.78rem] text-slate-200 placeholder:text-slate-600 focus:border-[#00C884]/40 focus:outline-none"
          />
        </div>
        <div>
          <label className="block mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Gold breaks key level"
            className="w-full rounded-[0.35rem] border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.78rem] text-slate-200 placeholder:text-slate-600 focus:border-[#00C884]/40 focus:outline-none"
          />
        </div>
        <div>
          <label className="block mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as "above" | "below")}
            className="w-full rounded-[0.35rem] border border-white/8 bg-[#111210] px-3 py-1.5 text-[0.78rem] text-slate-200 focus:border-[#00C884]/40 focus:outline-none"
          >
            <option value="above">Price goes above</option>
            <option value="below">Price goes below</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">Target price</label>
          <input
            type="number"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 2400"
            className="w-full rounded-[0.35rem] border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.78rem] text-slate-200 placeholder:text-slate-600 focus:border-[#00C884]/40 focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="text-[0.72rem] text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-[0.35rem] bg-[#00C884]/15 px-4 py-1.5 text-[0.75rem] font-semibold text-[#00C884] ring-1 ring-[#00C884]/25 transition hover:bg-[#00C884]/25 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save alert"}
        </button>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          className="rounded-[0.35rem] px-4 py-1.5 text-[0.75rem] font-semibold text-slate-500 ring-1 ring-white/8 transition hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onToggle,
  onDelete,
}: {
  alert: PersistedPriceAlert;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [delPending, startDel] = useTransition();
  const [togPending, startTog] = useTransition();

  function handleDelete() {
    startDel(async () => {
      await fetch(`/api/alerts/${alert.id}`, { method: "DELETE" });
      onDelete(alert.id);
    });
  }

  function handleToggle() {
    const next = !alert.enabled;
    startTog(async () => {
      await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      onToggle(alert.id, next);
    });
  }

  const fired = !!alert.triggeredAt;

  return (
    <div className={`flex items-start justify-between gap-3 rounded-[0.45rem] border px-3.5 py-3 ${
      fired
        ? "border-amber-500/20 bg-amber-500/5"
        : alert.enabled
          ? "border-white/6 bg-white/[0.02]"
          : "border-white/4 bg-transparent opacity-50"
    }`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.82rem] font-semibold text-white">{alert.symbol}</span>
          <span className={`text-[0.70rem] font-semibold ${alert.condition === "above" ? "text-emerald-400" : "text-amber-300"}`}>
            {alert.condition === "above" ? "▲ above" : "▼ below"} {fmtPrice(alert.targetPrice)}
          </span>
          {fired && (
            <span className="rounded px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider bg-amber-900/40 text-amber-300">
              Fired {fmtDate(alert.triggeredAt!)}
            </span>
          )}
          {!fired && !alert.enabled && (
            <span className="rounded px-1.5 py-0.5 text-[0.60rem] font-semibold uppercase tracking-wider bg-white/[0.04] text-slate-500">
              Paused
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[0.72rem] text-slate-400">{alert.label}</p>
        <p className="mt-0.5 text-[0.65rem] text-slate-600">Created {fmtDate(alert.createdAt)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!fired && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={togPending}
            title={alert.enabled ? "Pause alert" : "Enable alert"}
            className="rounded-[0.3rem] px-2 py-1 text-[0.65rem] font-semibold ring-1 transition disabled:opacity-50 bg-white/[0.03] text-slate-400 ring-white/8 hover:text-slate-200"
          >
            {alert.enabled ? "Pause" : "Enable"}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={delPending}
          title="Delete alert"
          className="rounded-[0.3rem] p-1 text-slate-600 ring-1 ring-white/6 transition hover:text-red-400 disabled:opacity-50"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M3 4h10M6 4V3h4v1M5.5 4v8.5h5V4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function AlertsClient({ initialAlerts }: { initialAlerts: PersistedPriceAlert[] }) {
  const [alerts, setAlerts] = useState<PersistedPriceAlert[]>(initialAlerts);

  const active   = alerts.filter((a) => a.enabled && !a.triggeredAt);
  const fired    = alerts.filter((a) => a.triggeredAt);
  const paused   = alerts.filter((a) => !a.enabled && !a.triggeredAt);

  return (
    <div className="space-y-4">
      {/* Create */}
      <CreateAlertForm
        onCreated={(a) => setAlerts((prev) => [a, ...prev])}
      />

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-[5px]">
        {[
          { label: "Watching", value: active.length,  color: "text-[#00C884]/80" },
          { label: "Fired",    value: fired.length,   color: "text-amber-300" },
          { label: "Paused",   value: paused.length,  color: "text-slate-500" },
        ].map((s) => (
          <div key={s.label} className="signal-surface-soft rounded-[0.65rem] px-3 py-2.5">
            <p className="text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{s.label}</p>
            <p className={`mt-0.5 text-[1.1rem] font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {alerts.length === 0 ? (
        <div className="signal-surface-soft rounded-[0.65rem] px-4 py-8 text-center">
          <p className="text-[0.82rem] text-slate-500">
            No price alerts yet. Create one above — Siggi will fire a notification the moment price crosses your level.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onToggle={(id, enabled) =>
                setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, enabled } : a)))
              }
              onDelete={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
            />
          ))}
        </div>
      )}

      <p className="text-[0.68rem] leading-5 text-slate-600">
        Alerts are checked every time the market pulse runs (~15s). Notifications fire when price crosses your level —
        you'll get a toast in-app and an OS notification if you've enabled push access. Fired alerts stay visible until
        you delete them.
      </p>
    </div>
  );
}
