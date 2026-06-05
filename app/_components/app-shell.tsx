"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { PredictionAccuracySummary } from "@/app/_lib/bot-engine";
import type {
  MarketDataPulseSummary,
  MarketDataSyncSummary,
} from "@/app/_lib/market-data-contract";
import type {
  PersistedMarketSnapshot,
  PersistedScannerResult,
  SupportedDisplayCurrency,
} from "@/app/_lib/server/workspace-types";
import { formatPercent } from "../_lib/format";
import {
  pulseMarketData,
  syncMarketData,
  syncMarketIntelligence,
  updateDisplayCurrency,
} from "../_lib/workspace-api";
import { useDisplayCurrency } from "./display-currency-provider";
import { NavLinks } from "./nav-links";
import { StatusChip } from "./ui";

const sidebarPreferenceStorageKey = "signalibrium.sidebar-collapsed";
const sidebarPreferenceChangedEvent = "signalibrium:sidebar-preference-changed";

function subscribeToSidebarPreference(callback: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === null || event.key === sidebarPreferenceStorageKey) {
      callback();
    }
  }

  function handlePreferenceChanged() {
    callback();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(sidebarPreferenceChangedEvent, handlePreferenceChanged);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(sidebarPreferenceChangedEvent, handlePreferenceChanged);
  };
}

function getSidebarPreferenceSnapshot() {
  return window.localStorage.getItem(sidebarPreferenceStorageKey) === "true";
}

function getSidebarPreferenceServerSnapshot() {
  return false;
}

function HeaderMetric({
  label,
  value,
  detail,
  tone = "text-white",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="signal-toolbar-card px-3 py-1.5">
      <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 text-[0.84rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[0.72rem] text-slate-400">{detail}</p>
    </div>
  );
}

export function AppShell({
  children,
  marketSnapshot,
  predictionAccuracy,
  topScannerResult,
}: {
  children: ReactNode;
  marketSnapshot: PersistedMarketSnapshot;
  predictionAccuracy: PredictionAccuracySummary;
  topScannerResult: PersistedScannerResult | null;
}) {
  const router = useRouter();
  const { currency: activeCurrency } = useDisplayCurrency();
  const autoSyncInFlightRef = useRef(false);
  const livePulseInFlightRef = useRef(false);
  const intelligenceSyncInFlightRef = useRef(false);
  const isSidebarCollapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    getSidebarPreferenceSnapshot,
    getSidebarPreferenceServerSnapshot,
  );

  const latestSyncLabel = marketSnapshot.lastRefresh || "Awaiting sync";

  useEffect(() => {
    const pulseIntervalMs = 15_000;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function runLivePulse() {
      if (
        cancelled ||
        document.visibilityState !== "visible" ||
        livePulseInFlightRef.current ||
        autoSyncInFlightRef.current
      ) {
        return;
      }

      livePulseInFlightRef.current = true;

      try {
        const summary = await pulseMarketData();
        window.dispatchEvent(
          new CustomEvent<MarketDataPulseSummary>("signalibrium:market-data-pulsed", {
            detail: summary,
          }),
        );
        router.refresh();
      } catch {
        // Keep the shell quiet on short-cycle pulse failures.
      } finally {
        livePulseInFlightRef.current = false;
      }
    }

    timeoutId = setTimeout(() => {
      void runLivePulse();
      intervalId = setInterval(() => {
        void runLivePulse();
      }, pulseIntervalMs);
    }, 8_000);

    return () => {
      cancelled = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [router]);

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

  useEffect(() => {
    const intelligenceIntervalMs = 12 * 60_000;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function runIntelligenceSync() {
      if (
        cancelled ||
        document.visibilityState !== "visible" ||
        intelligenceSyncInFlightRef.current
      ) {
        return;
      }

      intelligenceSyncInFlightRef.current = true;

      try {
        await syncMarketIntelligence();
        router.refresh();
      } catch {
        // Keep the shell quiet on background intelligence sync failures.
      } finally {
        intelligenceSyncInFlightRef.current = false;
      }
    }

    timeoutId = setTimeout(() => {
      void runIntelligenceSync();
      intervalId = setInterval(() => {
        void runIntelligenceSync();
      }, intelligenceIntervalMs);
    }, 15_000);

    return () => {
      cancelled = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [router]);

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
                  const nextValue = !isSidebarCollapsed;
                  window.localStorage.setItem(
                    sidebarPreferenceStorageKey,
                    String(nextValue),
                  );
                  window.dispatchEvent(new Event(sidebarPreferenceChangedEvent));
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
              <StatusChip label="BOT LIVE" />
            </div>
          </div>

          <div className="mt-3 lg:mt-5">
            <NavLinks collapsed={isSidebarCollapsed} />
          </div>

          {!isSidebarCollapsed && topScannerResult ? (
            <div className="mt-4 hidden lg:block">
              <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
                <p className="micro-label">Focus</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="truncate text-[0.82rem] font-semibold text-white">
                    {topScannerResult.symbol} {topScannerResult.strategy}
                  </p>
                  <Link
                    href="/scanner"
                    className="text-[0.74rem] font-medium text-slate-400 transition hover:text-white"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/6 bg-[#07111d]/90 backdrop-blur-xl">
            <div className="grid gap-1 px-1.25 py-1 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <HeaderMetric
                label="Live Market"
                value={marketSnapshot.state}
                detail={`Live pulse + auto-sync active / ${latestSyncLabel}`}
                tone="text-cyan-200"
              />
              <HeaderMetric
                label="Prediction Accuracy"
                value={`${predictionAccuracy.overallAccuracy}%`}
                detail={`${predictionAccuracy.accuratePredictions} of ${predictionAccuracy.resolvedPredictions} resolved calls accurate / recent ${predictionAccuracy.recentAccuracy}%`}
                tone="text-emerald-300"
              />

              <div className="signal-toolbar-card flex min-w-0 items-center gap-2 px-2.5 py-2">
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
                  Search markets, opportunities, event intelligence, or chart analysis...
                </span>
                <span className="hidden text-[0.72rem] text-slate-500 sm:inline">
                  {marketSnapshot.tradeableSetups} ready / {formatPercent(marketSnapshot.openRisk)} risk
                </span>
                <select
                  aria-label="Display currency"
                  value={activeCurrency}
                  onChange={(event) => {
                    startTransition(() => {
                      void updateDisplayCurrency(
                        event.target.value as SupportedDisplayCurrency,
                      ).then(() => router.refresh());
                    });
                  }}
                  className="rounded-[0.34rem] border border-white/10 bg-[#0a1320] px-2 py-1 text-[0.72rem] font-medium text-slate-200 outline-none"
                >
                  {(["GBP", "USD", "EUR"] as const).map((currencyOption) => (
                    <option key={currencyOption} value={currencyOption}>
                      {currencyOption}
                    </option>
                  ))}
                </select>
                <StatusChip label="LIVE" />
              </div>
            </div>
          </header>

          <main className="flex-1 px-1.25 py-1.25">{children}</main>
        </div>
      </div>
    </div>
  );
}
