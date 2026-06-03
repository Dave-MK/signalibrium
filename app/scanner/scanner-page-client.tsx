"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PersistedScannerResult,
  PersistedTradeTicket,
} from "@/app/_lib/server/workspace-types";
import { formatRiskReward } from "../_lib/format";
import {
  buildTradeTicketInputFromScannerResult,
} from "../_lib/reference-data";
import { createTradeTicket } from "../_lib/workspace-api";
import { ActionLink, PageHeader, Panel, StatusChip } from "../_components/ui";

function SetupEvidence({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
      <p className="micro-label">{label}</p>
      <p className="mt-1.5 text-[0.84rem] font-semibold text-white">{value}</p>
    </div>
  );
}

export default function ScannerPageClient({
  initialTradeTickets,
  initialScannerResults,
}: {
  initialTradeTickets: PersistedTradeTicket[];
  initialScannerResults: PersistedScannerResult[];
}) {
  const [tradeTickets, setTradeTickets] = useState(initialTradeTickets);
  const [scannerResults] = useState(initialScannerResults);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePrepareTicket(scannerResult: PersistedScannerResult) {
    try {
      setIsSaving(true);
      setError(null);
      const nextTicket = await createTradeTicket(
        buildTradeTicketInputFromScannerResult(scannerResult),
      );
      setTradeTickets((current) => [nextTicket, ...current]);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to prepare a trade ticket from this setup",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function getLinkedTicket(setupId: string) {
    return tradeTickets.find((ticket) => ticket.sourceSetupId === setupId) ?? null;
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="AI Opportunities"
        title="Only show the trades worth acting on"
        description="This feed is the filtered output of the desk. Every card should answer the same question: is there enough structure, context, and confirmation to justify creating an execution ticket right now?"
        action={<ActionLink href="/trade-tickets">Open Execution</ActionLink>}
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="signal-surface rounded-[0.46rem] p-3">
            <p className="micro-label">Feed Rules</p>
            <p className="mt-1.5 text-[0.92rem] font-semibold text-white">
              Tradeable setups first, watchlist-quality ideas second.
            </p>
            <p className="mt-2 text-[0.82rem] leading-5 text-slate-300">
              The desk is already filtering for score, structure, timing, and current regime alignment. This page should feel like a shortlist, not a spreadsheet.
            </p>
          </div>

          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Execution Handoff</p>
            <p className="mt-1.5 text-[1.15rem] font-semibold text-white">{tradeTickets.length}</p>
            <p className="mt-1 text-[0.8rem] text-slate-400">
              Execution tickets created from the opportunity feed.
            </p>
          </div>
        </div>
        {error ? <p className="mt-3 text-[0.82rem] text-amber-200">{error}</p> : null}
      </Panel>

      <div className="grid gap-[5px]">
        {scannerResults.map((setup) => {
          const linkedTicket = getLinkedTicket(setup.id);

          return (
            <Panel key={setup.id} className="p-3 sm:p-3.5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[1rem] font-semibold text-white">{setup.symbol}</h2>
                    <StatusChip label={setup.tradeability} />
                    <StatusChip label={setup.regime.toUpperCase()} />
                  </div>
                  <p className="mt-1 text-[0.84rem] text-slate-400">
                    {setup.strategy} · {setup.timeframe} · {setup.assetClass}
                  </p>
                  <p className="mt-3 max-w-3xl text-[0.84rem] leading-5 text-slate-300">
                    {setup.thesis}
                  </p>
                </div>

                <div className="signal-surface-soft rounded-[0.4rem] p-3 lg:w-48">
                  <p className="micro-label">Desk Score</p>
                  <p className="mt-1.5 text-[1.2rem] font-semibold text-cyan-200">{setup.score}</p>
                  <p className="mt-1 text-[0.76rem] text-slate-400">
                    Risk score {setup.riskScore}/100
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-5">
                <SetupEvidence label="Entry" value={setup.entryZone} />
                <SetupEvidence label="Stop Loss" value={setup.stopLoss} />
                <SetupEvidence label="Take Profit" value={setup.takeProfit} />
                <SetupEvidence label="Risk / Reward" value={formatRiskReward(setup.riskReward)} />
                <SetupEvidence label="Liquidity" value={setup.liquidityStatus} />
              </div>

              <div className="mt-3 flex flex-wrap gap-[5px]">
                <Link
                  href={`/assets/${setup.symbol}`}
                  className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                >
                  Open Chart
                </Link>

                {linkedTicket ? (
                  <Link
                    href={`/trade-tickets/${linkedTicket.id}`}
                    className="signal-accent-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                  >
                    Open Execution Ticket
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handlePrepareTicket(setup)}
                    disabled={isSaving}
                    className="signal-button rounded-[0.46rem] px-3 py-2 text-[0.78rem] font-semibold disabled:opacity-50"
                  >
                    Create Ticket
                  </button>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
