"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  deleteBrokerConnectionApi,
  fetchBrokerAccountApi,
  updateBrokerConnectionApi,
} from "@/app/_lib/workspace-api";
import type {
  BrokerProvider,
  PersistedBrokerConnection,
} from "@/app/_lib/server/workspace-types";
import type { BrokerAccountPayload } from "@/app/_lib/workspace-api";
import { useBrokerPositions } from "@/app/_lib/use-broker-positions";
import { useBrokerPrices } from "@/app/_lib/use-broker-prices";
import { PositionsPanel } from "./positions-panel";
import { BrokerSelectModal } from "./broker-select-modal";

type Props = {
  initialConnections: PersistedBrokerConnection[];
};

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatBalance(amount: number, currency: string) {
  const abs = Math.abs(amount);
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  const formatted =
    abs >= 100_000
      ? `${sym}${(abs / 1000).toFixed(1)}k`
      : abs >= 1_000
        ? `${sym}${abs.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
        : `${sym}${abs.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return amount < 0 ? `-${formatted}` : formatted;
}

function pnlClass(pnl: number) {
  if (pnl > 0) return "text-emerald-400";
  if (pnl < 0) return "text-red-400";
  return "text-slate-400";
}

function providerColors(provider: BrokerProvider) {
  switch (provider) {
    case "Alpaca":  return { chip: "border-cyan-500/30 bg-cyan-500/8 text-cyan-300",      dot: "bg-cyan-400",    accent: "text-cyan-300" };
    case "OANDA":   return { chip: "border-amber-500/30 bg-amber-500/8 text-amber-300",   dot: "bg-amber-400",   accent: "text-amber-300" };
    case "Binance": return { chip: "border-yellow-500/30 bg-yellow-500/8 text-yellow-300", dot: "bg-yellow-400", accent: "text-yellow-300" };
    case "Kraken":  return { chip: "border-indigo-500/30 bg-indigo-500/8 text-indigo-300", dot: "bg-indigo-400", accent: "text-indigo-300" };
    case "IBKR":    return { chip: "border-purple-500/30 bg-purple-500/8 text-purple-300", dot: "bg-purple-400", accent: "text-purple-300" };
    default:        return { chip: "border-white/10 bg-white/5 text-slate-300",            dot: "bg-slate-500",   accent: "text-slate-300" };
  }
}

function statusDotColor(status: PersistedBrokerConnection["status"]) {
  if (status === "connected") return "bg-emerald-400";
  if (status === "error")     return "bg-red-400";
  return "bg-slate-500";
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BrokerStatusChip({ initialConnections }: Props) {
  const router = useRouter();
  const chipRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [connections, setConnections] = useState(initialConnections);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const [accountData, setAccountData] = useState<Record<string, BrokerAccountPayload>>({});
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [positionsOpen, setPositionsOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setConnections(initialConnections);
  }, [initialConnections]);

  useEffect(() => {
    const firstConnected = connections.find((c) => c.status === "connected");
    setActiveId((prev) => {
      if (prev && connections.find((c) => c.id === prev)) return prev;
      return firstConnected?.id ?? connections[0]?.id ?? null;
    });
  }, [connections]);

  const refreshAccount = useCallback(async (conn: PersistedBrokerConnection) => {
    try {
      const result = await fetchBrokerAccountApi(conn.id);
      setAccountData((prev) => ({ ...prev, [conn.id]: result.account }));
      setAccountErrors((prev) => {
        const next = { ...prev };
        delete next[conn.id];
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch account.";
      setAccountErrors((prev) => ({ ...prev, [conn.id]: msg }));
      if (msg.toLowerCase().includes("reconnect") || msg.toLowerCase().includes("credentials not found")) {
        setConnections((prev) =>
          prev.map((c) =>
            c.id === conn.id
              ? { ...c, status: "error", lastError: "Credentials not found. Please reconnect." }
              : c,
          ),
        );
      }
    }
  }, []);

  useEffect(() => {
    const connected = connections.filter((c) => c.status === "connected");
    if (connected.length === 0) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }
    connected.forEach((c) => void refreshAccount(c));
    pollIntervalRef.current = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      connections.filter((c) => c.status === "connected").forEach((c) => void refreshAccount(c));
    }, 30_000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections.map((c) => c.id + c.status).join(",")]);

  // ── Derived: active connection (may be null) ────────────────────────────────
  const primaryConnection =
    connections.find((c) => c.status === "connected") ??
    connections.find((c) => c.status === "error") ??
    connections[0] ??
    null;

  const activeConn = primaryConnection
    ? (connections.find((c) => c.id === activeId) ?? primaryConnection)
    : null;

  // ── Hooks — always called, enabled only when relevant ─────────────────────
  // (Must be before any conditional returns to satisfy React Rules of Hooks)
  const {
    positions,
    fetchedAt: positionsFetchedAt,
    loading:   positionsLoading,
    error:     positionsError,
  } = useBrokerPositions(
    activeConn?.id ?? "",
    { enabled: dropdownOpen && (activeConn?.status === "connected") },
  );

  const positionSymbols = positions.map((p) => p.symbol);
  const livePrices = useBrokerPrices({
    provider: activeConn?.provider ?? null,
    symbols:  positionSymbols,
    enabled:  positionSymbols.length > 0,
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleDisconnect(connectionId: string) {
    setDisconnecting(connectionId);
    try {
      await deleteBrokerConnectionApi(connectionId);
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      setAccountData((prev) => { const next = { ...prev }; delete next[connectionId]; return next; });
      router.refresh();
    } catch { /* noop */ }
    finally { setDisconnecting(null); }
  }

  async function handleAutoExecuteToggle(connectionId: string, enabled: boolean) {
    // Optimistic update
    setConnections((prev) =>
      prev.map((c) => c.id === connectionId ? { ...c, autoExecuteSiggi: enabled } : c),
    );
    try {
      await updateBrokerConnectionApi(connectionId, { autoExecuteSiggi: enabled });
      router.refresh();
    } catch {
      // Revert on failure
      setConnections((prev) =>
        prev.map((c) => c.id === connectionId ? { ...c, autoExecuteSiggi: !enabled } : c),
      );
    }
  }

  function openDropdown() {
    if (!chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setDropdownOpen(true);
  }

  function closeDropdown() { setDropdownOpen(false); }
  function openModal()     { closeDropdown(); setModalOpen(true); }

  // ── Paper (no broker) chip ─────────────────────────────────────────────────

  if (!primaryConnection) {
    return (
      <>
        <button
          ref={chipRef}
          type="button"
          onClick={openModal}
          title="Connect a broker"
          className="flex items-center gap-1.5 rounded-full border border-slate-600/40 bg-slate-800/50 px-2.5 py-1 text-[0.7rem] font-medium text-slate-400 transition hover:border-slate-500/60 hover:text-slate-200"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-slate-600" aria-hidden="true" />
          <span>Paper</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-slate-500">Connect broker</span>
        </button>

        {mounted && modalOpen && (
          <BrokerSelectModal
            onClose={() => setModalOpen(false)}
            onConnected={(conn) => {
              setConnections((prev) => [...prev, conn]);
              setModalOpen(false);
              router.refresh();
            }}
          />
        )}
      </>
    );
  }

  // ── Connected chip ─────────────────────────────────────────────────────────

  const colors   = providerColors(primaryConnection.provider);
  const hasError = primaryConnection.status === "error";
  const chipData = accountData[primaryConnection.id] ?? null;

  let balanceText: string | null = null;
  let pnlText: string | null = null;
  let pnlCls = "text-slate-400";

  if (chipData && !("error" in chipData)) {
    if ("equity" in chipData) {
      balanceText = formatBalance(chipData.equity, chipData.currency);
      pnlText     = `${chipData.dailyPnl >= 0 ? "+" : ""}${formatBalance(chipData.dailyPnl, chipData.currency)}`;
      pnlCls      = pnlClass(chipData.dailyPnl);
    } else if ("nav" in chipData) {
      balanceText = formatBalance(chipData.nav, chipData.currency);
      pnlText     = `${chipData.unrealizedPnl >= 0 ? "+" : ""}${formatBalance(chipData.unrealizedPnl, chipData.currency)}`;
      pnlCls      = pnlClass(chipData.unrealizedPnl);
    } else if ("usdtBalance" in chipData) {
      balanceText = chipData.usdtBalance > 0
        ? formatBalance(chipData.usdtBalance, "USDT")
        : `${chipData.assetCount} asset${chipData.assetCount !== 1 ? "s" : ""}`;
    } else if ("fiatBalance" in chipData) {
      balanceText = chipData.fiatBalance > 0
        ? formatBalance(chipData.fiatBalance, chipData.currency)
        : `${chipData.balances.length} asset${chipData.balances.length !== 1 ? "s" : ""}`;
    }
  }

  const activeData = activeConn ? (accountData[activeConn.id] ?? null) : null;

  // ── Dropdown ───────────────────────────────────────────────────────────────

  const dropdown = dropdownOpen && dropdownPos && activeConn && (
    <>
      <div className="fixed inset-0 z-[9990]" onClick={closeDropdown} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Broker account"
        style={{ top: dropdownPos.top, right: dropdownPos.right }}
        className="fixed z-[9991] w-[300px] rounded-[0.64rem] border border-white/10 bg-[#07111d] shadow-[0_16px_48px_rgba(0,0,0,0.75)]"
      >
        {/* Connection tabs (if multiple) */}
        {connections.length > 1 && (
          <div className="flex gap-1 border-b border-white/6 px-3 pt-3">
            {connections.map((conn) => (
              <button
                key={conn.id}
                type="button"
                onClick={() => setActiveId(conn.id)}
                className={`rounded-t-[0.3rem] px-3 py-1.5 text-[0.7rem] font-medium transition ${
                  conn.id === activeConn.id ? "border-b-2 border-blue-400 text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {conn.provider}
              </button>
            ))}
          </div>
        )}

        {/* Active connection header */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(activeConn.status)}`} aria-hidden="true" />
            <div>
              <p className={`text-[0.82rem] font-semibold ${providerColors(activeConn.provider).accent}`}>
                {activeConn.label}
              </p>
              {activeConn.accountRef && (
                <p className="text-[0.67rem] text-slate-500">{activeConn.accountRef}</p>
              )}
            </div>
          </div>
          <button type="button" onClick={closeDropdown} aria-label="Close"
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/6 hover:text-slate-300">
            ✕
          </button>
        </div>

        {/* Error state */}
        {activeConn.status === "error" && (
          <div className="mx-4 mb-3 rounded-[0.38rem] border border-red-500/20 bg-red-500/8 px-3 py-2 text-[0.76rem] text-red-300">
            {activeConn.lastError ?? "Credentials missing — please disconnect and reconnect."}
          </div>
        )}

        {/* Live account stats */}
        {activeData && !("error" in activeData) && activeConn.status === "connected" && (
          <div className="border-t border-white/6 px-4 py-3">
            {"equity" in activeData && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <Stat label="Equity"       value={formatBalance(activeData.equity, activeData.currency)} />
                <Stat label="Today's P&L"  value={`${activeData.dailyPnl >= 0 ? "+" : ""}${formatBalance(activeData.dailyPnl, activeData.currency)}`} valueClass={pnlClass(activeData.dailyPnl)} />
                <Stat label="Cash"         value={formatBalance(activeData.cash, activeData.currency)} />
                <Stat label="Buying Power" value={formatBalance(activeData.buyingPower, activeData.currency)} />
              </div>
            )}
            {"nav" in activeData && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <Stat label="NAV"         value={formatBalance(activeData.nav, activeData.currency)} />
                <Stat label="Open P&L"    value={`${activeData.unrealizedPnl >= 0 ? "+" : ""}${formatBalance(activeData.unrealizedPnl, activeData.currency)}`} valueClass={pnlClass(activeData.unrealizedPnl)} />
                <Stat label="Balance"     value={formatBalance(activeData.balance, activeData.currency)} />
                <Stat label="Open Trades" value={String(activeData.openTradeCount)} />
              </div>
            )}
            {"usdtBalance" in activeData && (
              <div className="space-y-1.5">
                <p className="text-[0.63rem] text-slate-600">Top holdings</p>
                {activeData.balances.slice(0, 4).map((b) => (
                  <div key={b.asset} className="flex items-center justify-between">
                    <span className="text-[0.76rem] font-medium text-slate-300">{b.asset}</span>
                    <span className="tabular-nums text-[0.76rem] text-white">
                      {b.total < 0.001 ? b.total.toExponential(2) : b.total.toLocaleString("en-GB", { maximumFractionDigits: 6 })}
                    </span>
                  </div>
                ))}
                {activeData.balances.length > 4 && (
                  <p className="text-[0.63rem] text-slate-600">+{activeData.balances.length - 4} more assets</p>
                )}
              </div>
            )}
            {"fiatBalance" in activeData && (
              <div className="space-y-1.5">
                <p className="text-[0.63rem] text-slate-600">Top holdings</p>
                {activeData.balances.slice(0, 4).map((b) => (
                  <div key={b.asset} className="flex items-center justify-between">
                    <span className="text-[0.76rem] font-medium text-slate-300">{b.asset}</span>
                    <span className="tabular-nums text-[0.76rem] text-white">
                      {b.total < 0.001 ? b.total.toExponential(2) : b.total.toLocaleString("en-GB", { maximumFractionDigits: 6 })}
                    </span>
                  </div>
                ))}
                {activeData.balances.length > 4 && (
                  <p className="text-[0.63rem] text-slate-600">+{activeData.balances.length - 4} more assets</p>
                )}
              </div>
            )}
            <p className="mt-2.5 text-[0.62rem] text-slate-700">
              Updated {new Date(activeData.fetchedAt).toLocaleTimeString()}
            </p>
          </div>
        )}

        {/* Open positions */}
        {activeConn.status === "connected" && (
          <div className="border-t border-white/6">
            <button
              type="button"
              onClick={() => setPositionsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-[0.72rem] text-slate-400 transition hover:text-slate-200"
            >
              <span className="font-medium">
                Open positions
                {positions.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-[0.62rem] text-slate-300">
                    {positions.length}
                  </span>
                )}
              </span>
              <span className={`transition ${positionsOpen ? "rotate-180" : ""}`} aria-hidden="true">▾</span>
            </button>
            {positionsOpen && (
              <div className="px-4 pb-3">
                <PositionsPanel
                  positions={positions}
                  livePrices={livePrices}
                  loading={positionsLoading}
                  error={positionsError}
                  fetchedAt={positionsFetchedAt}
                  compact
                />
              </div>
            )}
          </div>
        )}

        {/* Siggi auto-execute toggle */}
        {activeConn.status === "connected" && (
          <div className="border-t border-white/6 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.76rem] font-medium text-slate-200">Siggi auto-trading</p>
                <p className="text-[0.68rem] text-slate-500 leading-snug">
                  {activeConn.autoExecuteSiggi
                    ? "Siggi's trades execute live on this account"
                    : "Enable to forward Siggi's trades as live orders"}
                </p>
              </div>
              <button
                type="button"
                aria-label={activeConn.autoExecuteSiggi ? "Disable Siggi auto-trading" : "Enable Siggi auto-trading"}
                onClick={() => void handleAutoExecuteToggle(activeConn.id, !activeConn.autoExecuteSiggi)}
                className={`relative shrink-0 h-5 w-9 rounded-full transition-colors duration-200 ${
                  activeConn.autoExecuteSiggi ? "bg-cyan-500" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    activeConn.autoExecuteSiggi ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {activeConn.autoExecuteSiggi && activeConn.environment === "live" && (
              <p className="mt-1.5 rounded-[0.28rem] bg-amber-500/8 px-2 py-1 text-[0.64rem] text-amber-300 ring-1 ring-amber-500/20">
                ⚠ Live account — real money will be traded
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-white/6 p-3 space-y-1.5">
          <button type="button" onClick={openModal}
            className="w-full rounded-[0.36rem] border border-white/8 py-2 text-[0.76rem] text-slate-400 transition hover:border-white/16 hover:text-slate-200">
            + Connect another broker
          </button>
          <button
            type="button"
            disabled={disconnecting === activeConn.id}
            onClick={() => void handleDisconnect(activeConn.id)}
            className="w-full rounded-[0.36rem] border border-red-500/15 py-2 text-[0.76rem] text-red-400/80 transition hover:border-red-500/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {disconnecting === activeConn.id ? "Disconnecting…" : `Disconnect ${activeConn.provider}`}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        onClick={openDropdown}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition hover:brightness-110 ${
          hasError ? "border-red-500/30 bg-red-500/8 text-red-300" : colors.chip
        }`}
        title={hasError ? "Credentials missing — click to manage" : `${primaryConnection.label} — click to manage`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasError ? "bg-red-400" : "bg-emerald-400"}`} aria-hidden="true" />
        <span className="hidden sm:inline">{primaryConnection.label}</span>
        <span className="sm:hidden">{primaryConnection.provider}</span>
        {hasError ? (
          <span className="text-red-400/80">⚠</span>
        ) : (
          <>
            {balanceText && (
              <>
                <span className="opacity-30" aria-hidden="true">·</span>
                <span className="tabular-nums">{balanceText}</span>
              </>
            )}
            {pnlText && <span className={`tabular-nums ${pnlCls}`}>{pnlText}</span>}
          </>
        )}
      </button>

      {mounted && createPortal(<>{dropdown}</>, document.body)}

      {mounted && modalOpen && (
        <BrokerSelectModal
          onClose={() => setModalOpen(false)}
          onConnected={(conn) => {
            setConnections((prev) => [...prev, conn]);
            setModalOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// ── Stat cell ──────────────────────────────────────────────────────────────────

function Stat({ label, value, valueClass = "text-white" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[0.63rem] text-slate-600">{label}</p>
      <p className={`text-[0.84rem] font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
