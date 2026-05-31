"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useState, type ReactNode } from "react";
import type {
  PersistedMarketSnapshot,
  PersistedScannerResult,
} from "@/app/_lib/server/workspace-types";
import { formatCompactCurrency, formatPercent } from "../_lib/format";
import { NavLinks } from "./nav-links";
import { StatusChip } from "./ui";

export function AppShell({
  children,
  marketSnapshot,
  topScannerResult,
}: {
  children: ReactNode;
  marketSnapshot: PersistedMarketSnapshot;
  topScannerResult: PersistedScannerResult | null;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("signalibrium.sidebar-collapsed") === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(
      "signalibrium.sidebar-collapsed",
      String(isSidebarCollapsed),
    );
  }, [isSidebarCollapsed]);

  return (
    <div className="relative z-10 min-h-screen">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside
          className={`group/sidebar relative border-b border-white/6 bg-[#06101b]/94 px-2.5 py-2.5 backdrop-blur-xl transition-[width,padding] duration-200 lg:min-h-screen lg:border-b-0 lg:border-r ${
            isSidebarCollapsed
              ? "lg:w-[76px] lg:px-2 lg:py-3"
              : "lg:w-[220px] lg:px-3 lg:py-3"
          }`}
        >
          <div className="pointer-events-none sticky top-[3.375rem] z-20 hidden h-0 lg:block">
            <button
              type="button"
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => {
                startTransition(() => {
                  setIsSidebarCollapsed((currentValue) => !currentValue);
                });
              }}
              className="signal-surface-soft pointer-events-auto ml-auto flex h-9 w-9 translate-x-[1.1rem] items-center justify-center border border-white/8 bg-[#091321]/98 text-slate-300 opacity-0 shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-[transform,color,opacity] duration-200 hover:text-white group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100 after:absolute after:left-0 after:top-1/2 after:h-5 after:w-px after:-translate-x-full after:-translate-y-1/2 after:bg-white/12"
            >
              <svg
                viewBox="0 0 20 20"
                className={`h-4 w-4 transition-transform ${isSidebarCollapsed ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="m12.5 4.5-5 5 5 5" />
              </svg>
            </button>
          </div>

          <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
            <div className="min-w-0 lg:flex lg:justify-center">
              <Link
                href="/"
                className={`inline-flex max-w-full items-center gap-0.5 pr-0.5 leading-none transition-[max-width,justify-content,padding] duration-200 lg:w-full ${
                  isSidebarCollapsed
                    ? "lg:max-w-none lg:justify-center lg:px-0"
                    : "lg:max-w-[12rem] lg:justify-around lg:px-1"
                }`}
              >
                <Image
                  src="/branding/signa-logo.svg"
                  alt="Signalibrium"
                  width={52}
                  height={52}
                  className="h-[2.7rem] w-[2.7rem] shrink-0 object-contain"
                  priority
                />
                <span
                  className={`flex min-w-0 items-center text-[1.38rem] font-semibold leading-none tracking-tight text-white transition-[opacity,width,margin] duration-200 sm:text-[1.56rem] ${
                    isSidebarCollapsed
                      ? "pointer-events-none w-0 overflow-hidden opacity-0 lg:ml-0"
                      : "opacity-100 lg:ml-1"
                  }`}
                >
                  <span className="text-white">Signal</span>
                  <span className="signal-wordmark-gradient">ibrium</span>
                </span>
              </Link>
            </div>
            <div className="shrink-0 lg:hidden">
              <StatusChip label="PRIVATE PROTOTYPE" />
            </div>
          </div>

          <div className="mt-3 lg:mt-5">
            <NavLinks collapsed={isSidebarCollapsed} />
          </div>

          <div className={`mt-4 hidden ${isSidebarCollapsed ? "lg:hidden" : "lg:block"}`}>
            <div className="signal-accent-surface mt-[5px] rounded-[0.46rem] p-3">
              <p className="text-[0.84rem] font-semibold text-white">Protected Ticket Focus</p>
              <p className="mt-1.5 text-[0.95rem] font-medium text-cyan-100">
                {topScannerResult
                  ? `${topScannerResult.symbol} ${topScannerResult.strategy}`
                  : "Awaiting scanner results"}
              </p>
              <p className="mt-2.5 text-[0.82rem] leading-5 text-slate-300">
                Best ranked setup remains aligned with the current market state and
                protected sizing rules.
              </p>
              <button className="signal-button mt-3 inline-flex w-full items-center justify-center rounded-[0.46rem] px-3.5 py-2 text-[0.84rem] font-semibold">
                Review Ticket
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/6 bg-[#07111d]/90 backdrop-blur-xl">
            <div className="flex flex-col gap-[5px] px-[5px] py-[5px] sm:px-[5px] lg:px-[5px]">
              <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="signal-toolbar-card flex min-w-0 items-center gap-2.5 px-3 py-2">
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4.5 w-4.5 shrink-0 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <circle cx="8.5" cy="8.5" r="5.2" />
                    <path d="m12.5 12.5 4.5 4.5" />
                  </svg>
                  <span className="truncate text-[0.84rem] text-slate-400">
                    Search assets, strategies, or insights...
                  </span>
                  <span className="signal-surface-soft ml-auto rounded-[0.34rem] px-2 py-0.5 text-[0.68rem] font-semibold text-slate-500">
                    K
                  </span>
                </div>

                <div className="signal-toolbar-card px-3 py-2">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                    BTC
                  </p>
                  <p className="mt-1 text-[0.84rem] font-semibold text-white">$105,238.41</p>
                  <p className="mt-0.5 text-[0.82rem] font-medium text-emerald-300">+1.35%</p>
                </div>
                <div className="signal-toolbar-card px-3 py-2">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                    ETH
                  </p>
                  <p className="mt-1 text-[0.84rem] font-semibold text-white">$2,587.12</p>
                  <p className="mt-0.5 text-[0.82rem] font-medium text-emerald-300">+0.92%</p>
                </div>
                <div className="signal-toolbar-card px-3 py-2">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                    Total Mkt Cap
                  </p>
                  <p className="mt-1 text-[0.84rem] font-semibold text-white">$2.62T</p>
                  <p className="mt-0.5 text-[0.82rem] font-medium text-emerald-300">+0.81%</p>
                </div>
                <div className="signal-toolbar-card px-3 py-2">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                    Market Time
                  </p>
                  <p className="mt-1 text-[1rem] font-semibold text-cyan-200">03:47</p>
                  <p className="mt-0.5 text-[0.76rem] text-slate-300">31 May 2026 / BST</p>
                  <p className="mt-0.5 text-[0.68rem] text-slate-500">Private prototype session</p>
                </div>
                <div className="signal-success-surface rounded-[0.46rem] px-3 py-2">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-emerald-200/70">
                    System Status
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.5)]" />
                    <p className="text-[0.84rem] font-semibold text-emerald-100">
                      All systems operational
                    </p>
                  </div>
                  <p className="mt-0.5 text-[0.68rem] text-slate-300">
                    Current pulse: {marketSnapshot.state}.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-[5px] lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.72rem] text-slate-400 sm:text-[0.8rem]">
                  <StatusChip label="PRIVATE PROTOTYPE" />
                  <span>State: {marketSnapshot.state}</span>
                  <span>Open risk: {formatPercent(marketSnapshot.openRisk)}</span>
                  <span>Sim equity: {formatCompactCurrency(marketSnapshot.simulatedEquity)}</span>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-auto">
                  <button className="signal-surface-soft flex h-9 w-9 items-center justify-center text-slate-300 transition hover:text-white">
                    <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M10 3.5a4 4 0 0 1 4 4v2.2c0 .7.2 1.4.6 2l1.2 1.8H4.2l1.2-1.8c.4-.6.6-1.3.6-2V7.5a4 4 0 0 1 4-4Z" />
                      <path d="M8 15.5a2 2 0 0 0 4 0" />
                    </svg>
                  </button>
                  <div className="signal-surface-soft flex items-center gap-2.5 px-2.5 py-1.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[0.84rem] font-semibold text-white">
                      AR
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-[0.84rem] font-semibold text-white">Alex Rivera</p>
                      <p className="text-[0.68rem] text-slate-400">Pro Member</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-[5px] py-[5px]">{children}</main>
        </div>
      </div>
    </div>
  );
}
