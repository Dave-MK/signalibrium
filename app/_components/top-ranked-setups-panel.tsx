"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PersistedScannerResult,
  PersistedTradeTicket,
} from "@/app/_lib/server/workspace-types";
import { formatRiskReward } from "../_lib/format";
import { buildTradeTicketInputFromScannerResult } from "../_lib/reference-data";
import { createTradeTicket } from "../_lib/workspace-api";
import { Panel, StatusChip } from "./ui";
import { LabelWithTip } from "./help-tip";

function TableBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "teal" | "gold" | "red";
}) {
  const classes = {
    default: "border-white/10 bg-white/[0.04] text-slate-200",
    gold: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    red: "border-red-400/20 bg-red-500/10 text-red-100",
    teal: "border-cyan-300/18 bg-cyan-400/10 text-cyan-100",
  };

  return (
    <span
      className={`inline-flex rounded-[0.4rem] border px-2.5 py-[0.3rem] text-[0.68rem] font-medium leading-none ${classes[tone]}`}
    >
      {label}
    </span>
  );
}

function SetupMobileCard({
  linkedTicket,
  onPrepareTicket,
  setup,
  index,
  isSaving,
}: {
  linkedTicket: PersistedTradeTicket | null;
  onPrepareTicket: (setup: PersistedScannerResult) => Promise<void>;
  setup: PersistedScannerResult;
  index: number;
  isSaving: boolean;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">#{index + 1}</p>
          <Link
            href={`/assets/${setup.symbol}`}
            className="mt-1 block text-[0.92rem] font-semibold text-white"
          >
            {setup.symbol}
          </Link>
          <p className="mt-1 text-[0.82rem] text-slate-400">{setup.strategy}</p>
        </div>
        <div className="text-right">
          <span className="signal-accent-surface inline-flex h-7.5 w-7.5 items-center justify-center rounded-full text-[0.82rem] font-semibold text-cyan-200">
            {setup.score}
          </span>
          <p className="mt-1.5 text-[0.68rem] text-slate-500">{setup.entryZone}</p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-[0.82rem]">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Regime</p>
          <div className="mt-1.5">
            <TableBadge
              label={setup.regime === "Risk-On" ? "Risk-On Expansion" : setup.regime}
              tone={setup.regime === "Risk-On" ? "teal" : "default"}
            />
          </div>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Liquidity</p>
          <div className="mt-1.5">
            <TableBadge
              label={setup.liquidityStatus}
              tone={
                setup.liquidityStatus === "High"
                  ? "teal"
                  : setup.liquidityStatus === "Moderate"
                    ? "gold"
                    : "red"
              }
            />
          </div>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">SL</p>
          <p className="mt-1.5 text-red-300">{setup.stopLoss}</p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">TP</p>
          <p className="mt-1.5 text-slate-200">{setup.takeProfit}</p>
          <p className="mt-0.5 text-[0.68rem] font-medium text-emerald-300">
            {formatRiskReward(setup.riskReward)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {linkedTicket ? (
          <>
            <StatusChip label={linkedTicket.status.toUpperCase()} />
            <Link
              href={`/trade-tickets/${linkedTicket.id}`}
              className="signal-surface-soft rounded-[0.4rem] px-2.5 py-1.5 text-[0.72rem] font-semibold text-white"
            >
              Open Ticket
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void onPrepareTicket(setup)}
            disabled={isSaving}
            className="signal-button w-full rounded-[0.46rem] px-2.5 py-1.5 text-[0.72rem] font-semibold disabled:opacity-50"
          >
            Prepare Ticket
          </button>
        )}
      </div>
    </div>
  );
}

export function TopRankedSetupsPanel({
  initialTradeTickets,
  setups,
}: {
  initialTradeTickets: PersistedTradeTicket[];
  setups: PersistedScannerResult[];
}) {
  const [tradeTickets, setTradeTickets] = useState(initialTradeTickets);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getLinkedTicket(setupId: string) {
    return tradeTickets.find((ticket) => ticket.sourceSetupId === setupId) ?? null;
  }

  async function handlePrepareTicket(setup: PersistedScannerResult) {
    try {
      setIsSaving(true);
      setError(null);
      const nextTicket = await createTradeTicket(
        buildTradeTicketInputFromScannerResult(setup),
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

  return (
    <Panel className="overflow-hidden p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-white">
          Top-Ranked Setups
        </h2>
      </div>
      {error ? <p className="mt-2 text-[0.82rem] text-amber-200">{error}</p> : null}
      <div className="mt-2.5 space-y-2 md:hidden">
        {setups.map((setup, index) => (
          <SetupMobileCard
            key={setup.id}
            linkedTicket={getLinkedTicket(setup.id)}
            onPrepareTicket={handlePrepareTicket}
            setup={setup}
            index={index}
            isSaving={isSaving}
          />
        ))}
      </div>
      <div className="mt-2.5 hidden overflow-x-auto md:block">
        <table className="data-table data-table--compact min-w-235">
          <colgroup>
            <col className="w-[3.2rem]" />
            <col className="w-22" />
            <col className="w-40" />
            <col className="w-[4.2rem]" />
            <col className="w-[8.8rem]" />
            <col className="w-[7.2rem]" />
            <col className="w-[4.8rem]" />
            <col className="w-[6.4rem]" />
            <col className="w-[5.2rem]" />
            <col className="w-[7.2rem]" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Asset</th>
              <th>Strategy</th>
              <th>
                <LabelWithTip
                  label="Score"
                  tooltip="Internal rank score combining structure, regime fit, and execution quality."
                />
              </th>
              <th>
                <LabelWithTip
                  label="Regime"
                  tooltip="The broader market backdrop the setup is currently sitting inside."
                />
              </th>
              <th>
                <LabelWithTip
                  label="Entry"
                  tooltip="The preferred entry zone for the setup rather than a single exact print."
                />
              </th>
              <th>
                <LabelWithTip
                  label="SL"
                  tooltip="Stop-loss. The invalidation level where the setup should be exited."
                />
              </th>
              <th>
                <LabelWithTip
                  label="TP Target"
                  tooltip="Take-profit target. The first planned area to realize gains."
                />
              </th>
              <th>
                <LabelWithTip
                  label="Tradeability"
                  tooltip="Whether the setup currently clears the app's execution filters."
                />
              </th>
              <th>
                <LabelWithTip
                  label="Flow"
                  tooltip="Create a new ticket from the setup or open the ticket that already exists."
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {setups.map((setup, index) => {
              const linkedTicket = getLinkedTicket(setup.id);

              return (
                <tr key={setup.id}>
                  <td className="text-slate-400">{index + 1}</td>
                  <td>
                    <Link
                      href={`/assets/${setup.symbol}`}
                      className="font-semibold text-white hover:text-cyan-200"
                    >
                      {setup.symbol}
                    </Link>
                  </td>
                  <td className="text-slate-300">{setup.strategy}</td>
                  <td>
                    <span className="signal-accent-surface inline-flex h-7.5 w-7.5 items-center justify-center rounded-full text-[0.82rem] font-semibold text-cyan-200">
                      {setup.score}
                    </span>
                  </td>
                  <td>
                    <TableBadge
                      label={setup.regime === "Risk-On" ? "Risk-On Expansion" : setup.regime}
                      tone={setup.regime === "Risk-On" ? "teal" : "default"}
                    />
                  </td>
                  <td className="text-slate-200">{setup.entryZone}</td>
                  <td className="text-red-300">{setup.stopLoss}</td>
                  <td>
                    <p className="text-slate-200">{setup.takeProfit}</p>
                    <p className="mt-0.5 text-[0.68rem] font-medium text-emerald-300">
                      {formatRiskReward(setup.riskReward)}
                    </p>
                  </td>
                  <td>
                    <StatusChip label={setup.tradeability} />
                  </td>
                  <td>
                    {linkedTicket ? (
                      <div className="space-y-2">
                        <StatusChip label={linkedTicket.status.toUpperCase()} />
                        <Link
                          href={`/trade-tickets/${linkedTicket.id}`}
                          className="inline-flex rounded-[0.4rem] bg-white/4 px-2.25 py-1 text-[0.7rem] font-semibold text-white"
                        >
                          Open
                        </Link>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handlePrepareTicket(setup)}
                        disabled={isSaving}
                        className="signal-button rounded-[0.46rem] px-2.5 py-1.5 text-[0.7rem] font-semibold disabled:opacity-50"
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
      <div className="signal-outline-divider mt-2 flex justify-center pt-2.5">
        <Link
          href="/scanner"
          className="text-[0.84rem] font-medium text-slate-400 transition hover:text-white"
        >
          View all setups
        </Link>
      </div>
    </Panel>
  );
}
