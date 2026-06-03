"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  PersistedAssetRecord,
  PersistedScannerResult,
  PersistedTradeTicket,
} from "@/app/_lib/server/workspace-types";
import { ActionLink, KeyValue, PageHeader, Panel, StatusChip } from "../_components/ui";
import { formatCurrency, formatNumber, formatRiskReward } from "../_lib/format";
import { buildTradeTicketInputFromScannerResult } from "../_lib/reference-data";
import {
  cancelTradeTicket,
  closeTradeTicket,
  createTradeTicket,
  deleteTradeTicket,
  fillTradeTicket,
  submitTradeTicket,
} from "../_lib/workspace-api";

type TicketDraft = Omit<PersistedTradeTicket, "id" | "createdAt" | "updatedAt">;

const readyStatuses: PersistedTradeTicket["status"][] = ["Draft", "Ready"];
const workingStatuses: PersistedTradeTicket["status"][] = ["Submitted", "Working"];
const openStatuses: PersistedTradeTicket["status"][] = ["Filled", "Partially Closed"];
const historyStatuses: PersistedTradeTicket["status"][] = ["Closed", "Cancelled", "Rejected"];

function recalculateDraft(draft: TicketDraft, overrides: Partial<TicketDraft> = {}): TicketDraft {
  const next = { ...draft, ...overrides };
  const estimatedValue = Number((next.entry * next.quantity).toFixed(2));
  const plannedLoss = Number((Math.abs(next.entry - next.stopLoss) * next.quantity).toFixed(2));
  const potentialGain = Number((Math.abs(next.takeProfit - next.entry) * next.quantity).toFixed(2));
  const riskReward = plannedLoss > 0 ? Number((potentialGain / plannedLoss).toFixed(2)) : 0;

  return {
    ...next,
    estimatedValue,
    plannedLoss,
    potentialGain,
    riskReward,
  };
}

function summarizeBrokerConnection(tickets: PersistedTradeTicket[]) {
  const liveModes = tickets.filter((ticket) => ticket.executionMode !== "Paper").length;
  const paperModes = tickets.length - liveModes;

  if (liveModes === 0) {
    return "Paper execution is active. The desk is now structured like a real order queue, but live broker routing still needs to be armed before production use.";
  }

  if (paperModes === 0) {
    return "All queued tickets are configured for broker-linked execution modes.";
  }

  return `${liveModes} ticket${liveModes === 1 ? "" : "s"} are set for broker-linked modes and ${paperModes} remain in paper mode.`;
}

function TicketSection({
  title,
  description,
  tickets,
  assetsBySymbol,
  isBusy,
  onClose,
  onDelete,
  onFill,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  tickets: PersistedTradeTicket[];
  assetsBySymbol: Map<string, PersistedAssetRecord>;
  isBusy: boolean;
  onClose: (ticketId: string) => Promise<void>;
  onDelete: (ticketId: string) => Promise<void>;
  onFill: (ticketId: string) => Promise<void>;
  onSubmit: (ticketId: string) => Promise<void>;
  onCancel: (ticketId: string) => Promise<void>;
}) {
  return (
    <Panel className="p-3 sm:p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="micro-label">{title}</p>
          <p className="mt-1 text-[0.82rem] leading-5 text-slate-400">{description}</p>
        </div>
        <StatusChip label={String(tickets.length)} />
      </div>

      {tickets.length === 0 ? (
        <div className="signal-surface-soft mt-3 rounded-[0.4rem] p-3 text-[0.82rem] text-slate-400">
          No tickets in this stage.
        </div>
      ) : (
        <div className="mt-3 grid gap-[5px]">
          {tickets.map((ticket) => {
            const asset = assetsBySymbol.get(ticket.symbol);
            const livePrice = asset?.price ?? ticket.executedEntry ?? ticket.entry;
            const unrealizedPnl =
              ticket.status === "Filled" || ticket.status === "Partially Closed"
                ? Number(
                    (((ticket.side === "Long"
                      ? livePrice - (ticket.executedEntry ?? ticket.entry)
                      : (ticket.executedEntry ?? ticket.entry) - livePrice) *
                      (ticket.executedQuantity ?? ticket.quantity))).toFixed(2),
                  )
                : ticket.unrealizedPnl;

            return (
              <div key={ticket.id} className="signal-surface rounded-[0.4rem] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[0.96rem] font-semibold text-white">{ticket.symbol}</h2>
                      <StatusChip label={ticket.status.toUpperCase()} />
                      <StatusChip label={ticket.executionMode.toUpperCase()} />
                    </div>
                    <p className="mt-1 text-[0.8rem] text-slate-400">
                      {ticket.strategy} · {ticket.side} · {ticket.orderType} · {ticket.timeInForce}
                    </p>
                    <p className="mt-2 max-w-3xl text-[0.82rem] leading-5 text-slate-300">
                      {ticket.rationale}
                    </p>
                  </div>

                  <Link
                    href={`/trade-tickets/${ticket.id}`}
                    className="text-[0.78rem] font-medium text-slate-400 transition hover:text-white"
                  >
                    Open Ticket
                  </Link>
                </div>

                <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
                  <KeyValue label="Entry" value={formatCurrency(ticket.entry)} />
                  <KeyValue label="Stop" value={formatCurrency(ticket.stopLoss)} />
                  <KeyValue label="Target" value={formatCurrency(ticket.takeProfit)} />
                  <KeyValue label="Qty" value={formatNumber(ticket.quantity, 0)} />
                  <KeyValue label="Risk / Reward" value={formatRiskReward(ticket.riskReward)} />
                  <KeyValue label="Planned Loss" value={formatCurrency(ticket.plannedLoss)} />
                  <KeyValue label="Live Price" value={formatCurrency(livePrice)} />
                  <KeyValue
                    label={ticket.status === "Closed" ? "Realized PnL" : "Unrealized PnL"}
                    value={formatCurrency(ticket.status === "Closed" ? ticket.realizedPnl ?? 0 : unrealizedPnl ?? 0)}
                    detail={ticket.executedEntry ? `Exec ${formatCurrency(ticket.executedEntry)}` : "Not filled yet"}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-[5px]">
                  {(ticket.status === "Ready" || ticket.status === "Draft") ? (
                    <button
                      type="button"
                      onClick={() => void onSubmit(ticket.id)}
                      disabled={isBusy}
                      className="signal-button rounded-[0.46rem] px-3 py-2 text-[0.78rem] font-semibold"
                    >
                      Place Order
                    </button>
                  ) : null}

                  {(ticket.status === "Submitted" || ticket.status === "Working") ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void onFill(ticket.id)}
                        disabled={isBusy}
                        className="signal-accent-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                      >
                        Simulate Fill
                      </button>
                      <button
                        type="button"
                        onClick={() => void onCancel(ticket.id)}
                        disabled={isBusy}
                        className="signal-warning-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-amber-100"
                      >
                        Cancel Order
                      </button>
                    </>
                  ) : null}

                  {(ticket.status === "Filled" || ticket.status === "Partially Closed") ? (
                    <button
                      type="button"
                      onClick={() => void onClose(ticket.id)}
                      disabled={isBusy}
                      className="signal-accent-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                    >
                      Close Position
                    </button>
                  ) : null}

                  {ticket.status === "Cancelled" || ticket.status === "Closed" || ticket.status === "Rejected" ? (
                    <button
                      type="button"
                      onClick={() => void onDelete(ticket.id)}
                      disabled={isBusy}
                      className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                    >
                      Remove From Desk
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export default function TradeTicketsPageClient({
  assets,
  initialTradeTickets,
  scannerResults,
}: {
  assets: PersistedAssetRecord[];
  initialTradeTickets: PersistedTradeTicket[];
  scannerResults: PersistedScannerResult[];
}) {
  const [tradeTickets, setTradeTickets] = useState<PersistedTradeTicket[]>(initialTradeTickets);
  const [selectedSetupId, setSelectedSetupId] = useState(scannerResults[0]?.id ?? "");
  const [draft, setDraft] = useState<TicketDraft | null>(
    scannerResults[0] ? buildTradeTicketInputFromScannerResult(scannerResults[0]) : null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assetsBySymbol = useMemo(
    () => new Map(assets.map((asset) => [asset.symbol, asset])),
    [assets],
  );

  const readyQueue = tradeTickets.filter((ticket) => readyStatuses.includes(ticket.status));
  const workingOrders = tradeTickets.filter((ticket) => workingStatuses.includes(ticket.status));
  const openPositions = tradeTickets.filter((ticket) => openStatuses.includes(ticket.status));
  const history = tradeTickets.filter((ticket) => historyStatuses.includes(ticket.status));

  async function handleCreateTradeTicket() {
    if (!draft) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      const nextTicket = await createTradeTicket(draft);
      setTradeTickets((current) => [nextTicket, ...current]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create trade ticket");
    } finally {
      setIsSaving(false);
    }
  }

  async function syncTicket(
    ticketId: string,
    action: (value: string) => Promise<PersistedTradeTicket>,
  ) {
    try {
      setIsSaving(true);
      setError(null);
      const updated = await action(ticketId);
      setTradeTickets((current) =>
        current.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update ticket");
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
      setError(deleteError instanceof Error ? deleteError.message : "Unable to remove trade ticket");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSetupChange(nextSetupId: string) {
    const setup = scannerResults.find((item) => item.id === nextSetupId);
    setSelectedSetupId(nextSetupId);

    if (!setup) {
      return;
    }

    setDraft(buildTradeTicketInputFromScannerResult(setup));
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Execution"
        title="Place orders and manage positions like a desk"
        description="The execution workspace now behaves like an order desk: build the ticket, send it into the queue, watch it sit as a working order, then manage the open position and close it out with the risk plan still attached."
        action={<ActionLink href="/scanner">Back To Opportunities</ActionLink>}
      />

      <div className="grid gap-[5px] xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Order Ticket</p>
          <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
            <label className="panel-stack-5">
              <span className="micro-label">Setup</span>
              <select
                value={selectedSetupId}
                onChange={(event) => handleSetupChange(event.target.value)}
                className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
              >
                {scannerResults.map((setup) => (
                  <option key={setup.id} value={setup.id}>
                    {setup.symbol} / {setup.strategy}
                  </option>
                ))}
              </select>
            </label>

            <label className="panel-stack-5">
              <span className="micro-label">Execution Mode</span>
              <select
                value={draft?.executionMode ?? "Paper"}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? recalculateDraft(current, {
                          executionMode: event.target.value as TicketDraft["executionMode"],
                        })
                      : current,
                  )
                }
                className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
              >
                <option value="Paper">Paper</option>
                <option value="IG Demo">IG Demo</option>
                <option value="IG Live">IG Live</option>
              </select>
            </label>

            <label className="panel-stack-5">
              <span className="micro-label">Order Type</span>
              <select
                value={draft?.orderType ?? "Limit"}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? recalculateDraft(current, {
                          orderType: event.target.value as TicketDraft["orderType"],
                          timeInForce:
                            event.target.value === "Market" ? "IOC" : current.timeInForce,
                        })
                      : current,
                  )
                }
                className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
              >
                <option value="Limit">Limit</option>
                <option value="Market">Market</option>
                <option value="Stop Entry">Stop Entry</option>
              </select>
            </label>

            <label className="panel-stack-5">
              <span className="micro-label">Time In Force</span>
              <select
                value={draft?.timeInForce ?? "DAY"}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? recalculateDraft(current, {
                          timeInForce: event.target.value as TicketDraft["timeInForce"],
                        })
                      : current,
                  )
                }
                className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
              >
                <option value="DAY">DAY</option>
                <option value="GTC">GTC</option>
                <option value="IOC">IOC</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
            {[
              { key: "entry", label: "Entry" },
              { key: "stopLoss", label: "Stop" },
              { key: "takeProfit", label: "Target" },
              { key: "quantity", label: "Quantity" },
            ].map((field) => (
              <label key={field.key} className="panel-stack-5">
                <span className="micro-label">{field.label}</span>
                <input
                  type="number"
                  step="0.01"
                  value={draft ? draft[field.key as keyof TicketDraft] as number : ""}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? recalculateDraft(current, {
                            [field.key]: Number(event.target.value),
                          } as Partial<TicketDraft>)
                        : current,
                    )
                  }
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
            <KeyValue label="Estimated Value" value={formatCurrency(draft?.estimatedValue ?? 0)} />
            <KeyValue label="Planned Loss" value={formatCurrency(draft?.plannedLoss ?? 0)} />
            <KeyValue label="Potential Gain" value={formatCurrency(draft?.potentialGain ?? 0)} />
            <KeyValue label="Risk / Reward" value={formatRiskReward(draft?.riskReward ?? 0)} />
          </div>

          <div className="mt-3 flex flex-wrap gap-[5px]">
            <button
              type="button"
              onClick={() => void handleCreateTradeTicket()}
              disabled={isSaving || !draft}
              className="signal-button rounded-[0.46rem] px-3.5 py-2 text-[0.82rem] font-semibold"
            >
              Create Ticket
            </button>
            {draft ? (
              <button
                type="button"
                onClick={() =>
                  setDraft((current) =>
                    current ? { ...current, status: "Draft" } : current,
                  )
                }
                disabled={isSaving}
                className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
              >
                Save As Draft
              </button>
            ) : null}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Desk Summary</p>
          <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="micro-label">Ready Queue</p>
              <p className="mt-1.5 text-[1.2rem] font-semibold text-white">{readyQueue.length}</p>
              <p className="mt-1 text-[0.78rem] text-slate-400">Tickets waiting to be placed.</p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="micro-label">Working Orders</p>
              <p className="mt-1.5 text-[1.2rem] font-semibold text-white">{workingOrders.length}</p>
              <p className="mt-1 text-[0.78rem] text-slate-400">Orders resting in the book.</p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="micro-label">Open Positions</p>
              <p className="mt-1.5 text-[1.2rem] font-semibold text-white">{openPositions.length}</p>
              <p className="mt-1 text-[0.78rem] text-slate-400">Filled positions still being managed.</p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="micro-label">Closed / Cancelled</p>
              <p className="mt-1.5 text-[1.2rem] font-semibold text-white">{history.length}</p>
              <p className="mt-1 text-[0.78rem] text-slate-400">Completed ticket history.</p>
            </div>
          </div>

          <div className="signal-accent-surface mt-3 rounded-[0.4rem] p-3">
            <p className="text-[0.88rem] font-semibold text-white">Execution rail</p>
            <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-200">
              {summarizeBrokerConnection(tradeTickets)} Until live broker routing is enabled, fills and closes in
              this desk stay simulated so the workflow feels realistic without pretending orders have left the app.
            </p>
          </div>

          {error ? <p className="mt-3 text-[0.82rem] text-amber-200">{error}</p> : null}
        </Panel>
      </div>

      <div className="grid gap-[5px]">
        <TicketSection
          title="Ready Queue"
          description="Built tickets that have a complete risk plan and can now be sent to market."
          tickets={readyQueue}
          assetsBySymbol={assetsBySymbol}
          isBusy={isSaving}
          onClose={(ticketId) => syncTicket(ticketId, closeTradeTicket)}
          onDelete={handleDeleteTradeTicket}
          onFill={(ticketId) => syncTicket(ticketId, fillTradeTicket)}
          onSubmit={(ticketId) => syncTicket(ticketId, submitTradeTicket)}
          onCancel={(ticketId) => syncTicket(ticketId, cancelTradeTicket)}
        />

        <TicketSection
          title="Working Orders"
          description="Orders that have been placed but are still waiting to be filled."
          tickets={workingOrders}
          assetsBySymbol={assetsBySymbol}
          isBusy={isSaving}
          onClose={(ticketId) => syncTicket(ticketId, closeTradeTicket)}
          onDelete={handleDeleteTradeTicket}
          onFill={(ticketId) => syncTicket(ticketId, fillTradeTicket)}
          onSubmit={(ticketId) => syncTicket(ticketId, submitTradeTicket)}
          onCancel={(ticketId) => syncTicket(ticketId, cancelTradeTicket)}
        />

        <TicketSection
          title="Open Positions"
          description="Filled positions with live PnL context and close controls."
          tickets={openPositions}
          assetsBySymbol={assetsBySymbol}
          isBusy={isSaving}
          onClose={(ticketId) => syncTicket(ticketId, closeTradeTicket)}
          onDelete={handleDeleteTradeTicket}
          onFill={(ticketId) => syncTicket(ticketId, fillTradeTicket)}
          onSubmit={(ticketId) => syncTicket(ticketId, submitTradeTicket)}
          onCancel={(ticketId) => syncTicket(ticketId, cancelTradeTicket)}
        />

        <TicketSection
          title="History"
          description="Closed, cancelled, and rejected tickets kept for review rather than cluttering the live desk."
          tickets={history}
          assetsBySymbol={assetsBySymbol}
          isBusy={isSaving}
          onClose={(ticketId) => syncTicket(ticketId, closeTradeTicket)}
          onDelete={handleDeleteTradeTicket}
          onFill={(ticketId) => syncTicket(ticketId, fillTradeTicket)}
          onSubmit={(ticketId) => syncTicket(ticketId, submitTradeTicket)}
          onCancel={(ticketId) => syncTicket(ticketId, cancelTradeTicket)}
        />
      </div>
    </div>
  );
}
