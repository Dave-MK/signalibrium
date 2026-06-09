"use client";

/**
 * TradeTicketModal
 *
 * A slide-in modal for creating and submitting a manual trade ticket.
 * Can be opened blank or pre-filled from a prediction signal.
 *
 * Props:
 *   prefill        — optional values from a prediction card (entry/stop/target etc.)
 *   connections    — broker connections for the execution mode dropdown
 *   onClose        — close the modal
 *   onCreated      — callback with the created ticket
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { PersistedBrokerConnection } from "@/app/_lib/server/workspace-types";
import {
  createTradeTicketApi,
  submitTradeTicketApi,
  listBrokerConnectionsApi,
  type PersistedTradeTicket,
} from "@/app/_lib/workspace-api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TradeTicketPrefill = {
  symbol?:      string;
  side?:        "Long" | "Short";
  entry?:       number;
  stopLoss?:    number;
  takeProfit?:  number;
  strategy?:    string;
  rationale?:   string;
  /** Source prediction ID */
  predictionId?: string;
};

type Props = {
  prefill?:     TradeTicketPrefill;
  /** Pass connections if already loaded; otherwise the modal fetches them */
  connections?: PersistedBrokerConnection[];
  onClose:      () => void;
  onCreated?:   (ticket: PersistedTradeTicket) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dp(value: number) {
  if (value <= 0) return 2;
  if (value < 0.001) return 6;
  if (value < 10)    return 4;
  if (value < 1000)  return 2;
  return 0;
}

function fmt(value: number) {
  if (value <= 0) return "";
  const d = dp(value);
  return value.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
}

type ExecutionModeOption = {
  value: string;
  label: string;
  connectionId: string | null;
};

function buildModeOptions(connections: PersistedBrokerConnection[]): ExecutionModeOption[] {
  const opts: ExecutionModeOption[] = [{ value: "Paper", label: "Paper (no broker)", connectionId: null }];
  for (const c of connections) {
    if (c.status !== "connected") continue;
    for (const mode of c.executionModes) {
      opts.push({ value: mode, label: `${c.label} — ${mode}`, connectionId: c.id });
    }
  }
  return opts;
}

function inferOrderType(side: "Long" | "Short", currentPrice: number, entry: number): "Market" | "Limit" | "Stop Entry" {
  if (!currentPrice || !entry) return "Limit";
  if (side === "Long")  return entry < currentPrice ? "Limit" : "Stop Entry";
  return entry > currentPrice ? "Limit" : "Stop Entry";
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[0.64rem] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[0.62rem] text-slate-600">{hint}</p>}
    </div>
  );
}

const INPUT = "w-full rounded-[0.35rem] border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.78rem] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/40 focus:outline-none";
const SELECT = "w-full rounded-[0.35rem] border border-white/8 bg-[#07111d] px-3 py-1.5 text-[0.78rem] text-slate-200 focus:border-cyan-500/40 focus:outline-none";

// ─── Modal content ────────────────────────────────────────────────────────────

function ModalContent({ prefill = {}, connections: passedConnections, onClose, onCreated }: Props) {
  const [connections, setConnections] = useState<PersistedBrokerConnection[]>(passedConnections ?? []);
  const [loadingConns, setLoadingConns] = useState(!passedConnections);

  // Form state
  const [symbol,      setSymbol]      = useState(prefill.symbol      ?? "");
  const [side,        setSide]        = useState<"Long" | "Short">(prefill.side ?? "Long");
  const [orderType,   setOrderType]   = useState<"Limit" | "Market" | "Stop Entry">("Limit");
  const [execMode,    setExecMode]    = useState("Paper");
  const [tif,         setTif]         = useState<"DAY" | "GTC" | "IOC">("DAY");
  const [entryStr,    setEntryStr]    = useState(prefill.entry     ? String(prefill.entry)     : "");
  const [stopStr,     setStopStr]     = useState(prefill.stopLoss  ? String(prefill.stopLoss)  : "");
  const [targetStr,   setTargetStr]   = useState(prefill.takeProfit ? String(prefill.takeProfit) : "");
  const [qtyStr,      setQtyStr]      = useState("");
  const [notes,       setNotes]       = useState(prefill.rationale ?? "");
  const [error,       setError]       = useState<string | null>(null);
  const [draftPending, startDraft]    = useTransition();
  const [submitPending, startSubmit]  = useTransition();

  // Fetch connections if not passed
  useEffect(() => {
    if (passedConnections) return;
    setLoadingConns(true);
    listBrokerConnectionsApi()
      .then((res) => { setConnections(res.connections); })
      .catch(() => {})
      .finally(() => setLoadingConns(false));
  }, [passedConnections]);

  // Derived
  const entry     = parseFloat(entryStr)  || 0;
  const stop      = parseFloat(stopStr)   || 0;
  const target    = parseFloat(targetStr) || 0;
  const qty       = parseFloat(qtyStr)    || 0;

  const estValue    = entry > 0 && qty > 0 ? entry * qty : 0;
  const plannedLoss = entry > 0 && stop > 0 && qty > 0
    ? Math.abs(entry - stop) * qty : 0;
  const potentialGain = entry > 0 && target > 0 && qty > 0
    ? Math.abs(target - entry) * qty : 0;
  const rr = plannedLoss > 0 ? potentialGain / plannedLoss : 0;

  // Validate levels: for Long stop < entry < target, for Short target < entry < stop
  const levelsOk = entry > 0 && stop > 0 && target > 0 &&
    (side === "Long"  ? (stop < entry && entry < target)
                      : (target < entry && entry < stop));

  const modeOptions = buildModeOptions(connections);
  const selectedModeOpt = modeOptions.find((o) => o.value === execMode) ?? modeOptions[0];

  function buildTicketPayload() {
    return {
      symbol:         symbol.toUpperCase().trim(),
      strategy:       prefill.strategy ?? "Manual",
      side,
      orderType,
      executionMode:  execMode as PersistedTradeTicket["executionMode"],
      timeInForce:    tif,
      entry,
      stopLoss:       stop,
      takeProfit:     target,
      quantity:       qty,
      estimatedValue: estValue,
      plannedLoss,
      potentialGain,
      riskReward:     rr,
      status:         "Draft" as const,
      brokerStatus:   "Not Sent" as const,
      brokerReference: null,
      brokerDealId:   null,
      submittedAt:    null,
      filledAt:       null,
      closedAt:       null,
      executedEntry:  null,
      executedQuantity: null,
      realizedPnl:    null,
      unrealizedPnl:  null,
      rationale:      notes || `Manual trade — ${symbol.toUpperCase()}`,
      gateResults:    [],
      sourceSetupId:  prefill.predictionId ?? null,
      notes,
    };
  }

  function validate(): string | null {
    if (!symbol.trim()) return "Symbol is required.";
    if (entry <= 0)     return "Entry price is required.";
    if (stop  <= 0)     return "Stop loss is required.";
    if (target <= 0)    return "Take profit is required.";
    if (qty   <= 0)     return "Quantity is required.";
    if (!levelsOk) {
      return side === "Long"
        ? "For a Long: stop must be below entry, and target above entry."
        : "For a Short: target must be below entry, and stop above entry.";
    }
    return null;
  }

  function handleSaveDraft() {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    startDraft(async () => {
      try {
        const res = await createTradeTicketApi({ ...buildTicketPayload(), status: "Draft" });
        onCreated?.(res.ticket);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save draft.");
      }
    });
  }

  function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    if (execMode === "Paper") { setError("Select a live or demo broker to submit an order."); return; }
    setError(null);
    startSubmit(async () => {
      try {
        // Create with "Ready" status first
        const created = await createTradeTicketApi({ ...buildTicketPayload(), status: "Ready" });
        // Then submit to broker using the matched connection
        const submitted = await submitTradeTicketApi(created.ticket.id, {
          connectionId: selectedModeOpt?.connectionId ?? undefined,
        });
        onCreated?.(submitted.ticket);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to submit order.");
      }
    });
  }

  const isPending = draftPending || submitPending;

  return (
    <div className="fixed inset-0 z-[9995] flex items-end justify-center sm:items-center" aria-modal="true" role="dialog" aria-label="New trade ticket">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-t-[1rem] sm:rounded-[0.72rem] sm:max-w-lg bg-[#07111d] border border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#07111d] px-4 py-3.5">
          <div>
            <p className="text-[0.88rem] font-bold text-white">New trade ticket</p>
            {prefill.symbol && (
              <p className="text-[0.68rem] text-slate-500">Pre-filled from signal · {prefill.symbol}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/8 hover:text-slate-200"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m3 3 10 10M13 3 3 13" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Symbol + side */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Symbol">
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. AAPL"
                className={INPUT}
                disabled={!!prefill.symbol}
              />
            </Field>
            <Field label="Direction">
              <div className="flex rounded-[0.35rem] overflow-hidden border border-white/8">
                {(["Long", "Short"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className={`flex-1 py-1.5 text-[0.78rem] font-semibold transition ${
                      side === s
                        ? s === "Long"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-red-500/20 text-red-300"
                        : "bg-white/[0.02] text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {s === "Long" ? "▲ Long" : "▼ Short"}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Entry" hint={side === "Long" ? "Buy at" : "Sell at"}>
              <input type="number" step="any" value={entryStr} onChange={(e) => setEntryStr(e.target.value)} placeholder="0.00" className={INPUT} />
            </Field>
            <Field label="Stop loss" hint={side === "Long" ? "Below entry" : "Above entry"}>
              <input type="number" step="any" value={stopStr} onChange={(e) => setStopStr(e.target.value)} placeholder="0.00" className={INPUT} />
            </Field>
            <Field label="Take profit" hint={side === "Long" ? "Above entry" : "Below entry"}>
              <input type="number" step="any" value={targetStr} onChange={(e) => setTargetStr(e.target.value)} placeholder="0.00" className={INPUT} />
            </Field>
          </div>

          {/* Levels validation hint */}
          {entry > 0 && stop > 0 && target > 0 && !levelsOk && (
            <p className="rounded-[0.35rem] bg-amber-500/10 px-3 py-1.5 text-[0.72rem] text-amber-300">
              {side === "Long"
                ? "Stop must be below entry and target above entry."
                : "Target must be below entry and stop above entry."}
            </p>
          )}

          {/* Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" hint="Units / shares / contracts">
              <input type="number" step="any" value={qtyStr} onChange={(e) => setQtyStr(e.target.value)} placeholder="0" className={INPUT} />
            </Field>
            <Field label="Order type">
              <select value={orderType} onChange={(e) => setOrderType(e.target.value as typeof orderType)} className={SELECT}>
                <option value="Limit">Limit</option>
                <option value="Market">Market</option>
                <option value="Stop Entry">Stop entry</option>
              </select>
            </Field>
          </div>

          {/* Execution + time-in-force */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Execution" hint={loadingConns ? "Loading connections…" : undefined}>
              <select value={execMode} onChange={(e) => setExecMode(e.target.value)} className={SELECT} disabled={loadingConns}>
                {modeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Time in force">
              <select value={tif} onChange={(e) => setTif(e.target.value as typeof tif)} className={SELECT}>
                <option value="DAY">Day</option>
                <option value="GTC">GTC</option>
                <option value="IOC">IOC</option>
              </select>
            </Field>
          </div>

          {/* Risk / reward summary */}
          {entry > 0 && stop > 0 && target > 0 && qty > 0 && levelsOk && (
            <div className="grid grid-cols-4 gap-[5px] rounded-[0.4rem] border border-white/6 bg-white/[0.015] p-3">
              {[
                { label: "Est. value",   value: fmt(estValue),     cls: "text-slate-200" },
                { label: "Planned loss", value: fmt(plannedLoss),  cls: "text-red-300"   },
                { label: "Potential",    value: fmt(potentialGain), cls: "text-emerald-300" },
                { label: "R:R",          value: rr > 0 ? `${rr.toFixed(2)}R` : "—", cls: rr >= 1.5 ? "text-emerald-300" : rr >= 1 ? "text-amber-200" : "text-red-300" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[0.60rem] text-slate-600">{s.label}</p>
                  <p className={`text-[0.82rem] font-semibold tabular-nums ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Why you're taking this trade…"
              className={`${INPUT} resize-none`}
            />
          </Field>

          {/* Error */}
          {error && (
            <p className="rounded-[0.35rem] bg-red-500/10 px-3 py-1.5 text-[0.73rem] text-red-300">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1 border-t border-white/6">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isPending}
              className="flex-1 rounded-[0.4rem] border border-white/8 py-2 text-[0.78rem] font-semibold text-slate-300 transition hover:border-white/16 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {draftPending ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || execMode === "Paper"}
              title={execMode === "Paper" ? "Select a broker to submit" : undefined}
              className="flex-1 rounded-[0.4rem] bg-cyan-500/15 py-2 text-[0.78rem] font-semibold text-cyan-200 ring-1 ring-cyan-500/25 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitPending ? "Submitting…" : "Submit to broker"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Exported modal wrapper (portal) ─────────────────────────────────────────

export function TradeTicketModal(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<ModalContent {...props} />, document.body);
}

// ─── Convenience trigger button ───────────────────────────────────────────────

export function TradeThisButton({
  prefill,
  connections,
  label = "Trade this",
  className,
}: {
  prefill:      TradeTicketPrefill;
  connections?: PersistedBrokerConnection[];
  label?:       string;
  className?:   string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex items-center gap-1.5 rounded-[0.3rem] bg-cyan-500/10 px-2.5 py-1 text-[0.70rem] font-semibold text-cyan-300 ring-1 ring-cyan-500/20 transition hover:bg-cyan-500/20"
        }
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
        {label}
      </button>

      {open && (
        <TradeTicketModal
          prefill={prefill}
          connections={connections}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
