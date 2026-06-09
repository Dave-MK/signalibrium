"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { startBrokerOAuthApi, createBrokerConnectionApi } from "@/app/_lib/workspace-api";
import type { BrokerEnvironment, PersistedBrokerConnection } from "@/app/_lib/server/workspace-types";

type Props = {
  onClose:     () => void;
  onConnected: (connection: PersistedBrokerConnection) => void;
};

// ─── Broker catalogue ─────────────────────────────────────────────────────────

type BrokerEntry = {
  key:        string;
  name:       string;
  tagline:    string;
  method:     "oauth" | "apikey" | "soon";
  accent:     string;
  border:     string;
  bg:         string;
  signupUrl?: string;
  // oauth
  demoLabel?: string;
  liveLabel?: string;
  // apikey
  keyLabel?:    string;
  secretLabel?: string;
  keyHelp?:     string;
  keyHelpUrl?:  string;
  needsSecret?: boolean;
};

const BROKERS: BrokerEntry[] = [
  // ── OAuth ────────────────────────────────────────────────────────────────
  {
    key: "Alpaca", name: "Alpaca", tagline: "US Stocks, ETFs & Crypto",
    method: "oauth", demoLabel: "Paper", liveLabel: "Live",
    signupUrl: "https://app.alpaca.markets/signup",
    accent: "text-cyan-300", border: "border-cyan-500/40", bg: "bg-cyan-500/8",
  },
  {
    key: "OANDA", name: "OANDA", tagline: "Forex & CFDs",
    method: "oauth", demoLabel: "Demo", liveLabel: "Live",
    signupUrl: "https://www.oanda.com/register/",
    accent: "text-amber-300", border: "border-amber-500/40", bg: "bg-amber-500/8",
  },
  // ── API key ──────────────────────────────────────────────────────────────
  {
    key: "Binance", name: "Binance", tagline: "Spot · Futures · Margin",
    method: "apikey", needsSecret: true,
    keyLabel: "API Key", secretLabel: "Secret Key",
    keyHelp: "Profile → API Management", keyHelpUrl: "https://www.binance.com/en/my/settings/api-management",
    signupUrl: "https://www.binance.com/en/register",
    accent: "text-yellow-300", border: "border-yellow-500/40", bg: "bg-yellow-500/8",
  },
  {
    key: "Kraken", name: "Kraken", tagline: "Spot · Futures · Margin",
    method: "apikey", needsSecret: true,
    keyLabel: "API Key", secretLabel: "Private Key",
    keyHelp: "Settings → API", keyHelpUrl: "https://www.kraken.com/u/security/api",
    signupUrl: "https://www.kraken.com/sign-up",
    accent: "text-indigo-300", border: "border-indigo-500/40", bg: "bg-indigo-500/8",
  },
  // ── Coming soon ──────────────────────────────────────────────────────────
  { key: "IBKR",         name: "Interactive Brokers", tagline: "Stocks · Options · Futures", method: "soon", accent: "text-purple-300", border: "border-purple-500/20", bg: "bg-purple-500/5" },
  { key: "Schwab",       name: "Schwab",              tagline: "thinkorswim · US Markets",   method: "soon", accent: "text-blue-300",   border: "border-blue-500/20",   bg: "bg-blue-500/5" },
  { key: "Coinbase",     name: "Coinbase",            tagline: "Spot · Advanced Trade",       method: "soon", accent: "text-blue-300",   border: "border-blue-500/20",   bg: "bg-blue-500/5" },
  { key: "tastytrade",   name: "tastytrade",          tagline: "Options · Futures · Crypto",  method: "soon", accent: "text-pink-300",   border: "border-pink-500/20",   bg: "bg-pink-500/5" },
];

const LIVE_BROKERS = BROKERS.filter((b) => b.method !== "soon");
const SOON_BROKERS = BROKERS.filter((b) => b.method === "soon");

type OAuthMessage =
  | { type: "broker-oauth-success"; connection: PersistedBrokerConnection }
  | { type: "broker-oauth-error";   error: string };

// ─── Component ────────────────────────────────────────────────────────────────

export function BrokerSelectModal({ onClose, onConnected }: Props) {
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [env, setEnv]               = useState<Record<string, BrokerEnvironment>>({});
  const [apiKey, setApiKey]         = useState("");
  const [apiSecret, setApiSecret]   = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [mounted, setMounted]       = useState(false);

  const popupRef    = useRef<Window | null>(null);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    return () => {
      if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
      popupRef.current?.close();
    };
  }, []);

  function getEnv(key: string): BrokerEnvironment {
    return env[key] ?? "demo";
  }

  function toggleExpand(key: string) {
    if (expanded === key) {
      setExpanded(null);
    } else {
      setExpanded(key);
      setApiKey("");
      setApiSecret("");
      setError(null);
    }
  }

  // ── OAuth ──────────────────────────────────────────────────────────────────

  async function handleOAuth(broker: BrokerEntry) {
    if (connecting || broker.method !== "oauth") return;
    setConnecting(broker.key);
    setError(null);

    let authUrl: string;
    try {
      const result = await startBrokerOAuthApi(broker.key as "Alpaca" | "OANDA", getEnv(broker.key));
      authUrl = result.authUrl;
    } catch (err) {
      setConnecting(null);
      setError(err instanceof Error ? err.message : "Failed to start authorisation.");
      return;
    }

    const w = 600, h = 700;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(authUrl, "broker-oauth", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);

    if (!popup) {
      setConnecting(null);
      setError("Popup blocked — allow popups for this site and try again.");
      return;
    }

    popupRef.current = popup;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as OAuthMessage;
      if (!data?.type || (data.type !== "broker-oauth-success" && data.type !== "broker-oauth-error")) return;
      window.removeEventListener("message", handleMessage);
      listenerRef.current = null;
      popup.close();
      setConnecting(null);
      if (data.type === "broker-oauth-success") {
        onConnected(data.connection);
        onClose();
      } else {
        setError(data.error ?? "Authorisation failed.");
      }
    };

    listenerRef.current = handleMessage;
    window.addEventListener("message", handleMessage);

    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        if (listenerRef.current) {
          window.removeEventListener("message", handleMessage);
          listenerRef.current = null;
          setConnecting(null);
          setError("Window closed before completing sign-in. Please try again.");
        }
      }
    }, 500);
  }

  // ── API key ────────────────────────────────────────────────────────────────

  async function handleApiKey(broker: BrokerEntry) {
    if (connecting || broker.method !== "apikey") return;
    if (!apiKey.trim())                         { setError(`${broker.keyLabel ?? "API key"} is required.`); return; }
    if (broker.needsSecret && !apiSecret.trim()){ setError(`${broker.secretLabel ?? "Secret"} is required.`); return; }

    setConnecting(broker.key);
    setError(null);

    try {
      const result = await createBrokerConnectionApi({
        provider:    broker.key as "Binance" | "Kraken",
        environment: getEnv(broker.key),
        label:       `${broker.name} ${getEnv(broker.key) === "live" ? "Live" : "Spot"}`,
        apiKey:      apiKey.trim(),
        ...(broker.needsSecret ? { apiSecret: apiSecret.trim() } : {}),
      });
      onConnected(result.connection);
      onClose();
    } catch (err) {
      setConnecting(null);
      setError(err instanceof Error ? err.message : "Connection failed — check your credentials.");
    }
  }

  if (!mounted) return null;

  const modal = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
        onClick={connecting ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a broker"
        className="fixed left-1/2 top-1/2 z-[9999] w-full max-w-[440px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[0.76rem] border border-white/10 bg-[#07111d] shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#07111d] px-5 py-4">
          <h2 className="text-[0.92rem] font-semibold text-white">Connect a broker</h2>
          {!connecting && (
            <button type="button" onClick={onClose} aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/6 hover:text-white">
              ✕
            </button>
          )}
        </div>

        <div className="p-4 space-y-2">
          {/* Global error */}
          {error && (
            <div className="rounded-[0.38rem] border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-[0.76rem] text-red-300">
              {error}
              <button type="button" onClick={() => setError(null)} className="ml-2 text-red-400/60 hover:text-red-300">✕</button>
            </div>
          )}

          {/* Live broker cards */}
          {LIVE_BROKERS.map((broker) => {
            const isExpanded  = expanded === broker.key;
            const isBusy      = connecting === broker.key;
            const currentEnv  = getEnv(broker.key);

            return (
              <div key={broker.key} className={`rounded-[0.56rem] border transition ${broker.border} ${broker.bg}`}>
                {/* Card header row */}
                <div className="flex items-center gap-3 p-3.5">
                  {/* Broker initials avatar */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.4rem] border ${broker.border} text-[0.8rem] font-bold ${broker.accent}`}>
                    {broker.key.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={`text-[0.88rem] font-semibold ${broker.accent}`}>{broker.name}</p>
                    <p className="text-[0.68rem] text-slate-500">{broker.tagline}</p>
                  </div>

                  {broker.method === "oauth" ? (
                    /* OAuth — single button to kick off login */
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {broker.demoLabel && (
                        <div className="flex rounded-[0.26rem] border border-white/8 text-[0.63rem] overflow-hidden">
                          {(["demo", "live"] as BrokerEnvironment[]).map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => setEnv((prev) => ({ ...prev, [broker.key]: e }))}
                              className={`px-2 py-0.5 transition ${currentEnv === e ? `${broker.bg} ${broker.accent} font-medium` : "text-slate-600 hover:text-slate-400"}`}
                            >
                              {e === "demo" ? broker.demoLabel : broker.liveLabel}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={!!connecting}
                        onClick={() => void handleOAuth(broker)}
                        className={`flex items-center gap-1.5 rounded-[0.34rem] border px-3 py-1.5 text-[0.76rem] font-semibold transition disabled:opacity-50 ${broker.border} ${broker.accent} hover:brightness-110`}
                      >
                        {isBusy ? (
                          <>
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Signing in…
                          </>
                        ) : (
                          <>Sign in</>
                        )}
                      </button>
                    </div>
                  ) : (
                    /* API key — expand/collapse */
                    <button
                      type="button"
                      onClick={() => toggleExpand(broker.key)}
                      disabled={!!connecting}
                      className={`shrink-0 rounded-[0.34rem] border px-3 py-1.5 text-[0.76rem] font-semibold transition disabled:opacity-50 ${
                        isExpanded
                          ? `${broker.border} ${broker.accent}`
                          : `border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200`
                      }`}
                    >
                      {isExpanded ? "Cancel" : "Connect"}
                    </button>
                  )}
                </div>

                {/* API key form — inline expand */}
                {broker.method === "apikey" && isExpanded && (
                  <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-3">
                    {/* Step guide */}
                    <p className="text-[0.7rem] text-slate-500">
                      Go to{" "}
                      <a href={broker.keyHelpUrl} target="_blank" rel="noopener noreferrer"
                        className="text-slate-300 underline underline-offset-2 hover:text-white">
                        {broker.keyHelp}
                      </a>
                      {" "}and create a key with <strong className="text-slate-400">Read Only</strong> permissions.
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      {/* API Key */}
                      <div className="col-span-2">
                        <label className="mb-1 block text-[0.63rem] font-semibold uppercase tracking-wider text-slate-600">
                          {broker.keyLabel}
                        </label>
                        <input
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={`Paste ${broker.keyLabel?.toLowerCase()}…`}
                          value={apiKey}
                          onChange={(e) => { setApiKey(e.target.value); setError(null); }}
                          className="w-full rounded-[0.34rem] border border-white/10 bg-[#0a1826] px-3 py-2 text-[0.82rem] text-slate-100 placeholder-slate-700 outline-none focus:border-white/20"
                        />
                      </div>

                      {/* Secret */}
                      {broker.needsSecret && (
                        <div className="col-span-2">
                          <label className="mb-1 block text-[0.63rem] font-semibold uppercase tracking-wider text-slate-600">
                            {broker.secretLabel}
                          </label>
                          <input
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Paste secret key…"
                            value={apiSecret}
                            onChange={(e) => { setApiSecret(e.target.value); setError(null); }}
                            className="w-full rounded-[0.34rem] border border-white/10 bg-[#0a1826] px-3 py-2 text-[0.82rem] text-slate-100 placeholder-slate-700 outline-none focus:border-white/20"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-0.5">
                      <p className="text-[0.64rem] text-slate-700 flex items-center gap-1">
                        <span>🔒</span> Stored encrypted, never displayed again.
                      </p>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleApiKey(broker)}
                        className={`shrink-0 rounded-[0.34rem] border px-4 py-1.5 text-[0.78rem] font-semibold transition disabled:opacity-50 ${broker.border} ${broker.accent} hover:brightness-110`}
                      >
                        {isBusy ? (
                          <span className="flex items-center gap-1.5">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Verifying…
                          </span>
                        ) : "Connect"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Create account link */}
                {broker.signupUrl && !isExpanded && broker.method !== "oauth" && (
                  <div className="border-t border-white/4 px-3.5 py-2">
                    <a href={broker.signupUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[0.65rem] text-slate-600 hover:text-slate-400">
                      No account? Create one at {broker.name} →
                    </a>
                  </div>
                )}
                {broker.signupUrl && broker.method === "oauth" && (
                  <div className="border-t border-white/4 px-3.5 py-2">
                    <a href={broker.signupUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[0.65rem] text-slate-600 hover:text-slate-400">
                      No account? Create one at {broker.name} →
                    </a>
                  </div>
                )}
              </div>
            );
          })}

          {/* Coming soon — compact row */}
          <div className="pt-1">
            <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-widest text-slate-700">Coming soon</p>
            <div className="flex flex-wrap gap-2">
              {SOON_BROKERS.map((b) => (
                <span key={b.key}
                  className="rounded-[0.3rem] border border-white/5 bg-white/[0.015] px-2.5 py-1 text-[0.68rem] text-slate-700">
                  {b.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
