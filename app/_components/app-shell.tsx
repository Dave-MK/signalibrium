import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { marketSnapshot, setups } from "../_data/mock-data";
import { formatCompactCurrency, formatPercent } from "../_lib/format";
import { NavLinks } from "./nav-links";
import { StatusChip } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  const topSetup = setups[0];

  return (
    <div className="relative z-10 min-h-screen">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-white/6 bg-[#06101b]/94 px-3 py-3 backdrop-blur-xl lg:min-h-screen lg:w-[228px] lg:border-b-0 lg:border-r lg:px-3.5 lg:py-4">
          <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
            <div className="min-w-0">
              <Link href="/" className="inline-flex max-w-full items-center gap-0.5 px-1 leading-none">
                <Image
                  src="/branding/signa-logo.svg"
                  alt="Signalibrium"
                  width={52}
                  height={52}
                  className="h-[2.9rem] w-[2.9rem] shrink-0 object-contain"
                  priority
                />
                <span className="flex min-w-0 items-center text-[1.48rem] font-semibold leading-none tracking-tight text-white sm:text-[1.7rem]">
                  <span className="text-white">Signal</span>
                  <span className="signal-wordmark-gradient">ibrium</span>
                </span>
              </Link>
            </div>
            <div className="shrink-0 lg:hidden">
              <StatusChip label="PRIVATE PROTOTYPE" />
            </div>
          </div>

          <div className="mt-4 lg:mt-6">
            <NavLinks />
          </div>

          <div className="mt-5 hidden h-[calc(100vh-4rem)] flex-col lg:flex">
            <div className="signal-accent-surface mt-[5px] rounded-[0.62rem] p-3.5">
              <p className="text-sm font-semibold text-white">Protected Ticket Focus</p>
              <p className="mt-2 text-base font-medium text-cyan-100">
                {topSetup.symbol} {topSetup.strategy}
              </p>
              <p className="mt-3 text-sm leading-5 text-slate-300">
                Best ranked setup remains aligned with the current market state and
                protected sizing rules.
              </p>
              <button className="signal-button mt-4 inline-flex w-full items-center justify-center rounded-[0.62rem] px-4 py-2.5 text-sm font-semibold">
                Review Ticket
              </button>
            </div>

            <div className="mt-auto space-y-[5px]">
              <div className="signal-surface p-3.5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  Market Time
                </p>
                <p className="mt-3 text-[2rem] font-semibold text-cyan-200">03:47</p>
                <p className="mt-1 text-sm text-slate-300">31 May 2026 / BST</p>
                <p className="mt-1 text-sm text-slate-500">Private prototype session</p>
              </div>
              <div className="signal-success-surface p-3.5">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.6)]" />
                  <p className="font-medium text-emerald-100">All systems operational</p>
                </div>
                <p className="mt-2 text-sm leading-5 text-slate-300">
                  Current pulse: {marketSnapshot.state}.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/6 bg-[#07111d]/90 backdrop-blur-xl">
            <div className="flex flex-col gap-[5px] px-[5px] py-[5px] sm:px-[5px] lg:px-[5px]">
              <div className="flex flex-col gap-[5px] xl:flex-row xl:items-center xl:justify-between">
                <div className="signal-toolbar-card flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5">
                  <svg
                    viewBox="0 0 20 20"
                    className="h-5 w-5 shrink-0 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <circle cx="8.5" cy="8.5" r="5.2" />
                    <path d="m12.5 12.5 4.5 4.5" />
                  </svg>
                  <span className="truncate text-sm text-slate-400">
                    Search assets, strategies, or insights...
                  </span>
                  <span className="signal-surface-soft rounded-lg px-2 py-1 text-xs font-semibold text-slate-500">
                    K
                  </span>
                </div>

                <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
                  <div className="signal-toolbar-card px-3.5 py-2.5">
                    <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                      BTC
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">$105,238.41</p>
                    <p className="mt-1 text-sm font-medium text-emerald-300">+1.35%</p>
                  </div>
                  <div className="signal-toolbar-card px-3.5 py-2.5">
                    <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                      ETH
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">$2,587.12</p>
                    <p className="mt-1 text-sm font-medium text-emerald-300">+0.92%</p>
                  </div>
                  <div className="signal-toolbar-card px-3.5 py-2.5">
                    <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                      Total Mkt Cap
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">$2.62T</p>
                    <p className="mt-1 text-sm font-medium text-emerald-300">+0.81%</p>
                  </div>
                  <div className="signal-accent-surface rounded-[0.62rem] px-3.5 py-2.5">
                    <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-400">
                      Market Status
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.5)]" />
                      <p className="text-sm font-semibold text-white">Open</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Signalibrium pulse active</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-[5px] lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-400 sm:text-sm">
                  <StatusChip label="PRIVATE PROTOTYPE" />
                  <span>State: {marketSnapshot.state}</span>
                  <span>Open risk: {formatPercent(marketSnapshot.openRisk)}</span>
                  <span>Sim equity: {formatCompactCurrency(marketSnapshot.simulatedEquity)}</span>
                </div>

                <div className="flex items-center gap-2.5 self-end lg:self-auto">
                  <button className="signal-surface-soft flex h-10 w-10 items-center justify-center text-slate-300 transition hover:text-white">
                    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M10 3.5a4 4 0 0 1 4 4v2.2c0 .7.2 1.4.6 2l1.2 1.8H4.2l1.2-1.8c.4-.6.6-1.3.6-2V7.5a4 4 0 0 1 4-4Z" />
                      <path d="M8 15.5a2 2 0 0 0 4 0" />
                    </svg>
                  </button>
                  <div className="signal-surface-soft flex items-center gap-3 px-3 py-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                      AR
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-white">Alex Rivera</p>
                      <p className="text-xs text-slate-400">Pro Member</p>
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
