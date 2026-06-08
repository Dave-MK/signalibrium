"use client";

import { useEffect, useRef, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useToast } from "./toast-provider";

// ─── types (mirror the API response shape) ───────────────────────────────────

type Signal      = { id: string; symbol: string };
type Trade       = { id: string; symbol: string; side: string };
type Closed      = { id: string; symbol: string; side: string; status: string; realizedPnl: number };
type EventRef    = { id: string; title: string };
type AlertRef    = { id: string; symbol: string; label: string; condition: "above" | "below"; targetPrice: number };
type WeeklyDigest = { tradeCount: number; winCount: number; lossCount: number; pnlGbp: number } | null;

type NotifState = {
  checkedAt:       string;
  enterNowSignals: Signal[];
  openTrades:      Trade[];
  latestClosed:    Closed[];
  liveEvents:      EventRef[];
  imminentEvents:  EventRef[];
  triggeredAlerts: AlertRef[];
  weeklyDigest:    WeeklyDigest;
};

export type NotifItem = {
  key:   string;
  title: string;
  body:  string;
  type:  "signal" | "trade" | "event" | "info";
  at:    string; // ISO timestamp
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

const PERM_KEY   = "siggi.notif.permission";    // "granted" | "denied" | "default"
const SNAP_KEY   = "siggi.notif.snapshot";      // last NotifState JSON
const FIRED_KEY  = "siggi.notif.fired";         // Set<string> of event-keys already notified
const MUTED_KEY  = "siggi.notif.muted";         // "true" | absent
const DIGEST_KEY = "siggi.notif.lastDigest";    // ISO timestamp of last weekly digest
const ITEMS_KEY  = "siggi.notif.items";         // persisted NotifItem[]

function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveFired(s: Set<string>) {
  const arr = [...s].slice(-200);
  localStorage.setItem(FIRED_KEY, JSON.stringify(arr));
}

function loadSnapshot(): NotifState | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return raw ? (JSON.parse(raw) as NotifState) : null;
  } catch { return null; }
}

function loadItems(): NotifItem[] {
  try {
    const raw = localStorage.getItem(ITEMS_KEY);
    return raw ? (JSON.parse(raw) as NotifItem[]) : [];
  } catch { return []; }
}

function saveItems(items: NotifItem[]) {
  // Keep at most 30 most recent
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items.slice(-30)));
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtPnl(pnl: number) {
  return `${pnl >= 0 ? "+" : ""}£${Math.abs(pnl).toFixed(0)}`;
}

function fmtRelative(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function typeIcon(type: NotifItem["type"]) {
  if (type === "signal") return "🟢";
  if (type === "trade")  return "🤖";
  if (type === "event")  return "⚡";
  return "📊";
}

// ─── context ─────────────────────────────────────────────────────────────────

type NotifCtx = {
  unread:            number;
  muted:             boolean;
  permState:         NotificationPermission;
  recentItems:       NotifItem[];
  toggleMute:        () => void;
  clearUnread:       () => void;
  clearItems:        () => void;
  requestPermission: () => Promise<void>;
};

const NotifContext = createContext<NotifCtx | null>(null);

function useNotifContext() {
  const ctx = useContext(NotifContext);
  if (!ctx) throw new Error("NotificationBell must be used inside <NotificationProvider>");
  return ctx;
}

// ─── NotificationManager ─────────────────────────────────────────────────────

function NotificationManager({
  muted,
  mutedRef,
  onUnreadChange,
  onItemsFired,
}: {
  muted: boolean;
  mutedRef: React.MutableRefObject<boolean>;
  onUnreadChange: (count: number) => void;
  onItemsFired: (items: NotifItem[]) => void;
}) {
  const { addToast }      = useToast();
  const mountedRef        = useRef(true);
  const firedRef          = useRef<Set<string>>(new Set());
  const prevSnapRef       = useRef<NotifState | null>(null);
  const inFlightRef       = useRef(false);
  const [permGranted, setPermGranted] = useState(false);

  useEffect(() => {
    mountedRef.current  = true;
    firedRef.current    = loadFired();
    prevSnapRef.current = loadSnapshot();
    const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
    setPermGranted(perm === "granted");
    return () => { mountedRef.current = false; };
  }, []);

  const processSnapshot = useCallback((next: NotifState) => {
    if (!mountedRef.current) return;

    const prev    = prevSnapRef.current;
    const fired   = firedRef.current;
    let newAlerts = 0;
    const newItems: NotifItem[] = [];

    function notify(key: string, title: string, body: string, type: NotifItem["type"]) {
      if (fired.has(key)) return;
      fired.add(key);
      saveFired(fired);
      newAlerts++;

      const item: NotifItem = { key, title, body, type, at: new Date().toISOString() };
      newItems.push(item);

      if (mutedRef.current) return;

      addToast({ type, title, body });

      if (
        permGranted &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.visibilityState !== "visible"
      ) {
        try {
          new Notification(title, { body, icon: "/branding/signa-logo.svg", tag: key });
        } catch { /* some browsers restrict Notification() without service worker */ }
      }
    }

    // 1. New ENTER NOW signals
    const prevSignalIds = new Set(prev?.enterNowSignals.map((s) => s.id) ?? []);
    for (const sig of next.enterNowSignals) {
      if (!prevSignalIds.has(sig.id)) {
        notify(
          `signal:${sig.id}`,
          `🟢 Enter Now — ${sig.symbol}`,
          "A new ENTER NOW setup appeared. Check the scanner for entry zone, stop, and target.",
          "signal",
        );
      }
    }

    // 2. Siggi opens a new trade
    const prevTradeIds = new Set(prev?.openTrades.map((t) => t.id) ?? []);
    for (const trade of next.openTrades) {
      if (!prevTradeIds.has(trade.id)) {
        notify(
          `trade_open:${trade.id}`,
          `🤖 Siggi opened ${trade.side === "BUY" ? "LONG ▲" : "SHORT ▼"} ${trade.symbol}`,
          "Siggi just entered a live position. View the Trades page for entry, stop, and target.",
          "trade",
        );
      }
    }

    // 3. Siggi closes a trade
    for (const closed of next.latestClosed) {
      const pnlStr  = fmtPnl(closed.realizedPnl);
      const outcome =
        closed.status === "Hit Target" ? `Win ${pnlStr}` :
        closed.status === "Breakeven"  ? `Breakeven ${pnlStr}` :
        closed.status === "Stopped"    ? `Loss ${pnlStr}` :
        closed.status;
      notify(
        `trade_close:${closed.id}`,
        `🤖 Siggi closed ${closed.symbol} — ${outcome}`,
        `${closed.side === "BUY" ? "LONG" : "SHORT"} position resolved. Check history for full details.`,
        "trade",
      );
    }

    // 4. High-impact event goes Live
    const prevLiveIds = new Set(prev?.liveEvents.map((e) => e.id) ?? []);
    for (const ev of next.liveEvents) {
      if (!prevLiveIds.has(ev.id)) {
        notify(
          `event_live:${ev.id}`,
          `⚡ Event Live — ${ev.title}`,
          "A high-impact event is happening now. Check the overview for market context.",
          "event",
        );
      }
    }

    // 5. High-impact event imminent (< 30 min)
    const prevImminentIds = new Set(prev?.imminentEvents.map((e) => e.id) ?? []);
    for (const ev of next.imminentEvents) {
      if (!prevImminentIds.has(ev.id)) {
        notify(
          `event_imminent:${ev.id}`,
          `⏰ Event in < 30 min — ${ev.title}`,
          "A high-impact event starts soon. Review open positions and upcoming setups.",
          "event",
        );
      }
    }

    // 6. Price alerts
    for (const alert of (next.triggeredAlerts ?? [])) {
      notify(
        `price_alert:${alert.id}`,
        `🔔 Alert — ${alert.symbol} ${alert.condition === "above" ? "▲" : "▼"} ${alert.targetPrice}`,
        alert.label,
        "signal",
      );
    }

    // 7. Weekly digest — fires once per 7 days
    if (next.weeklyDigest) {
      const lastDigest   = localStorage.getItem(DIGEST_KEY);
      const lastDigestMs = lastDigest ? Date.parse(lastDigest) : 0;
      const SEVEN_DAYS   = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastDigestMs > SEVEN_DAYS) {
        const d      = next.weeklyDigest;
        const pnlStr = `${d.pnlGbp >= 0 ? "+" : ""}£${Math.abs(d.pnlGbp).toFixed(0)}`;
        const rate   = d.tradeCount > 0 ? Math.round((d.winCount / d.tradeCount) * 100) : 0;
        notify(
          `weekly_digest:${new Date().toISOString().slice(0, 10)}`,
          `📊 Weekly summary — ${d.tradeCount} trade${d.tradeCount === 1 ? "" : "s"}, ${pnlStr}`,
          `${d.winCount}W / ${d.lossCount}L · ${rate}% win rate this week`,
          "info",
        );
        localStorage.setItem(DIGEST_KEY, new Date().toISOString());
      }
    }

    prevSnapRef.current = next;
    localStorage.setItem(SNAP_KEY, JSON.stringify(next));

    if (newItems.length > 0) onItemsFired(newItems);
    if (newAlerts > 0) onUnreadChange(newAlerts);
  }, [addToast, permGranted, onUnreadChange, onItemsFired]);

  useEffect(() => {
    async function fetchAndProcess() {
      if (inFlightRef.current || !mountedRef.current) return;
      inFlightRef.current = true;
      try {
        const res  = await fetch("/api/notifications/state", { cache: "no-store" });
        if (!res.ok || !mountedRef.current) return;
        const data = await res.json() as NotifState;
        if (mountedRef.current) processSnapshot(data);
      } catch { /* non-fatal */ }
      finally   { inFlightRef.current = false; }
    }

    void fetchAndProcess();

    function onPulse() { void fetchAndProcess(); }
    window.addEventListener("signalibrium:market-data-pulsed", onPulse);
    window.addEventListener("signalibrium:market-data-synced",  onPulse);
    return () => {
      window.removeEventListener("signalibrium:market-data-pulsed", onPulse);
      window.removeEventListener("signalibrium:market-data-synced",  onPulse);
    };
  }, [processSnapshot]);

  return null;
}

// ─── provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unread,      setUnread]      = useState(0);
  const [muted,       setMuted]       = useState(false);
  const [permState,   setPermState]   = useState<NotificationPermission>("default");
  const [mounted,     setMounted]     = useState(false);
  const [recentItems, setRecentItems] = useState<NotifItem[]>([]);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    setMounted(true);
    if (typeof Notification !== "undefined") setPermState(Notification.permission);
    setMuted(localStorage.getItem(MUTED_KEY) === "true");
    setRecentItems(loadItems());
  }, []);

  const addUnread = useCallback((n: number) => {
    if (!mutedRef.current) setUnread((prev) => prev + n);
  }, []);

  const addItems = useCallback((items: NotifItem[]) => {
    setRecentItems((prev) => {
      const next = [...prev, ...items].slice(-30);
      saveItems(next);
      return next;
    });
  }, []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    localStorage.setItem(MUTED_KEY, String(next));
    if (!next) setUnread(0);
  }

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermState(result);
    localStorage.setItem(PERM_KEY, result);
  }

  function clearUnread() { setUnread(0); }

  function clearItems() {
    setRecentItems([]);
    localStorage.removeItem(ITEMS_KEY);
  }

  return (
    <NotifContext.Provider value={{ unread, muted, permState, recentItems, toggleMute, clearUnread, clearItems, requestPermission }}>
      {mounted && (
        <NotificationManager
          muted={muted}
          mutedRef={mutedRef}
          onUnreadChange={addUnread}
          onItemsFired={addItems}
        />
      )}
      {children}
    </NotifContext.Provider>
  );
}

// ─── bell ─────────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const { unread, muted, permState, recentItems, toggleMute, clearUnread, clearItems, requestPermission } =
    useNotifContext();
  const [open,    setOpen]    = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef             = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpen((p) => !p);
    clearUnread();
  }

  if (!mounted) return null;

  // Items newest-first for display
  const displayItems = [...recentItems].reverse();

  const dropdown = open && dropPos ? (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} aria-hidden />

      {/* Panel */}
      <div
        style={{ top: dropPos.top, right: dropPos.right }}
        className="fixed z-[9999] w-80 rounded-[0.55rem] border border-white/10 bg-[#07111d] shadow-[0_16px_48px_rgba(0,0,0,0.7)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/6 px-3.5 py-2.5">
          <p className="text-[0.78rem] font-semibold text-white">Notifications</p>
          <div className="flex items-center gap-2">
            {/* Mute toggle */}
            <button
              type="button"
              onClick={toggleMute}
              title={muted ? "Unmute notifications" : "Mute notifications"}
              className={`flex items-center gap-1.5 rounded-[0.3rem] px-2 py-0.5 text-[0.65rem] font-semibold ring-1 transition ${
                muted
                  ? "bg-amber-500/15 text-amber-300 ring-amber-500/30 hover:bg-amber-500/25"
                  : "bg-white/[0.04] text-slate-400 ring-white/10 hover:bg-white/[0.08] hover:text-slate-200"
              }`}
            >
              {muted ? (
                <>
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M2 2l12 12M8 2.5a4.5 4.5 0 0 1 4.5 4.5v2.5M5 5.5v1.5A3 3 0 0 0 8 10M3.5 9H3l-1.5-2v-1M7 13.5a1 1 0 0 0 2 0" strokeLinecap="round" />
                  </svg>
                  Unmute
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M8 2a4.5 4.5 0 0 1 4.5 4.5v2.5l1.5 2H2l1.5-2V6.5A4.5 4.5 0 0 1 8 2ZM7 13.5a1 1 0 0 0 2 0" strokeLinecap="round" />
                  </svg>
                  Mute
                </>
              )}
            </button>

            {/* Push permission */}
            {permState !== "granted" && (
              <button
                type="button"
                onClick={requestPermission}
                className="rounded-[0.3rem] bg-cyan-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-cyan-300 ring-1 ring-cyan-500/25 transition hover:bg-cyan-500/25"
              >
                Enable push
              </button>
            )}
            {permState === "granted" && (
              <span className="flex items-center gap-1 text-[0.65rem] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Push on
              </span>
            )}
            {permState === "denied" && (
              <span className="text-[0.65rem] text-slate-500">Push blocked</span>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-72 overflow-y-auto">
          {muted && (
            <div className="px-3.5 py-3">
              <p className="text-[0.74rem] text-amber-400/80">
                Muted — Siggi is still tracking events in the background. Unmute to start receiving alerts.
              </p>
            </div>
          )}

          {displayItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3.5 py-6 text-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-700" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
              <p className="text-[0.74rem] text-slate-600">No notifications yet this session</p>
              <p className="text-[0.68rem] text-slate-700">
                Alerts appear here when Siggi opens or closes a trade, a new Enter Now signal fires, or a high-impact event goes live.
              </p>
            </div>
          ) : (
            <div>
              {displayItems.map((item) => (
                <div
                  key={item.key}
                  className="border-b border-white/[0.04] px-3.5 py-2.5 last:border-b-0"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-px shrink-0 text-[0.80rem]">{typeIcon(item.type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.74rem] font-semibold leading-snug text-white">{item.title}</p>
                      <p className="mt-0.5 text-[0.68rem] leading-snug text-slate-400">{item.body}</p>
                    </div>
                    <span className="shrink-0 text-[0.62rem] text-slate-600">{fmtRelative(item.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {displayItems.length > 0 && (
          <div className="flex items-center justify-between border-t border-white/6 px-3.5 py-2">
            <p className="text-[0.65rem] text-slate-600">
              {displayItems.length} alert{displayItems.length === 1 ? "" : "s"} this session
            </p>
            <button
              type="button"
              onClick={clearItems}
              className="text-[0.65rem] text-slate-500 transition hover:text-slate-300"
            >
              Clear all
            </button>
          </div>
        )}

        {displayItems.length === 0 && !muted && (
          <div className="border-t border-white/6 px-3.5 py-2">
            <p className="text-[0.65rem] text-slate-700">
              {permState === "granted"
                ? "OS push active — you'll get alerts even when the tab is in the background."
                : "Click \"Enable push\" to get OS alerts when this tab is in the background."}
            </p>
          </div>
        )}
      </div>
    </>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-label={`Notifications${muted ? " (muted)" : unread > 0 ? ` (${unread} new)` : ""}`}
        className={`relative flex h-7 w-7 items-center justify-center rounded-[0.35rem] transition hover:bg-white/8 ${
          muted ? "text-slate-600 hover:text-slate-400" : "text-slate-400 hover:text-white"
        }`}
      >
        {muted ? (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 3l14 14M10 2.5A5.5 5.5 0 0 0 4.5 8v3l-1.5 2h9M17 13H7M8.5 15.5a1.5 1.5 0 0 0 3 0" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M10 2.5A5.5 5.5 0 0 0 4.5 8v3l-1.5 2h14l-1.5-2V8A5.5 5.5 0 0 0 10 2.5ZM8.5 15.5a1.5 1.5 0 0 0 3 0" />
          </svg>
        )}
        {!muted && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[0.52rem] font-bold text-white ring-2 ring-[#07111d]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {muted && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-600/80 text-[0.44rem] font-bold text-white ring-2 ring-[#07111d]">
            z
          </span>
        )}
      </button>

      {mounted && dropdown && createPortal(dropdown, document.body)}
    </>
  );
}
