"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PersistedAssetRecord,
  PersistedJournalEntry,
  PersistedTradeTicket,
} from "@/app/_lib/server/workspace-types";
import { PageHeader, Panel, StatusChip } from "../_components/ui";
import { formatDateLabel, formatPercent } from "../_lib/format";
import {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntry,
} from "../_lib/workspace-api";

const journalStatuses = [
  "Planned",
  "Simulated",
  "Taken",
  "Skipped",
  "Closed",
  "Stopped Out",
  "Target Hit",
] as const;

function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}

export default function JournalPageClient({
  initialJournalEntries,
  tradeTickets,
  assets,
}: {
  initialJournalEntries: PersistedJournalEntry[];
  tradeTickets: PersistedTradeTicket[];
  assets: PersistedAssetRecord[];
}) {
  const [journalEntries, setJournalEntries] = useState<PersistedJournalEntry[]>(initialJournalEntries);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftEntry, setDraftEntry] = useState({
    date: todayLabel(),
    asset: assets[0]?.symbol ?? "LINK",
    status: "Planned" as PersistedJournalEntry["status"],
    pnl: 0,
    notes: "",
    emotionTags: "Calm, Focused",
    aiReview: "Review structure, execution quality, and discipline before locking the lesson.",
    ticketId: "",
  });

  async function handleCreateJournalEntry() {
    try {
      setIsSaving(true);
      setError(null);
      const nextEntry = await createJournalEntry({
        date: draftEntry.date,
        asset: draftEntry.asset,
        status: draftEntry.status,
        pnl: Number(draftEntry.pnl),
        notes: draftEntry.notes,
        emotionTags: draftEntry.emotionTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        aiReview: draftEntry.aiReview,
        ticketId: draftEntry.ticketId || null,
      });
      setJournalEntries((current) => [nextEntry, ...current]);
      setDraftEntry((current) => ({
        ...current,
        notes: "",
        ticketId: "",
      }));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create journal entry");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEntry(entry: PersistedJournalEntry) {
    try {
      setIsSaving(true);
      setError(null);
      const updated = await updateJournalEntry(entry.id, {
        status: entry.status,
        notes: entry.notes,
        aiReview: entry.aiReview,
        emotionTags: entry.emotionTags,
        pnl: entry.pnl,
      });

      setJournalEntries((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save journal entry");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteEntry(entryId: string) {
    try {
      setIsSaving(true);
      setError(null);
      await deleteJournalEntry(entryId);
      setJournalEntries((current) => current.filter((entry) => entry.id !== entryId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete journal entry");
    } finally {
      setIsSaving(false);
    }
  }

  const plannedOrSimulated = journalEntries.filter(
    (entry) => entry.status === "Planned" || entry.status === "Simulated",
  ).length;
  const targetHits = journalEntries.filter((entry) => entry.status === "Target Hit").length;
  const stoppedOut = journalEntries.filter((entry) => entry.status === "Stopped Out").length;
  const disciplineFlags = journalEntries.filter((entry) =>
    entry.emotionTags.some((tag) => ["IMPATIENT", "REACTIVE", "FOMO"].includes(tag)),
  ).length;

  function getLinkedTicket(ticketId: string | null) {
    if (!ticketId) {
      return null;
    }

    return tradeTickets.find((ticket) => ticket.id === ticketId) ?? null;
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Journal"
        title="Trade memory starts with honest review"
        description="The journal surface holds planned, simulated, taken, skipped, and closed trades alongside notes, emotion tags, and AI review. The goal is not just logging outcomes, but learning whether the process was clean."
      />

      <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Planned + Simulated", String(plannedOrSimulated)],
          ["Target Hit", String(targetHits)],
          ["Stopped Out", String(stoppedOut)],
          ["Discipline Flags", String(disciplineFlags)],
        ].map(([label, value]) => (
          <Panel key={label} className="p-3">
            <p className="micro-label">{label}</p>
            <p className="mt-2 text-[1.45rem] font-semibold text-white">{value}</p>
          </Panel>
        ))}
      </div>

      <Panel className="p-3 sm:p-3.5">
        <p className="micro-label">Create Journal Entry</p>
        <div className="mt-3 grid gap-[5px] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
          <label className="space-y-1">
            <span className="micro-label">Date</span>
            <input
              type="date"
              value={draftEntry.date}
              onChange={(event) =>
                setDraftEntry((current) => ({ ...current, date: event.target.value }))
              }
              className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="micro-label">Asset</span>
            <select
              value={draftEntry.asset}
              onChange={(event) =>
                setDraftEntry((current) => ({ ...current, asset: event.target.value }))
              }
              className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
            >
              {assets.map((asset) => (
                <option key={asset.symbol} value={asset.symbol}>
                  {asset.symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="micro-label">Status</span>
            <select
              value={draftEntry.status}
              onChange={(event) =>
                setDraftEntry((current) => ({
                  ...current,
                  status: event.target.value as PersistedJournalEntry["status"],
                }))
              }
              className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
            >
              {journalStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 xl:col-span-1">
            <span className="micro-label">P/L %</span>
            <input
              type="number"
              value={draftEntry.pnl}
              onChange={(event) =>
                setDraftEntry((current) => ({
                  ...current,
                  pnl: Number(event.target.value),
                }))
              }
              className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
            />
          </label>
          <label className="space-y-1 xl:col-span-2">
            <span className="micro-label">Linked Ticket</span>
            <select
              value={draftEntry.ticketId}
              onChange={(event) => {
                const nextTicketId = event.target.value;
                const linkedTicket = tradeTickets.find((ticket) => ticket.id === nextTicketId);

                setDraftEntry((current) => ({
                  ...current,
                  ticketId: nextTicketId,
                  asset: linkedTicket?.symbol ?? current.asset,
                }));
              }}
              className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
            >
              <option value="">No linked ticket</option>
              {tradeTickets.map((ticket) => (
                <option key={ticket.id} value={ticket.id}>
                  {ticket.symbol} / {ticket.strategy} / {ticket.status}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 xl:col-span-2">
            <span className="micro-label">Emotion Tags</span>
            <input
              value={draftEntry.emotionTags}
              onChange={(event) =>
                setDraftEntry((current) => ({ ...current, emotionTags: event.target.value }))
              }
              className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
            />
          </label>
          <label className="space-y-1 xl:col-span-3">
            <span className="micro-label">Notes</span>
            <textarea
              rows={3}
              value={draftEntry.notes}
              onChange={(event) =>
                setDraftEntry((current) => ({ ...current, notes: event.target.value }))
              }
              className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
            />
          </label>
          <label className="space-y-1 xl:col-span-3">
            <span className="micro-label">AI Review</span>
            <textarea
              rows={3}
              value={draftEntry.aiReview}
              onChange={(event) =>
                setDraftEntry((current) => ({ ...current, aiReview: event.target.value }))
              }
              className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
            />
          </label>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void handleCreateJournalEntry()}
            disabled={isSaving}
            className="signal-button rounded-[0.46rem] px-3.5 py-2 text-[0.82rem] font-semibold"
          >
            Save Entry
          </button>
        </div>
        {error ? <p className="mt-3 text-[0.82rem] text-amber-200">{error}</p> : null}
      </Panel>

      <Panel className="p-3 sm:p-3.5">
        <p className="micro-label">Recent Entries</p>
        <div className="mt-4 panel-stack-5">
          {journalEntries.map((entry) => {
            const linkedTicket = getLinkedTicket(entry.ticketId);

            return (
              <div
                key={entry.id}
                className="signal-surface rounded-[0.46rem] p-3"
              >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[1rem] font-semibold text-white">{entry.asset}</p>
                    <StatusChip label={entry.status.toUpperCase()} />
                  </div>
                  <p className="text-[0.82rem] text-slate-400">
                    {formatDateLabel(entry.date)} / P/L {formatPercent(entry.pnl, true)}
                  </p>
                  {linkedTicket ? (
                    <Link
                      href={`/trade-tickets/${linkedTicket.id}`}
                      className="inline-flex text-[0.76rem] font-semibold text-cyan-200 transition hover:text-white"
                    >
                      Linked ticket: {linkedTicket.symbol} / {linkedTicket.strategy}
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.emotionTags.map((tag) => (
                    <span
                      key={tag}
                      className="signal-surface-soft rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold text-slate-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-[5px] xl:grid-cols-2">
                <div className="signal-surface-soft rounded-[0.4rem] p-3">
                  <label className="space-y-1">
                    <span className="micro-label">Notes</span>
                    <textarea
                      rows={4}
                      value={entry.notes}
                      onChange={(event) =>
                        setJournalEntries((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, notes: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="signal-surface-soft mt-2 w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                    />
                  </label>
                </div>
                <div className="signal-accent-surface rounded-[0.4rem] p-3">
                  <label className="space-y-1">
                    <span className="micro-label">AI Review</span>
                    <textarea
                      rows={4}
                      value={entry.aiReview}
                      onChange={(event) =>
                        setJournalEntries((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, aiReview: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="signal-surface-soft mt-2 w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-3 grid gap-[5px] sm:grid-cols-[180px_1fr_auto_auto]">
                <select
                  value={entry.status}
                  onChange={(event) =>
                    setJournalEntries((current) =>
                      current.map((item) =>
                        item.id === entry.id
                          ? {
                              ...item,
                              status: event.target.value as PersistedJournalEntry["status"],
                            }
                          : item,
                      ),
                    )
                  }
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                >
                  {journalStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <input
                  value={entry.emotionTags.join(", ")}
                  onChange={(event) =>
                    setJournalEntries((current) =>
                      current.map((item) =>
                        item.id === entry.id
                          ? {
                              ...item,
                              emotionTags: event.target.value
                                .split(",")
                                .map((tag) => tag.trim().toUpperCase())
                                .filter(Boolean),
                            }
                          : item,
                      ),
                    )
                  }
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveEntry(entry)}
                  disabled={isSaving}
                  className="signal-button rounded-[0.46rem] px-3 py-2 text-[0.78rem] font-semibold"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteEntry(entry.id)}
                  disabled={isSaving}
                  className="signal-warning-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-amber-100"
                >
                  Delete
                </button>
              </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
