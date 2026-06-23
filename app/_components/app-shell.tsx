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

// --------------------------------------------------------------------------
// routerRef pattern: keeps a stable ref to the latest router so background
// effects don't need `router` in their dependency arrays — which would cause
// them to re-register every navigation and leave stale async callbacks
// calling router.refresh() before the new instance is ready.
// --------------------------------------------------------------------------
import { SiggiChat } from "./siggi-chat";
import type { PredictionAccuracySummary } from "@/app/_lib/bot-engine";
import type {
  MarketDataPulseSummary,
  MarketDataSyncSummary,
} from "@/app/_lib/market-data-contract";
import type {
  PersistedBrokerConnection,
  PersistedMarketSnapshot,
  SupportedDisplayCurrency,
} from "@/app/_lib/server/workspace-types";
import { formatPercent } from "../_lib/format";
import {
  analyzeStaleResults,
  pulseMarketData,
  syncMarketData,
  syncMarketIntelligence,
  updateDisplayCurrency,
} from "../_lib/workspace-api";
import { UserButton } from "@clerk/nextjs";
import { AffiliateBrokerButton } from "./affiliate-broker-button";
import { BrokerStatusChip } from "./broker-status-chip";
import { useDisplayCurrency } from "./display-currency-provider";
import { NavLinks } from "./nav-links";
import { StatusChip } from "./ui";
import { GettingStartedChecklist } from "./getting-started-checklist";
import { ToastProvider } from "./toast-provider";
import { NotificationBell, NotificationProvider } from "./notification-manager";

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
  href,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[0.60rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {label}
      </p>
      <p className={`mt-0.5 text-[0.88rem] font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[0.68rem] text-slate-500">{detail}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="flex flex-col justify-center border-r border-white/[0.05] px-3.5 py-2.5 transition hover:bg-white/[0.025]">
        {inner}
      </Link>
    );
  }
  return <div className="flex flex-col justify-center border-r border-white/[0.05] px-3.5 py-2.5">{inner}</div>;
}

export function AppShell({
  children,
  marketSnapshot,
  predictionAccuracy,
  brokerConnections,
}: {
  children: ReactNode;
  marketSnapshot: PersistedMarketSnapshot;
  predictionAccuracy: PredictionAccuracySummary;
  brokerConnections: PersistedBrokerConnection[];
}) {
  const router = useRouter();
  // Stable ref — effects read routerRef.current so they never need `router`
  // as a dependency (avoids "router action before initialization" on re-mount).
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; });

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
        // Guard: component may have been cleaned up while request was in-flight
        if (!cancelled) {
          window.dispatchEvent(
            new CustomEvent<MarketDataPulseSummary>("signalibrium:market-data-pulsed", {
              detail: summary,
            }),
          );
          startTransition(() => routerRef.current.refresh());
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (!cancelled) {
          window.dispatchEvent(
            new CustomEvent<MarketDataSyncSummary>("signalibrium:market-data-synced", {
              detail: summary,
            }),
          );
          startTransition(() => routerRef.current.refresh());
        }
      } catch (error) {
        if (!cancelled) {
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
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketSnapshot.updatedAt]);

  useEffect(() => {
    const intelligenceIntervalMs = 6 * 60_000;
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
        if (!cancelled) {
          startTransition(() => routerRef.current.refresh());
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dedicated analysis loop — runs every 2 minutes to keep all instruments
  // fresh within the 1-hour window.  Completely independent of the intelligence
  // sync so neither blocks the other.
  useEffect(() => {
    const analysisIntervalMs = 2 * 60_000;
    let analysisIntervalId: ReturnType<typeof setInterval> | null = null;
    let analysisTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let analysisCancelled = false;
    let analysisInFlight = false;

    async function runAnalysisPass() {
      if (analysisCancelled || document.visibilityState !== "visible" || analysisInFlight) {
        return;
      }

      analysisInFlight = true;

      try {
        await analyzeStaleResults();
        if (!analysisCancelled) {
          startTransition(() => routerRef.current.refresh());
        }
      } catch {
        // Non-fatal — analysis failures are logged on the server side.
      } finally {
        analysisInFlight = false;
      }
    }

    // Stagger the first run by 30s so it doesn't compete with the initial market sync
    analysisTimeoutId = setTimeout(() => {
      void runAnalysisPass();
      analysisIntervalId = setInterval(() => {
        void runAnalysisPass();
      }, analysisIntervalMs);
    }, 30_000);

    return () => {
      analysisCancelled = true;

      if (analysisTimeoutId) {
        clearTimeout(analysisTimeoutId);
      }

      if (analysisIntervalId) {
        clearInterval(analysisIntervalId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToastProvider>
    <NotificationProvider>
    <div className="relative z-10 min-h-screen">
      <div className="flex min-h-screen flex-col lg:flex-row">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside
          className={`group/sidebar relative shrink-0 border-b border-white/[0.05] bg-[#09090A] px-2.5 py-3 transition-[width,padding] duration-200 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-r-white/[0.05] ${
            isSidebarCollapsed
              ? "lg:w-[4.5rem] lg:px-2 lg:py-3"
              : "lg:w-[14.5rem] lg:px-3 lg:py-3"
          }`}
        >
          {/* Collapse toggle — appears on hover */}
          <div className="pointer-events-none sticky top-14 z-20 hidden h-0 lg:block">
            <button
              type="button"
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => {
                startTransition(() => {
                  const nextValue = !isSidebarCollapsed;
                  window.localStorage.setItem(sidebarPreferenceStorageKey, String(nextValue));
                  window.dispatchEvent(new Event(sidebarPreferenceChangedEvent));
                });
              }}
              className="pointer-events-auto ml-auto flex h-6 w-6 translate-x-[0.9rem] items-center justify-center rounded-full border border-white/10 bg-[#111210] text-[#4B5A6B] opacity-0 shadow-md transition-[opacity,color] hover:text-[#A6B0AC] group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100"
            >
              <svg
                viewBox="0 0 20 20"
                className={`h-3 w-3 transition-transform ${isSidebarCollapsed ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m12.5 4.5-5 5 5 5" />
              </svg>
            </button>
          </div>

          {/* Logo */}
          <div className="flex min-w-0 items-center justify-between gap-2 lg:block">
            <Link
              href="/"
              className={`inline-flex max-w-full items-center gap-2 leading-none transition-all duration-200 lg:w-full ${
                isSidebarCollapsed
                  ? "lg:justify-center lg:px-0"
                  : "lg:px-2"
              }`}
            >
              <Image
                src="/branding/signa-logo.svg"
                alt="Signalibrium"
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 object-contain"
                priority
              />
              <span
                className={`min-w-0 text-[1.15rem] font-bold leading-none tracking-tight text-white transition-[opacity,width] duration-200 ${
                  isSidebarCollapsed
                    ? "pointer-events-none w-0 overflow-hidden opacity-0"
                    : "opacity-100"
                }`}
              >
                Signal<span className="signal-wordmark-gradient">ibrium</span>
              </span>
            </Link>
            <div className="shrink-0 lg:hidden">
              <StatusChip label="BOT LIVE" />
            </div>
          </div>

          {/* Nav */}
          <div className="mt-5 lg:mt-6">
            <NavLinks collapsed={isSidebarCollapsed} />
          </div>

          {/* Affiliate button — only when expanded */}
          {!isSidebarCollapsed && (
            <div className="mt-5 hidden lg:block">
              <AffiliateBrokerButton className="w-full justify-center" />
            </div>
          )}
        </aside>

        {/* ── Main content area ────────────────────────────────────────────── */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">

          {/* Top bar */}
          <header className="sticky top-0 z-20 border-b border-white/[0.05] bg-[#09090A]/95 backdrop-blur-xl">

            {/* Mobile header */}
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 sm:hidden">
              <div className="min-w-0">
                <p className="truncate text-[0.75rem] font-semibold text-[#00C884]">{marketSnapshot.state}</p>
                <p className="text-[0.62rem] text-[#4B5A6B]">
                  {predictionAccuracy.signalDirectionAccuracy}% accuracy
                  {predictionAccuracy.siggiTradeWinRate !== null
                    ? ` · Siggi ${predictionAccuracy.siggiTradeWinRate}%`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  aria-label="Display currency"
                  value={activeCurrency}
                  onChange={(e) => {
                    void updateDisplayCurrency(e.target.value as SupportedDisplayCurrency)
                      .then(() => startTransition(() => routerRef.current.refresh()));
                  }}
                  className="rounded-md border border-white/10 bg-[#111210] px-2 py-1 text-[0.68rem] font-medium text-[#F2F7F2] outline-none"
                >
                  {(["GBP", "USD", "EUR"] as const).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <StatusChip label="LIVE" />
                <BrokerStatusChip initialConnections={brokerConnections} />
                <NotificationBell />
                <UserButton appearance={{ variables: { colorPrimary: "#00C884" } }} userProfileUrl="/billing" />
              </div>
            </div>

            {/* Desktop header — metric strip */}
            <div className="hidden sm:flex sm:items-stretch">
              <HeaderMetric
                label="Live Market"
                value={marketSnapshot.state}
                detail={`Auto-sync · ${latestSyncLabel}`}
                tone="text-[#00C884]"
              />
              <HeaderMetric
                label="Signal Accuracy"
                value={`${predictionAccuracy.signalDirectionAccuracy}%`}
                detail={`${predictionAccuracy.signalDirectionWins}W / ${predictionAccuracy.signalDirectionResolved - predictionAccuracy.signalDirectionWins}L · ${predictionAccuracy.signalDirectionResolved} resolved`}
                tone="text-[#00C884]"
                href="/history"
              />
              <HeaderMetric
                label="Siggi Win Rate"
                value={predictionAccuracy.siggiTradeWinRate !== null ? `${predictionAccuracy.siggiTradeWinRate}%` : "Building…"}
                detail={
                  predictionAccuracy.siggiTradeWinRate !== null
                    ? `${predictionAccuracy.siggiTradesWon}W / ${predictionAccuracy.siggiTradesResolved - predictionAccuracy.siggiTradesWon}L · ${predictionAccuracy.siggiTradesResolved} trades`
                    : `${predictionAccuracy.siggiTradesResolved} trades — needs 5+`
                }
                tone={predictionAccuracy.siggiTradeWinRate !== null ? "text-[#00C884]" : "text-[#4B5A6B]"}
                href="/siggis-trades"
              />
              {/* Right side — controls */}
              <div className="ml-auto flex items-center gap-3 px-4 py-2">
                <select
                  aria-label="Display currency"
                  value={activeCurrency}
                  onChange={(e) => {
                    void updateDisplayCurrency(e.target.value as SupportedDisplayCurrency)
                      .then(() => startTransition(() => routerRef.current.refresh()));
                  }}
                  className="rounded-md border border-white/10 bg-[#111210] px-2.5 py-1.5 text-[0.72rem] font-medium text-[#F2F7F2] outline-none transition hover:border-white/16"
                >
                  {(["GBP", "USD", "EUR"] as const).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <StatusChip label="LIVE" />
                <BrokerStatusChip initialConnections={brokerConnections} />
                <NotificationBell />
                <UserButton appearance={{ variables: { colorPrimary: "#00C884" } }} userProfileUrl="/billing" />
              </div>
            </div>
          </header>

          <main className="flex-1 p-[5px]">{children}</main>
        </div>
      </div>

      <SiggiChat />
      <GettingStartedChecklist />
    </div>
    </NotificationProvider>
    </ToastProvider>
  );
}
