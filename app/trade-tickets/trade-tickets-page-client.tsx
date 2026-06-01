"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PersistedScannerResult,
  PersistedTradeTicket,
} from "@/app/_lib/server/workspace-types";
import { ActionLink, KeyValue, PageHeader, Panel, StatusChip } from "../_components/ui";
import { formatCurrency, formatRiskReward } from "../_lib/format";
import {
  buildTradeTicketInputFromScannerResult,
} from "../_lib/reference-data";
import {
  createTradeTicket,
  deleteTradeTicket,
  updateTradeTicket,
} from "../_lib/workspace-api";

const statusCycle: PersistedTradeTicket["status"][] = [
  "Prepared",
  "Simulated Open",
  "Closed",
];

export default function TradeTicketsPageClient({
  initialTradeTickets,
  scannerResults,
}: {
  initialTradeTickets: PersistedTradeTicket[];
  scannerResults: PersistedScannerResult[];
}) {
  const [tradeTickets, setTradeTickets] = useState<PersistedTradeTicket[]>(initialTradeTickets);
  const [selectedSetupId, setSelectedSetupId] = useState(scannerResults[0]?.id ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateTradeTicket() {
    try {
      const scannerResult = scannerResults.find((result) => result.id === selectedSetupId);

      if (!scannerResult) {
        throw new Error("Scanner result not found");
      }

      setIsSaving(true);
      setError(null);
      const nextTicket = await createTradeTicket(
        buildTradeTicketInputFromScannerResult(scannerResult),
      );
      setTradeTickets((current) => [nextTicket, ...current]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create trade ticket");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdvanceStatus(ticket: PersistedTradeTicket) {
    const currentIndex = statusCycle.indexOf(ticket.status);
    const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];

    try {
      setIsSaving(true);
      setError(null);
      const updated = await updateTradeTicket(ticket.id, {
        status: nextStatus,
      });
      setTradeTickets((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update ticket");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteTradeTicket(ticketId: string) {
    try {
      setIsSaving(true);
      setError(null);
      await deleteTradeTicket(ticketId);
      setTradeTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete ticket");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Protected Trade Tickets"
        title="Prepare the trade before the click exists"
        description="The prototype ticket surface is for protected planning, simulation, and journaling. No auto-trading, no blind execution, and no unbounded risk."
        action={<ActionLink href="/journal">Save Flow To Journal</ActionLink>}
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] xl:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <p className="micro-label">Prepare From Setup</p>
            <div className="mt-3 grid gap-[5px] sm:grid-cols-[minmax(0,1fr)_190px]">
              <select
                value={selectedSetupId}
                onChange={(event) => setSelectedSetupId(event.target.value)}
                className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
              >
                {scannerResults.map((setup) => (
                  <option key={setup.id} value={setup.id}>
                    {setup.symbol} / {setup.strategy} / {setup.tradeability}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleCreateTradeTicket()}
                disabled={isSaving}
                className="signal-button rounded-[0.46rem] px-3.5 py-2 text-[0.82rem] font-semibold"
              >
                Create Ticket
              </button>
            </div>
          </div>

          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Live Count</p>
            <p className="mt-2 text-[1.35rem] font-semibold text-white">
              {tradeTickets.length}
            </p>
            <p className="mt-1 text-[0.8rem] text-slate-400">
              Persisted tickets in the local workspace store.
            </p>
          </div>
        </div>

        {error ? <p className="mt-3 text-[0.82rem] text-amber-200">{error}</p> : null}
      </Panel>

      <div className="grid gap-[5px] xl:grid-cols-2">
        {tradeTickets.map((ticket) => (
          <Panel key={ticket.id} className="h-full p-3 sm:p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="micro-label">Prepared protected trade</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Link
                    href={`/trade-tickets/${ticket.id}`}
                    className="text-lg font-semibold text-white transition hover:text-cyan-200 sm:text-[1.15rem]"
                  >
                    {ticket.symbol}
                  </Link>
                  <StatusChip label={ticket.status.toUpperCase()} />
                </div>
                <p className="mt-0.5 text-[0.84rem] text-slate-400">
                  {ticket.strategy} / {ticket.side} / {ticket.orderType}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-[5px] sm:grid-cols-2">
              <KeyValue label="Entry" value={formatCurrency(ticket.entry)} />
              <KeyValue
                label="Stop"
                value={formatCurrency(ticket.stopLoss)}
                tooltip="The planned exit level that caps downside if the trade invalidates."
              />
              <KeyValue
                label="Target"
                value={formatCurrency(ticket.takeProfit)}
                tooltip="The planned first profit objective for the ticket."
              />
              <KeyValue
                label="Risk/Reward"
                value={formatRiskReward(ticket.riskReward)}
                tooltip="Projected upside divided by planned downside from entry to stop-loss."
              />
              <KeyValue
                label="Planned Loss"
                value={formatCurrency(ticket.plannedLoss)}
                tooltip="Expected loss if the trade fills and then reaches the stop-loss."
              />
              <KeyValue
                label="Potential Gain"
                value={formatCurrency(ticket.potentialGain)}
                tooltip="Expected gain if the trade fills and then reaches the take-profit target."
              />
            </div>

            <p className="mt-3 text-[0.82rem] leading-5 text-slate-300">{ticket.rationale}</p>

            <div className="mt-3 flex flex-wrap gap-[5px]">
              <button
                type="button"
                onClick={() => void handleAdvanceStatus(ticket)}
                disabled={isSaving}
                className="signal-accent-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
              >
                {ticket.status === "Prepared"
                  ? "Simulate Open"
                  : ticket.status === "Simulated Open"
                    ? "Close Ticket"
                    : "Reset To Prepared"}
              </button>
              <Link
                href={`/trade-tickets/${ticket.id}`}
                className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
              >
                Open Detail
              </Link>
              <button
                type="button"
                onClick={() => void handleDeleteTradeTicket(ticket.id)}
                disabled={isSaving}
                className="signal-warning-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-amber-100"
              >
                Delete
              </button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
