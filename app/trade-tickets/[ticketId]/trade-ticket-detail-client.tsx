"use client";

import Link from "next/link";
import { useState } from "react";
import type { PersistedTradeTicket } from "@/app/_lib/server/workspace-types";
import { formatCurrency, formatNumber, formatRiskReward } from "../../_lib/format";
import {
  cancelTradeTicket,
  closeTradeTicket,
  fillTradeTicket,
  submitTradeTicket,
  updateTradeTicket,
} from "../../_lib/workspace-api";
import { ActionLink, KeyValue, PageHeader, Panel, StatusChip } from "../../_components/ui";

function recalculateTicket(
  ticket: PersistedTradeTicket,
  overrides: Partial<PersistedTradeTicket> = {},
) {
  const next = { ...ticket, ...overrides };
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

export default function TradeTicketDetailClient({
  initialTicket,
}: {
  initialTicket: PersistedTradeTicket;
}) {
  const [ticket, setTicket] = useState<PersistedTradeTicket>(initialTicket);
  const [draftNotes, setDraftNotes] = useState(initialTicket.notes);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function syncTicket(
    action: () => Promise<PersistedTradeTicket>,
  ) {
    try {
      setIsSaving(true);
      setError(null);
      const updated = await action();
      setTicket(updated);
      setDraftNotes(updated.notes);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update ticket");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveOrder() {
    await syncTicket(() =>
      updateTradeTicket(ticket.id, {
        entry: ticket.entry,
        stopLoss: ticket.stopLoss,
        takeProfit: ticket.takeProfit,
        quantity: ticket.quantity,
        orderType: ticket.orderType,
        executionMode: ticket.executionMode,
        timeInForce: ticket.timeInForce,
        plannedLoss: ticket.plannedLoss,
        potentialGain: ticket.potentialGain,
        estimatedValue: ticket.estimatedValue,
        riskReward: ticket.riskReward,
        notes: draftNotes,
      }),
    );
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Execution Ticket"
        title={`${ticket.symbol} order and position control`}
        description="Use this screen like an execution ticket: refine the order, place it, watch it sit as a working order or become an open position, then close it out with the plan still attached."
        action={<ActionLink href="/trade-tickets">Back To Execution Desk</ActionLink>}
      />

      <div className="grid gap-[5px] xl:grid-cols-[1.05fr_0.95fr]">
        <Panel className="p-3 sm:p-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="micro-label">Order Specification</p>
              <h2 className="mt-1.5 text-lg font-semibold text-white sm:text-[1.15rem]">
                {ticket.strategy}
              </h2>
              <p className="mt-0.5 text-[0.84rem] text-slate-400">
                {ticket.side} / {ticket.orderType} / {ticket.executionMode} / {ticket.timeInForce}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip label={ticket.status.toUpperCase()} />
              <StatusChip label={ticket.brokerStatus.toUpperCase()} />
            </div>
          </div>

          <div className="mt-4 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Entry", "entry"],
              ["Stop", "stopLoss"],
              ["Target", "takeProfit"],
              ["Quantity", "quantity"],
            ].map(([label, key]) => (
              <label key={key} className="panel-stack-5">
                <span className="micro-label">{label}</span>
                <input
                  type="number"
                  step="0.01"
                  value={ticket[key as keyof PersistedTradeTicket] as number}
                  onChange={(event) =>
                    setTicket((current) =>
                      recalculateTicket(current, {
                        [key]: Number(event.target.value),
                      } as Partial<PersistedTradeTicket>),
                    )
                  }
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-[5px] sm:grid-cols-3">
            <label className="panel-stack-5">
              <span className="micro-label">Order Type</span>
              <select
                value={ticket.orderType}
                onChange={(event) =>
                  setTicket((current) =>
                    recalculateTicket(current, {
                      orderType: event.target.value as PersistedTradeTicket["orderType"],
                    }),
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
              <span className="micro-label">Execution Mode</span>
              <select
                value={ticket.executionMode}
                onChange={(event) =>
                  setTicket((current) =>
                    recalculateTicket(current, {
                      executionMode: event.target.value as PersistedTradeTicket["executionMode"],
                    }),
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
              <span className="micro-label">Time In Force</span>
              <select
                value={ticket.timeInForce}
                onChange={(event) =>
                  setTicket((current) =>
                    recalculateTicket(current, {
                      timeInForce: event.target.value as PersistedTradeTicket["timeInForce"],
                    }),
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

          <div className="mt-4 grid gap-[5px] sm:grid-cols-2 lg:grid-cols-4">
            <KeyValue label="Estimated Value" value={formatCurrency(ticket.estimatedValue)} />
            <KeyValue label="Planned Loss" value={formatCurrency(ticket.plannedLoss)} />
            <KeyValue label="Potential Gain" value={formatCurrency(ticket.potentialGain)} />
            <KeyValue label="Risk / Reward" value={formatRiskReward(ticket.riskReward)} />
            <KeyValue
              label="Executed Entry"
              value={ticket.executedEntry ? formatCurrency(ticket.executedEntry) : "Not filled"}
            />
            <KeyValue
              label="Executed Qty"
              value={ticket.executedQuantity ? formatNumber(ticket.executedQuantity, 0) : "Not filled"}
            />
            <KeyValue
              label="Realized PnL"
              value={formatCurrency(ticket.realizedPnl ?? 0)}
            />
            <KeyValue
              label="Broker Ref"
              value={ticket.brokerReference ?? "Awaiting placement"}
            />
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Execution Controls</p>
          <div className="mt-3 panel-stack-5">
            <div className="signal-accent-surface rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Current state</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                {ticket.status === "Ready" || ticket.status === "Draft"
                  ? "This ticket is prepared and ready to be sent into the execution queue."
                  : ticket.status === "Submitted" || ticket.status === "Working"
                    ? "This order is now sitting in the working queue and can be filled or cancelled."
                    : ticket.status === "Filled" || ticket.status === "Partially Closed"
                      ? "This order is now an open position and can be managed or closed."
                      : "This ticket is now part of execution history."}
              </p>
            </div>

            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Ticket Notes</p>
              <textarea
                rows={6}
                value={draftNotes}
                onChange={(event) => setDraftNotes(event.target.value)}
                className="signal-surface-soft mt-2 w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                placeholder="Execution notes, trigger conditions, broker comments, and post-trade review context..."
              />
              <div className="mt-3 flex flex-wrap gap-[5px]">
                <button
                  type="button"
                  onClick={() => void handleSaveOrder()}
                  disabled={isSaving}
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                >
                  Save Ticket
                </button>

                {(ticket.status === "Ready" || ticket.status === "Draft") ? (
                  <button
                    type="button"
                    onClick={() => void syncTicket(() => submitTradeTicket(ticket.id))}
                    disabled={isSaving}
                    className="signal-button rounded-[0.46rem] px-3 py-2 text-[0.78rem] font-semibold"
                  >
                    Place Order
                  </button>
                ) : null}

                {(ticket.status === "Submitted" || ticket.status === "Working") ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void syncTicket(() => fillTradeTicket(ticket.id))}
                      disabled={isSaving}
                      className="signal-accent-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                    >
                      Simulate Fill
                    </button>
                    <button
                      type="button"
                      onClick={() => void syncTicket(() => cancelTradeTicket(ticket.id))}
                      disabled={isSaving}
                      className="signal-warning-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-amber-100"
                    >
                      Cancel
                    </button>
                  </>
                ) : null}

                {(ticket.status === "Filled" || ticket.status === "Partially Closed") ? (
                  <button
                    type="button"
                    onClick={() => void syncTicket(() => closeTradeTicket(ticket.id))}
                    disabled={isSaving}
                    className="signal-accent-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                  >
                    Close Position
                  </button>
                ) : null}

                <Link
                  href="/trade-tickets"
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                >
                  Back To Desk
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
