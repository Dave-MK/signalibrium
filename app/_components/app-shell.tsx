"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import type { MarketDataSyncSummary } from "@/app/_lib/market-data-contract";
import type {
  PersistedMarketSnapshot,
  PersistedScannerResult,
} from "@/app/_lib/server/workspace-types";
import { formatCompactCurrency, formatPercent } from "../_lib/format";
import { syncMarketData } from "../_lib/workspace-api";
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
  const router = useRouter();
  const autoSyncInFlightRef = useRef(false);
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

  const latestSyncLabel = marketSnapshot.lastRefresh || "Awaiting sync";

  useEffect(() => {
    const syncIntervalMs = 70_000;
    const lastSyncTimestamp = Date.parse(marketSnapshot.updatedAt);
    const syncAgeMs = Number.isFinite(lastSyncTimestamp)
      ? Date.now() - lastSyncTimestamp
      : syncIntervalMs;
    const initialDelayMs =
      syncAgeMs >= syncIntervalMs ? 5_000 : syncIntervalMs - syncAgeMs;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function runAutoSync() {
      if (cancelled || document.visibilityState !== "visible" || autoSyncInFlightRef.current) {
        return;
      }

      autoSyncInFlightRef.current = true;

      try {
        const summary = await syncMarketData();
        window.dispatchEvent(
          new CustomEvent<MarketDataSyncSummary>("signalibrium:market-data-synced", {
            detail: summary,
          }),
        );
        router.refresh();
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent<{ message: string }>("signalibrium:market-data-sync-error", {
            detail: {
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to sync live market data",
            },
          }),
        );
      } finally {
        autoSyncInFlightRef.current = false;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const currentSyncAgeMs = Date.now() - Date.parse(marketSnapshot.updatedAt);

      if (currentSyncAgeMs >= syncIntervalMs) {
        void runAutoSync();
      }
    }

    timeoutId = setTimeout(() => {
      void runAutoSync();
      intervalId = setInterval(() => {
        void runAutoSync();
      }, syncIntervalMs);
    }, initialDelayMs);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [marketSnapshot.updatedAt, router]);

  return (
    <div className="relative z-10 min-h-screen">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside
          className={`group/sidebar relative border-b border-white/6 bg-[#06101b]/94 px-2.5 py-2.5 backdrop-blur-xl transition-[width,padding] duration-200 lg:min-h-screen lg:border-b-0 lg:border-r ${
            isSidebarCollapsed
              ? "lg:w-19 lg:px-2 lg:py-3"
              : "lg:w-55 lg:px-3 lg:py-3"
          }`}
        >
          <div className="pointer-events-none sticky top-13.5 z-20 hidden h-0 lg:block">
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
                    : "lg:max-w-48 lg:justify-around lg:px-1"
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
            <div className="signal-accent-surface mt-1.25 rounded-[0.46rem] p-3">
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
            <div className="flex flex-col gap-1 px-1.25 py-1">
              <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.15fr)_minmax(220px,0.95fr)]">
                <div className="signal-toolbar-card px-3 py-1.5">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                    Watchlist Move
                  </p>
                  <p className="mt-0.5 text-[0.82rem] font-semibold text-white">
                    {formatPercent(marketSnapshot.watchlistMove, true)}
                  </p>
                  <p className="mt-0.5 text-[0.76rem] text-slate-400">
                    Average move across the synced workspace basket
                  </p>
                </div>
                <div className="signal-toolbar-card px-3 py-1.5">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                    Tradeable Setups
                  </p>
                  <p className="mt-0.5 text-[0.82rem] font-semibold text-white">
                    {marketSnapshot.tradeableSetups}
                  </p>
                  <p className="mt-0.5 text-[0.76rem] text-slate-400">
                    Ranked setups still inside the current plan
                  </p>
                </div>
                <div className="signal-toolbar-card px-3 py-1.5">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                    Blocked Setups
                  </p>
                  <p className="mt-0.5 text-[0.82rem] font-semibold text-white">
                    {marketSnapshot.blockedSetups}
                  </p>
                  <p className="mt-0.5 text-[0.76rem] text-slate-400">
                    Signals currently filtered by workflow rules
                  </p>
                </div>
                <div className="signal-toolbar-card px-3 py-1.5">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                    Latest Sync
                  </p>
                  <p className="mt-0.5 text-[0.92rem] font-semibold text-cyan-200">
                    {latestSyncLabel}
                  </p>
                  <p className="mt-0.5 text-[0.76rem] text-slate-300">
                    Provider-backed market snapshot
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-slate-500">
                    Background refresh runs automatically
                  </p>
                </div>
                <div className="signal-success-surface rounded-[0.46rem] px-3 py-1.5">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-emerald-200/70">
                    System Status
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.5)]" />
                    <p className="text-[0.8rem] font-semibold text-emerald-100">
                      All systems operational
                    </p>
                  </div>
                  <p className="mt-0.5 text-[0.68rem] text-slate-300">
                    Current pulse: {marketSnapshot.state}.
                  </p>
                </div>
                <div className="signal-toolbar-card flex items-center justify-between gap-2 px-2.5 py-1.5 sm:col-span-2 xl:col-span-1">
                  <button className="signal-surface-soft flex h-8 w-8 shrink-0 items-center justify-center text-slate-300 transition hover:text-white">
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M10 3.5a4 4 0 0 1 4 4v2.2c0 .7.2 1.4.6 2l1.2 1.8H4.2l1.2-1.8c.4-.6.6-1.3.6-2V7.5a4 4 0 0 1 4-4Z" />
                      <path d="M8 15.5a2 2 0 0 0 4 0" />
                    </svg>
                  </button>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.78rem] font-semibold text-white">
                      AR
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[0.8rem] font-semibold leading-tight text-white">Alex Rivera</p>
                      <p className="truncate text-[0.64rem] text-slate-400">Pro Member</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-slate-400 sm:text-[0.78rem]">
                  <StatusChip label="PRIVATE PROTOTYPE" />
                  <span>State: {marketSnapshot.state}</span>
                  <span>Open risk: {formatPercent(marketSnapshot.openRisk)}</span>
                  <span>Sim equity: {formatCompactCurrency(marketSnapshot.simulatedEquity)}</span>
                </div>

                <div className="signal-toolbar-card flex min-w-0 items-center gap-2 px-2.5 py-1.5 lg:w-[320px] lg:self-auto xl:w-90">
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4 shrink-0 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <circle cx="8.5" cy="8.5" r="5.2" />
                    <path d="m12.5 12.5 4.5 4.5" />
                  </svg>
                  <span className="truncate text-[0.78rem] text-slate-400">
                    Search assets, strategies, or insights...
                  </span>
                  <span className="signal-surface-soft ml-auto rounded-[0.34rem] px-1.5 py-0.5 text-[0.64rem] font-semibold text-slate-500">
                    K
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-1.25 py-1.25">{children}</main>
        </div>
      </div>
    </div>
  );
}
