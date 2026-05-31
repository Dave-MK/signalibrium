"use client";

import Link from "next/link";
import { useState } from "react";
import type { PersistedTradeTicket } from "@/app/_lib/server/workspace-types";
import { formatCurrency, formatNumber, formatRiskReward } from "../../_lib/format";
import { updateTradeTicket } from "../../_lib/workspace-api";
import { ActionLink, KeyValue, PageHeader, Panel, StatusChip } from "../../_components/ui";

const statusCycle: PersistedTradeTicket["status"][] = [
  "Prepared",
  "Simulated Open",
  "Closed",
];

export default function TradeTicketDetailClient({
  initialTicket,
}: {
  initialTicket: PersistedTradeTicket;
}) {
  const [ticket, setTicket] = useState<PersistedTradeTicket>(initialTicket);
  const [draftNotes, setDraftNotes] = useState(initialTicket.notes);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdvanceStatus() {
    const currentIndex = statusCycle.indexOf(ticket.status);
    const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];

    try {
      setIsSaving(true);
      const updated = await updateTradeTicket(ticket.id, { status: nextStatus });
      setError(null);
      setTicket(updated);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update ticket");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveNotes() {
    try {
      setIsSaving(true);
      const updated = await updateTradeTicket(ticket.id, { notes: draftNotes });
      setError(null);
      setTicket(updated);
      setDraftNotes(updated.notes);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to save ticket notes");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Trade Ticket"
        title={`${ticket.symbol} protected trade ticket`}
        description={ticket.rationale}
        action={<ActionLink href="/journal">Save To Journal</ActionLink>}
      />

      <div className="grid gap-[5px] xl:grid-cols-[1.05fr_0.95fr]">
        <Panel className="p-3 sm:p-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="micro-label">Ticket Details</p>
              <h2 className="mt-1.5 text-lg font-semibold text-white sm:text-[1.15rem]">
                {ticket.strategy}
              </h2>
              <p className="mt-0.5 text-[0.84rem] text-slate-400">
                {ticket.side} / {ticket.orderType} / Protected simulation only
              </p>
            </div>
            <StatusChip label={ticket.status.toUpperCase()} />
          </div>

          <div className="mt-4 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-3">
            <KeyValue label="Entry" value={formatCurrency(ticket.entry)} />
            <KeyValue label="Stop-Loss" value={formatCurrency(ticket.stopLoss)} />
            <KeyValue label="Take-Profit" value={formatCurrency(ticket.takeProfit)} />
            <KeyValue
              label="Quantity"
              value={`${formatNumber(ticket.quantity, 0)} units`}
            />
            <KeyValue
              label="Estimated Value"
              value={formatCurrency(ticket.estimatedValue)}
            />
            <KeyValue
              label="Risk/Reward"
              value={formatRiskReward(ticket.riskReward)}
            />
            <KeyValue
              label="Planned Loss"
              value={formatCurrency(ticket.plannedLoss)}
            />
            <KeyValue
              label="Potential Gain"
              value={formatCurrency(ticket.potentialGain)}
            />
            <KeyValue
              label="Source Setup"
              value={ticket.sourceSetupId ?? "Manual"}
              detail={ticket.sourceAssetSymbol ?? "No linked asset source"}
            />
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Execution Actions</p>
          <div className="mt-3 panel-stack-5">
            <div className="signal-accent-surface rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Simulate protected trade</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                This saved ticket can move through prepared, simulated-open, and
                closed states while keeping its risk plan attached.
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Ticket Notes</p>
              <textarea
                rows={5}
                value={draftNotes}
                onChange={(event) => setDraftNotes(event.target.value)}
                className="signal-surface-soft mt-2 w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                placeholder="Execution notes, trigger conditions, and review comments..."
              />
              <div className="mt-3 flex flex-wrap gap-[5px]">
                <button
                  type="button"
                  onClick={() => void handleAdvanceStatus()}
                  disabled={isSaving}
                  className="signal-button rounded-[0.46rem] px-3 py-2 text-[0.78rem] font-semibold"
                >
                  {ticket.status === "Prepared"
                    ? "Simulate Open"
                    : ticket.status === "Simulated Open"
                      ? "Close Ticket"
                      : "Reset To Prepared"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveNotes()}
                  disabled={isSaving}
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                >
                  Save Notes
                </button>
                <Link
                  href="/trade-tickets"
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                >
                  Back To Tickets
                </Link>
              </div>
            </div>
          </div>
          {error ? <p className="mt-3 text-[0.82rem] text-amber-200">{error}</p> : null}
        </Panel>
      </div>

      <Panel className="p-3 sm:p-3.5">
        <p className="micro-label">Risk Gate Results</p>
        <div className="mt-4 grid gap-[5px] lg:grid-cols-2">
          {ticket.gateResults.map((gate) => (
            <div
              key={gate.label}
              className="signal-surface-soft rounded-[0.4rem] p-3"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-[0.9rem] font-semibold text-white">{gate.label}</p>
                <StatusChip label={gate.status} />
              </div>
              <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">{gate.detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
