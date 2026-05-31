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

const filterPills = [
  "Crypto + ETF focus",
  "4H and 1D",
  "Minimum score 75",
  "Tradeable only",
  "Protected sizing enabled",
];

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
        eyebrow="Scanner"
        title="Rank setups before emotion gets a vote"
        description="This shortlist mirrors the handover requirements: asset, strategy, score, risk, regime, entry zone, stop-loss, take-profit target, risk/reward, liquidity, and tradeability all sit on one screen."
        action={<ActionLink href="/trade-tickets">Prepared Tickets</ActionLink>}
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="micro-label">Filter State</p>
            <div className="mt-2.5 flex flex-wrap gap-[5px]">
              {filterPills.map((pill) => (
                <span
                  key={pill}
                  className="signal-surface-soft rounded-full px-3 py-1 text-[0.82rem] text-slate-200"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
          <div className="signal-surface-soft rounded-[0.4rem] px-3 py-2.5">
            <p className="micro-label">Persisted Ticket Flow</p>
            <p className="mt-1.5 text-[1rem] font-semibold text-white">
              {tradeTickets.length} saved tickets
            </p>
            <p className="mt-1 text-[0.8rem] text-slate-400">
              Scanner actions now write directly into the workspace store.
            </p>
          </div>
        </div>
        {error ? <p className="mt-3 text-[0.82rem] text-amber-200">{error}</p> : null}
      </Panel>

      <Panel className="p-3 sm:p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="micro-label">Scanner Results</p>
            <h2 className="mt-1.5 text-lg font-semibold text-white sm:text-[1.15rem]">
              Current ranked opportunities
            </h2>
          </div>
          <StatusChip label="BACKTESTED" />
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="data-table min-w-[1180px]">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Strategy</th>
                <th>Score</th>
                <th>Risk</th>
                <th>Regime</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Target</th>
                <th>R/R</th>
                <th>Liquidity</th>
                <th>Status</th>
                <th>Ticket Flow</th>
              </tr>
            </thead>
            <tbody>
              {scannerResults.map((setup) => {
                const linkedTicket = getLinkedTicket(setup.id);

                return (
                  <tr key={setup.id}>
                    <td>
                      <Link
                        href={`/assets/${setup.symbol}`}
                        className="font-semibold text-white hover:text-cyan-200"
                      >
                        {setup.symbol}
                      </Link>
                      <p className="mt-0.5 text-[0.82rem] text-slate-400">{setup.assetClass}</p>
                    </td>
                    <td className="text-slate-200">{setup.strategy}</td>
                    <td className="font-semibold text-white">{setup.score}</td>
                    <td className="text-slate-300">{setup.riskScore}/100</td>
                    <td>
                      <StatusChip label={setup.regime.toUpperCase()} />
                    </td>
                    <td className="text-slate-300">{setup.entryZone}</td>
                    <td className="text-slate-300">{setup.stopLoss}</td>
                    <td className="text-slate-300">{setup.takeProfit}</td>
                    <td className="text-slate-300">
                      {formatRiskReward(setup.riskReward)}
                    </td>
                    <td className="text-slate-300">{setup.liquidityStatus}</td>
                    <td>
                      <StatusChip label={setup.tradeability} />
                    </td>
                    <td>
                      {linkedTicket ? (
                        <div className="space-y-2">
                          <StatusChip label={linkedTicket.status.toUpperCase()} />
                          <Link
                            href={`/trade-tickets/${linkedTicket.id}`}
                            className="inline-flex rounded-[0.4rem] bg-white/[0.04] px-2.5 py-1 text-[0.74rem] font-semibold text-white"
                          >
                            Open Ticket
                          </Link>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handlePrepareTicket(setup)}
                          disabled={isSaving}
                          className="signal-button rounded-[0.46rem] px-3 py-2 text-[0.76rem] font-semibold disabled:opacity-50"
                        >
                          Prepare Ticket
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
