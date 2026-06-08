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
      <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 text-[0.84rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[0.72rem] text-slate-400">{detail}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="signal-toolbar-card px-3 py-1.5 transition hover:bg-white/[0.04]">
        {inner}
      </Link>
    );
  }
  return <div className="signal-toolbar-card px-3 py-1.5">{inner}</div>;
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
        <aside
          className={`group/sidebar relative shrink-0 border-b border-white/6 bg-[#06101b]/94 px-2.5 py-2.5 backdrop-blur-xl transition-[width,padding] duration-200 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r ${
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

          {!isSidebarCollapsed && (
            <div className="mt-4 hidden lg:block">
              <AffiliateBrokerButton className="w-full justify-center" />
            </div>
          )}

        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/6 bg-[#07111d]/90 backdrop-blur-xl">
            {/* ── Mobile header: single compact row ── */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 sm:hidden">
              <div className="min-w-0">
                <p className="truncate text-[0.72rem] font-semibold text-cyan-200">{marketSnapshot.state}</p>
                <p className="text-[0.62rem] text-slate-500">
                  Signal {predictionAccuracy.signalDirectionAccuracy}%
                  {predictionAccuracy.siggiTradeWinRate !== null
                    ? ` · Siggi ${predictionAccuracy.siggiTradeWinRate}%`
                    : " · Siggi building…"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  aria-label="Display currency"
                  value={activeCurrency}
                  onChange={(event) => {
                    void updateDisplayCurrency(
                      event.target.value as SupportedDisplayCurrency,
                    ).then(() => startTransition(() => routerRef.current.refresh()));
                  }}
                  className="rounded-[0.34rem] border border-white/10 bg-[#0a1320] px-2 py-1 text-[0.68rem] font-medium text-slate-200 outline-none"
                >
                  {(["GBP", "USD", "EUR"] as const).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <StatusChip label="LIVE" />
                <BrokerStatusChip initialConnections={brokerConnections} />
                <NotificationBell />
                <UserButton
                  appearance={{ variables: { colorPrimary: "#10b981" } }}
                  userProfileUrl="/billing"
                />
              </div>
            </div>

            {/* ── Desktop header: four metric cards ── */}
            <div className="hidden gap-1 px-1.25 py-1 sm:grid sm:grid-cols-[minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,1fr)]">
              <HeaderMetric
                label="Live Market"
                value={marketSnapshot.state}
                detail={`Live pulse + auto-sync / ${latestSyncLabel}`}
                tone="text-cyan-200"
              />
              <HeaderMetric
                label="Signal Accuracy"
                value={`${predictionAccuracy.signalDirectionAccuracy}%`}
                detail={`${predictionAccuracy.signalDirectionWins}W / ${predictionAccuracy.signalDirectionResolved - predictionAccuracy.signalDirectionWins}L from ${predictionAccuracy.signalDirectionResolved} resolved`}
                tone="text-emerald-300"
                href="/history"
              />
              <HeaderMetric
                label="Siggi Win Rate"
                value={predictionAccuracy.siggiTradeWinRate !== null ? `${predictionAccuracy.siggiTradeWinRate}%` : "Building…"}
                detail={
                  predictionAccuracy.siggiTradeWinRate !== null
                    ? `${predictionAccuracy.siggiTradesWon}W / ${predictionAccuracy.siggiTradesResolved - predictionAccuracy.siggiTradesWon}L from ${predictionAccuracy.siggiTradesResolved} trades`
                    : `${predictionAccuracy.siggiTradesResolved} trade${predictionAccuracy.siggiTradesResolved === 1 ? "" : "s"} — needs 5+ to show rate`
                }
                tone={predictionAccuracy.siggiTradeWinRate !== null ? "text-cyan-200" : "text-slate-500"}
                href="/siggis-trades"
              />
              <div className="signal-toolbar-card flex min-w-0 items-center gap-2 px-2.5 py-2">
                <select
                  aria-label="Display currency"
                  value={activeCurrency}
                  onChange={(event) => {
                    void updateDisplayCurrency(
                      event.target.value as SupportedDisplayCurrency,
                    ).then(() => startTransition(() => routerRef.current.refresh()));
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
                <BrokerStatusChip initialConnections={brokerConnections} />
                <NotificationBell />
                <UserButton
                  appearance={{ variables: { colorPrimary: "#10b981" } }}
                  userProfileUrl="/billing"
                />
              </div>
            </div>
          </header>

          <main className="flex-1 px-1.25 py-1.25">{children}</main>
        </div>
      </div>

      {/* Siggi — self-contained FAB + chat panel, fixed bottom-right */}
      <SiggiChat />

      {/* Getting-started checklist — slides in from right, follows user on every page */}
      <GettingStartedChecklist />
    </div>
    </NotificationProvider>
    </ToastProvider>
  );
}
