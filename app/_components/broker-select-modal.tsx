"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { startBrokerOAuthApi, createBrokerConnectionApi } from "@/app/_lib/workspace-api";
import type { BrokerEnvironment, PersistedBrokerConnection } from "@/app/_lib/server/workspace-types";

type Props = {
  onClose: () => void;
  onConnected: (connection: PersistedBrokerConnection) => void;
};

// ── Broker catalogue ───────────────────────────────────────────────────────────

type ConnMethod = "oauth" | "apikey" | "soon";

type BrokerDef = {
  key: string;
  name: string;
  tagline: string;
  method: ConnMethod;
  accent: string;
  border: string;
  bg: string;
  // OAuth brokers
  hasEnvChoice?: boolean;
  demoLabel?: string;
  liveLabel?: string;
  // API-key brokers
  keyLabel?: string;
  secretLabel?: string;
  keyHelp?: string;
  keyHelpUrl?: string;
  needsSecret?: boolean;
};

const BROKERS_BY_CATEGORY: Array<{ label: string; brokers: BrokerDef[] }> = [
  {
    label: "Stocks & Derivatives",
    brokers: [
      {
        key: "Alpaca", name: "Alpaca", tagline: "US Stocks & Crypto",
        method: "oauth", hasEnvChoice: true, demoLabel: "Paper", liveLabel: "Live",
        accent: "text-cyan-300", border: "border-cyan-500/40", bg: "bg-cyan-500/8",
      },
      {
        key: "IBKR", name: "Interactive Brokers", tagline: "Stocks · Options · Futures",
        method: "soon",
        accent: "text-purple-300", border: "border-purple-500/20", bg: "bg-purple-500/5",
      },
      {
        key: "Schwab", name: "Schwab", tagline: "thinkorswim · US Markets",
        method: "soon",
        accent: "text-blue-300", border: "border-blue-500/20", bg: "bg-blue-500/5",
      },
      {
        key: "TradeStation", name: "TradeStation", tagline: "Stocks · Futures · Options",
        method: "soon",
        accent: "text-green-300", border: "border-green-500/20", bg: "bg-green-500/5",
      },
      {
        key: "tastytrade", name: "tastytrade", tagline: "Options · Futures · Crypto",
        method: "soon",
        accent: "text-pink-300", border: "border-pink-500/20", bg: "bg-pink-500/5",
      },
      {
        key: "Tradier", name: "Tradier", tagline: "US Stocks & Options",
        method: "soon",
        accent: "text-emerald-300", border: "border-emerald-500/20", bg: "bg-emerald-500/5",
      },
      {
        key: "Robinhood", name: "Robinhood", tagline: "Stocks · Options · Crypto",
        method: "soon",
        accent: "text-lime-300", border: "border-lime-500/20", bg: "bg-lime-500/5",
      },
    ],
  },
  {
    label: "Forex & CFDs",
    brokers: [
      {
        key: "OANDA", name: "OANDA", tagline: "Forex & CFDs",
        method: "oauth", hasEnvChoice: true, demoLabel: "Demo", liveLabel: "Live",
        accent: "text-amber-300", border: "border-amber-500/40", bg: "bg-amber-500/8",
      },
      {
        key: "IG", name: "IG Group", tagline: "Forex · Indices · CFDs",
        method: "soon",
        accent: "text-sky-300", border: "border-sky-500/20", bg: "bg-sky-500/5",
      },
      {
        key: "Saxo", name: "Saxo Bank", tagline: "Forex · Equities · Bonds",
        method: "soon",
        accent: "text-teal-300", border: "border-teal-500/20", bg: "bg-teal-500/5",
      },
      {
        key: "CMC", name: "CMC Markets", tagline: "CFDs · Spread Betting",
        method: "soon",
        accent: "text-violet-300", border: "border-violet-500/20", bg: "bg-violet-500/5",
      },
    ],
  },
  {
    label: "Crypto",
    brokers: [
      {
        key: "Binance", name: "Binance", tagline: "Spot · Futures · Margin",
        method: "apikey", needsSecret: true,
        keyLabel: "API Key", secretLabel: "Secret Key",
        keyHelp: "Binance → Profile → API Management",
        keyHelpUrl: "https://www.binance.com/en/my/settings/api-management",
        accent: "text-yellow-300", border: "border-yellow-500/40", bg: "bg-yellow-500/8",
      },
      {
        key: "Kraken", name: "Kraken", tagline: "Spot · Futures · Margin",
        method: "apikey", needsSecret: true,
        keyLabel: "API Key", secretLabel: "Private Key",
        keyHelp: "Kraken → Settings → API",
        keyHelpUrl: "https://www.kraken.com/u/security/api",
        accent: "text-indigo-300", border: "border-indigo-500/40", bg: "bg-indigo-500/8",
      },
      {
        key: "Coinbase", name: "Coinbase", tagline: "Spot · Advanced Trade",
        method: "soon",
        accent: "text-blue-300", border: "border-blue-500/20", bg: "bg-blue-500/5",
      },
      {
        key: "Bybit", name: "Bybit", tagline: "Spot · Derivatives",
        method: "soon",
        accent: "text-orange-300", border: "border-orange-500/20", bg: "bg-orange-500/5",
      },
      {
        key: "OKX", name: "OKX", tagline: "Spot · Futures · Options",
        method: "soon",
        accent: "text-slate-300", border: "border-slate-500/20", bg: "bg-slate-500/5",
      },
      {
        key: "Gemini", name: "Gemini", tagline: "Regulated Crypto Exchange",
        method: "soon",
        accent: "text-blue-300", border: "border-blue-500/20", bg: "bg-blue-500/5",
      },
    ],
  },
];

// ── Modal steps ────────────────────────────────────────────────────────────────

type Step = "pick" | "oauth-env" | "apikey-form" | "authorising" | "error";

type OAuthMessage =
  | { type: "broker-oauth-success"; connection: PersistedBrokerConnection }
  | { type: "broker-oauth-error"; error: string };

// ── Component ──────────────────────────────────────────────────────────────────

export function BrokerSelectModal({ onClose, onConnected }: Props) {
  const [selected, setSelected] = useState<BrokerDef | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [environment, setEnvironment] = useState<BrokerEnvironment>("demo");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const popupRef    = useRef<Window | null>(null);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
      popupRef.current?.close();
    };
  }, []);

  function reset() {
    if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
    popupRef.current?.close();
    setSelected(null);
    setStep("pick");
    setError(null);
    setApiKey("");
    setApiSecret("");
    setConnecting(false);
  }

  function pickBroker(broker: BrokerDef) {
    if (broker.method === "soon") return;
    setSelected(broker);
    setError(null);
    if (broker.method === "oauth") {
      setStep("oauth-env");
    } else {
      setStep("apikey-form");
    }
  }

  // ── OAuth flow ─────────────────────────────────────────────────────────────

  async function handleOAuth() {
    if (!selected) return;
    setStep("authorising");
    setError(null);

    let authUrl: string;
    try {
      const result = await startBrokerOAuthApi(selected.key as "Alpaca" | "OANDA", environment);
      authUrl = result.authUrl;
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Failed to start authorisation.");
      return;
    }

    const w = 600, h = 700;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(
      authUrl,
      "broker-oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`,
    );

    if (!popup) {
      setStep("error");
      setError("Popup was blocked. Allow popups for this site and try again.");
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

      if (data.type === "broker-oauth-success") {
        onConnected(data.connection);
        onClose();
      } else {
        setStep("error");
        setError(data.error ?? "Authorisation failed.");
      }
    };

    listenerRef.current = handleMessage;
    window.addEventListener("message", handleMessage);

    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        if (listenerRef.current) {
          window.removeEventListener("message", handleMessage);
          listenerRef.current = null;
          setStep("error");
          setError("Authorisation window was closed. Please try again.");
        }
      }
    }, 500);
  }

  // ── API key flow ───────────────────────────────────────────────────────────

  async function handleApiKeyConnect() {
    if (!selected || connecting) return;
    if (!apiKey.trim()) { setError(`${selected.keyLabel ?? "API Key"} is required.`); return; }
    if (selected.needsSecret && !apiSecret.trim()) { setError(`${selected.secretLabel ?? "Secret"} is required.`); return; }

    setConnecting(true);
    setError(null);

    try {
      const result = await createBrokerConnectionApi({
        provider: selected.key as "Binance" | "Kraken",
        environment,
        label: `${selected.name} Spot`,
        apiKey: apiKey.trim(),
        ...(selected.needsSecret ? { apiSecret: apiSecret.trim() } : {}),
      });
      onConnected(result.connection);
      onClose();
    } catch (err) {
      setConnecting(false);
      setError(err instanceof Error ? err.message : "Connection failed. Check your credentials.");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const headerTitle =
    step === "authorising" ? `Connecting ${selected?.name}…` :
    step === "oauth-env"   ? `Connect ${selected?.name}` :
    step === "apikey-form" ? `Connect ${selected?.name}` :
    step === "error"       ? "Connection failed" :
    "Connect a Broker";

  const modal = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
        onClick={step !== "authorising" && !connecting ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a broker"
        className="fixed left-1/2 top-1/2 z-[9999] w-full max-w-[520px] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[0.72rem] border border-white/10 bg-[#07111d] shadow-[0_24px_64px_rgba(0,0,0,0.8)]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#07111d] px-5 py-4">
          <div className="flex items-center gap-2">
            {step !== "pick" && step !== "authorising" && !connecting && (
              <button
                type="button"
                onClick={reset}
                aria-label="Back"
                className="mr-0.5 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/6 hover:text-white"
              >
                ←
              </button>
            )}
            <h2 className="text-[0.92rem] font-semibold text-white">{headerTitle}</h2>
          </div>
          {step !== "authorising" && !connecting && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/6 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        <div className="p-5">

          {/* ── Pick broker ──────────────────────────────────────────────── */}
          {step === "pick" && (
            <div className="space-y-5">
              <div className="flex items-start gap-2 rounded-[0.4rem] border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5">
                <span className="mt-0.5 shrink-0 text-[0.8rem]">🔒</span>
                <p className="text-[0.73rem] leading-relaxed text-emerald-200/80">
                  OAuth brokers take you to the broker&apos;s own login page — no keys needed. For exchanges, you generate read-only API keys in your account settings.
                </p>
              </div>

              {BROKERS_BY_CATEGORY.map((cat) => (
                <div key={cat.label}>
                  <p className="mb-2 text-[0.64rem] font-semibold uppercase tracking-widest text-slate-600">
                    {cat.label}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {cat.brokers.map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        disabled={b.method === "soon"}
                        onClick={() => pickBroker(b)}
                        className={`relative flex flex-col items-center gap-1.5 rounded-[0.48rem] border px-2.5 py-3 text-center transition ${
                          b.method === "soon"
                            ? "cursor-not-allowed border-white/5 bg-white/[0.015] opacity-35"
                            : `${b.border} ${b.bg} hover:brightness-125`
                        }`}
                      >
                        {/* Logo placeholder */}
                        <span className={`text-[1.1rem] font-bold leading-none ${b.accent}`}>
                          {b.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <p className={`text-[0.72rem] font-semibold leading-tight ${b.accent}`}>{b.name}</p>
                          <p className="mt-0.5 text-[0.58rem] text-slate-600 leading-tight">{b.tagline}</p>
                        </div>
                        {/* Method badge */}
                        {b.method !== "soon" && (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[0.52rem] font-medium ${
                            b.method === "oauth"
                              ? "border-emerald-500/25 text-emerald-500"
                              : "border-yellow-500/25 text-yellow-600"
                          }`}>
                            {b.method === "oauth" ? "OAuth" : "API Key"}
                          </span>
                        )}
                        {b.method === "soon" && (
                          <span className="absolute right-1 top-1 rounded-full border border-white/8 px-1.5 py-0.5 text-[0.5rem] text-slate-700">
                            Soon
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── OAuth env selection ───────────────────────────────────────── */}
          {step === "oauth-env" && selected?.method === "oauth" && (
            <div className="space-y-5">
              {selected.hasEnvChoice && (
                <div>
                  <p className="mb-2 text-[0.68rem] font-medium uppercase tracking-widest text-slate-500">
                    Account type
                  </p>
                  <div className="flex gap-2">
                    {(["demo", "live"] as const).map((env) => (
                      <button
                        key={env}
                        type="button"
                        onClick={() => setEnvironment(env)}
                        className={`flex-1 rounded-[0.4rem] border py-2.5 text-[0.8rem] font-medium transition ${
                          environment === env
                            ? `${selected.border} ${selected.bg} ${selected.accent}`
                            : "border-white/8 text-slate-500 hover:border-white/16 hover:text-slate-300"
                        }`}
                      >
                        {env === "demo" ? `🧪 ${selected.demoLabel ?? "Demo"}` : `⚡ ${selected.liveLabel ?? "Live"}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-[0.4rem] border border-white/6 bg-white/[0.02] px-3 py-3 space-y-1.5">
                <p className="text-[0.72rem] font-medium text-slate-300">What happens next</p>
                <ol className="space-y-1">
                  {[
                    `A secure window opens on ${selected.name}'s website.`,
                    `Sign in with your ${selected.name} account.`,
                    "Authorise Signalibrium to read your account.",
                    "Done — the window closes automatically.",
                  ].map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[0.7rem] text-slate-500">
                      <span className={`mt-0.5 shrink-0 text-[0.6rem] font-bold ${selected.accent}`}>{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <button
                type="button"
                onClick={() => void handleOAuth()}
                className={`w-full rounded-[0.44rem] border py-3 text-[0.88rem] font-semibold transition hover:brightness-110 ${selected.border} ${selected.accent}`}
              >
                Log in to {selected.name} →
              </button>

              <p className="text-center text-[0.66rem] text-slate-700">
                Your login is entered directly on {selected.name}&apos;s site — Signalibrium never sees it.
              </p>
            </div>
          )}

          {/* ── API key form ──────────────────────────────────────────────── */}
          {step === "apikey-form" && selected?.method === "apikey" && (
            <div className="space-y-4">
              {/* Step guide */}
              <div className="rounded-[0.4rem] border border-white/6 bg-white/[0.02] px-3 py-3 space-y-1.5">
                <p className="text-[0.72rem] font-medium text-slate-300">How to get your API keys</p>
                <ol className="space-y-1">
                  <li className="flex items-start gap-2 text-[0.7rem] text-slate-500">
                    <span className={`mt-0.5 shrink-0 text-[0.6rem] font-bold ${selected.accent}`}>1</span>
                    <span>
                      Go to{" "}
                      <a
                        href={selected.keyHelpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-300 underline underline-offset-2 hover:text-white"
                      >
                        {selected.keyHelp}
                      </a>
                    </span>
                  </li>
                  <li className="flex items-start gap-2 text-[0.7rem] text-slate-500">
                    <span className={`mt-0.5 shrink-0 text-[0.6rem] font-bold ${selected.accent}`}>2</span>
                    <span>Create a new API key with <strong className="text-slate-400">Read Only</strong> permissions.</span>
                  </li>
                  <li className="flex items-start gap-2 text-[0.7rem] text-slate-500">
                    <span className={`mt-0.5 shrink-0 text-[0.6rem] font-bold ${selected.accent}`}>3</span>
                    <span>Paste both values below and click Connect.</span>
                  </li>
                </ol>
              </div>

              {/* API Key input */}
              <div>
                <label htmlFor="broker-apiKey" className="mb-1.5 block text-[0.68rem] font-medium uppercase tracking-widest text-slate-500">
                  {selected.keyLabel ?? "API Key"}
                </label>
                <input
                  id="broker-apiKey"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={`Paste your ${selected.keyLabel?.toLowerCase() ?? "API key"}…`}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setError(null); }}
                  className="w-full rounded-[0.38rem] border border-white/10 bg-[#0a1826] px-3 py-2.5 text-[0.84rem] text-slate-100 placeholder-slate-700 outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
                />
              </div>

              {selected.needsSecret && (
                <div>
                  <label htmlFor="broker-apiSecret" className="mb-1.5 block text-[0.68rem] font-medium uppercase tracking-widest text-slate-500">
                    {selected.secretLabel ?? "Secret Key"}
                  </label>
                  <input
                    id="broker-apiSecret"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste your secret key…"
                    value={apiSecret}
                    onChange={(e) => { setApiSecret(e.target.value); setError(null); }}
                    className="w-full rounded-[0.38rem] border border-white/10 bg-[#0a1826] px-3 py-2.5 text-[0.84rem] text-slate-100 placeholder-slate-700 outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
                  />
                </div>
              )}

              <div className="flex items-start gap-2 rounded-[0.36rem] border border-emerald-500/12 bg-emerald-500/5 px-3 py-2">
                <span className="mt-0.5 shrink-0 text-[0.72rem]">🔒</span>
                <p className="text-[0.68rem] text-emerald-200/70">
                  Keys are stored encrypted and never displayed again. Use read-only keys for security.
                </p>
              </div>

              {error && (
                <div className="rounded-[0.36rem] border border-red-500/20 bg-red-500/8 px-3 py-2.5 text-[0.76rem] text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={connecting}
                onClick={() => void handleApiKeyConnect()}
                className={`w-full rounded-[0.44rem] border py-2.5 text-[0.84rem] font-semibold transition ${
                  connecting
                    ? "cursor-not-allowed border-white/6 text-slate-600"
                    : `${selected.border} ${selected.accent} hover:brightness-110`
                }`}
              >
                {connecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Verifying…
                  </span>
                ) : (
                  `Connect ${selected.name}`
                )}
              </button>
            </div>
          )}

          {/* ── Authorising (OAuth popup waiting) ────────────────────────── */}
          {step === "authorising" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className={`flex h-14 w-14 items-center justify-center rounded-full border-2 ${selected?.border ?? "border-white/10"}`}>
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-[0.88rem] font-medium text-slate-200">
                  Waiting for authorisation…
                </p>
                <p className="mt-1 text-[0.74rem] text-slate-500">
                  Complete the login in the {selected?.name} window.
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="mt-2 text-[0.72rem] text-slate-600 underline underline-offset-2 hover:text-slate-400"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {step === "error" && (
            <div className="space-y-4">
              <div className="rounded-[0.44rem] border border-red-500/20 bg-red-500/8 px-4 py-3.5">
                <p className="text-[0.8rem] font-medium text-red-300">Connection failed</p>
                <p className="mt-1 text-[0.74rem] text-red-300/70">{error}</p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="w-full rounded-[0.38rem] border border-white/10 py-2.5 text-[0.82rem] text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Try again
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
