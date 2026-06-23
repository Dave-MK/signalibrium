"use client";

import { useState, useTransition } from "react";
import type { PersistedTradeTicket } from "@/app/_lib/server/workspace-types";
import type { PersistedBrokerConnection } from "@/app/_lib/server/workspace-types";
import {
  submitTradeTicketApi,
  cancelTradeTicketApi,
  deleteTradeTicketApi,
} from "@/app/_lib/workspace-api";
import { TradeTicketModal } from "@/app/_components/trade-ticket-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function StatusBadge({ status }: { status: PersistedTradeTicket["status"] }) {
  const cls =
    status === "Filled"   ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25" :
    status === "Working"  ? "bg-[#00C884]/15 text-[#00C884] ring-[#00C884]/25" :
    status === "Submitted"? "bg-blue-500/15 text-blue-300 ring-blue-500/25" :
    status === "Cancelled"|| status === "Rejected" ? "bg-red-500/15 text-red-300 ring-red-500/25" :
    status === "Ready"    ? "bg-amber-500/15 text-amber-300 ring-amber-500/25" :
    "bg-white/5 text-slate-400 ring-white/8";
  return (
    <span className={`inline-flex items-center rounded-[0.25rem] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider ring-1 ${cls}`}>
      {status}
    </span>
  );
}

// ─── Ticket row ───────────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  connections,
  onUpdate,
  onDelete,
}: {
  ticket:      PersistedTradeTicket;
  connections: PersistedBrokerConnection[];
  onUpdate:    (t: PersistedTradeTicket) => void;
  onDelete:    (id: string) => void;
}) {
  const [submitPending, startSubmit] = useTransition();
  const [cancelPending, startCancel] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = ticket.status === "Draft" || ticket.status === "Ready";
  const canCancel = !["Cancelled", "Rejected", "Closed", "Filled"].includes(ticket.status);
  const canDelete = ticket.status === "Draft" || ticket.status === "Ready";

  const rr     = ticket.riskReward;
  const isLong = ticket.side === "Long";

  function handleSubmit() {
    setErr(null);
    startSubmit(async () => {
      try {
        const res = await submitTradeTicketApi(ticket.id, {});
        onUpdate(res.ticket);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Submission failed.");
      }
    });
  }

  function handleCancel() {
    setErr(null);
    startCancel(async () => {
      try {
        const res = await cancelTradeTicketApi(ticket.id);
        onUpdate(res.ticket);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Cancel failed.");
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      try {
        await deleteTradeTicketApi(ticket.id);
        onDelete(ticket.id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Delete failed.");
      }
    });
  }

  return (
    <div className="border-b border-white/6 px-3 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.9rem] font-bold text-white">{ticket.symbol}</span>
            <span className={`text-[0.80rem] font-semibold ${isLong ? "text-emerald-300" : "text-amber-200"}`}>
              {isLong ? "▲ Long" : "▼ Short"}
            </span>
            <StatusBadge status={ticket.status} />
            <span className="text-[0.65rem] text-slate-500">{ticket.executionMode}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.72rem] text-slate-400">
            <span>Entry <span className="font-medium text-slate-200">{fmt(ticket.entry)}</span></span>
            <span>Stop <span className="font-medium text-red-300">{fmt(ticket.stopLoss)}</span></span>
            <span>Target <span className="font-medium text-emerald-300">{fmt(ticket.takeProfit)}</span></span>
            <span>Qty <span className="font-medium text-slate-200">{fmt(ticket.quantity, 4)}</span></span>
            {rr > 0 && <span>R:R <span className={`font-semibold ${rr >= 1.5 ? "text-emerald-300" : rr >= 1 ? "text-amber-200" : "text-red-300"}`}>{rr.toFixed(2)}R</span></span>}
          </div>
          {ticket.brokerReference && (
            <p className="mt-1 text-[0.66rem] text-slate-600">
              Broker ref: {ticket.brokerReference}
              {ticket.submittedAt && ` · Submitted ${fmtDate(ticket.submittedAt)}`}
            </p>
          )}
          {ticket.executedEntry && (
            <p className="mt-0.5 text-[0.66rem] text-slate-500">
              Filled @ {fmt(ticket.executedEntry)} · qty {fmt(ticket.executedQuantity, 4)}
            </p>
          )}
          {ticket.notes && (
            <p className="mt-1.5 text-[0.72rem] leading-[1.4] text-slate-500">{ticket.notes}</p>
          )}
          {err && <p className="mt-1 text-[0.70rem] text-red-400">{err}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <p className="text-[0.62rem] text-slate-600">{fmtDate(ticket.createdAt)}</p>
          <div className="flex gap-1.5">
            {canSubmit && ticket.executionMode !== "Paper" && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitPending}
                className="rounded-[0.3rem] bg-[#00C884]/12 px-2.5 py-1 text-[0.68rem] font-semibold text-[#00C884] ring-1 ring-[#00C884]/20 transition hover:bg-[#00C884]/22 disabled:opacity-40"
              >
                {submitPending ? "Submitting…" : "Submit"}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelPending}
                className="rounded-[0.3rem] px-2.5 py-1 text-[0.68rem] font-semibold text-amber-300/70 ring-1 ring-amber-500/15 transition hover:text-amber-300 disabled:opacity-40"
              >
                {cancelPending ? "…" : "Cancel"}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePending}
                title="Delete ticket"
                className="flex h-6 w-6 items-center justify-center rounded-[0.3rem] text-slate-600 ring-1 ring-white/6 transition hover:text-red-400 disabled:opacity-40"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3 4h10M6 4V3h4v1M5.5 4v8.5h5V4" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

type StatusFilter = "All" | "Active" | "Filled" | "Cancelled";

export function TicketsClient({
  initialTickets,
  connections,
}: {
  initialTickets: PersistedTradeTicket[];
  connections:    PersistedBrokerConnection[];
}) {
  const [tickets,   setTickets]   = useState<PersistedTradeTicket[]>(initialTickets);
  const [filter,    setFilter]    = useState<StatusFilter>("All");
  const [modalOpen, setModalOpen] = useState(false);

  function upsertTicket(t: PersistedTradeTicket) {
    setTickets((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx === -1) return [t, ...prev];
      const next = [...prev];
      next[idx] = t;
      return next;
    });
  }

  const filtered = tickets.filter((t) => {
    if (filter === "Active")    return ["Draft","Ready","Submitted","Working","Partially Closed"].includes(t.status);
    if (filter === "Filled")    return t.status === "Filled" || t.status === "Closed";
    if (filter === "Cancelled") return t.status === "Cancelled" || t.status === "Rejected";
    return true;
  });

  const activeCount    = tickets.filter((t) => ["Draft","Ready","Submitted","Working","Partially Closed"].includes(t.status)).length;
  const filledCount    = tickets.filter((t) => t.status === "Filled" || t.status === "Closed").length;
  const cancelledCount = tickets.filter((t) => t.status === "Cancelled" || t.status === "Rejected").length;

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between gap-3">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {(["All", "Active", "Filled", "Cancelled"] as StatusFilter[]).map((f) => {
            const count = f === "All" ? tickets.length : f === "Active" ? activeCount : f === "Filled" ? filledCount : cancelledCount;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-[0.30rem] px-2.5 py-1 text-[0.68rem] font-semibold ring-1 transition ${
                  filter === f
                    ? "bg-[#00C884]/15 text-[#00C884]/80 ring-[#00C884]/30"
                    : "bg-white/[0.03] text-slate-500 ring-white/8 hover:text-slate-300"
                }`}
              >
                {f} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* New ticket button */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-[0.38rem] bg-[#00C884]/12 px-3 py-1.5 text-[0.76rem] font-semibold text-[#00C884] ring-1 ring-[#00C884]/20 transition hover:bg-[#00C884]/22"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M8 3v10M3 8h10" />
          </svg>
          New ticket
        </button>
      </div>

      {/* Ticket list */}
      <div className="overflow-hidden rounded-[0.55rem] border border-white/8 bg-white/[0.015]">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[0.82rem] text-slate-500">
              {tickets.length === 0
                ? "No trade tickets yet. Create one here or click \"Trade this\" on any live signal in Signal History."
                : `No ${filter.toLowerCase()} tickets.`}
            </p>
          </div>
        ) : (
          filtered.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              connections={connections}
              onUpdate={upsertTicket}
              onDelete={(id) => setTickets((prev) => prev.filter((x) => x.id !== id))}
            />
          ))
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <TradeTicketModal
          connections={connections}
          onClose={() => setModalOpen(false)}
          onCreated={(t) => { upsertTicket(t); setModalOpen(false); }}
        />
      )}
    </div>
  );
}
