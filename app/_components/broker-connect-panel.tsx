"use client";

import { useState } from "react";
import { createBrokerConnectionApi } from "@/app/_lib/workspace-api";
import type { BrokerEnvironment, PersistedBrokerConnection } from "@/app/_lib/server/workspace-types";

type Props = {
  onClose: () => void;
  onConnected: (connection: PersistedBrokerConnection) => void;
};

type ProviderFormState = {
  environment: BrokerEnvironment;
  apiKey: string;
  apiSecret: string;
  label: string;
  loading: boolean;
  error: string | null;
  success: boolean;
};

function initialFormState(): ProviderFormState {
  return { environment: "demo", apiKey: "", apiSecret: "", label: "", loading: false, error: null, success: false };
}

const BROKER_CONFIGS = [
  {
    provider: "Alpaca" as const,
    name: "Alpaca",
    description: "US stocks, ETFs & crypto. Paper and live accounts.",
    color: "text-[#00C884]",
    borderColor: "border-[#00C884]/30",
    bgColor: "bg-[#00C884]/5",
    needsSecret: true,
    keyLabel: "API Key",
    secretLabel: "API Secret",
    helpText: "Find your API keys at alpaca.markets → API Keys.",
    comingSoon: false,
  },
  {
    provider: "OANDA" as const,
    name: "OANDA",
    description: "Forex & CFDs. Demo and live accounts.",
    color: "text-amber-300",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/5",
    needsSecret: false,
    keyLabel: "API Token",
    secretLabel: "",
    helpText: "Generate a token at OANDA → Manage API Access.",
    comingSoon: false,
  },
  {
    provider: "IBKR" as const,
    name: "Interactive Brokers",
    description: "Direct IBKR connection — coming soon.",
    color: "text-purple-300",
    borderColor: "border-purple-500/20",
    bgColor: "bg-purple-500/5",
    needsSecret: false,
    keyLabel: "",
    secretLabel: "",
    helpText: "",
    comingSoon: true,
  },
] as const;

export function BrokerConnectPanel({ onClose, onConnected }: Props) {
  const [forms, setForms] = useState<Record<string, ProviderFormState>>({
    Alpaca: initialFormState(),
    OANDA: initialFormState(),
    IBKR: initialFormState(),
  });

  function updateForm(provider: string, patch: Partial<ProviderFormState>) {
    setForms((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], ...patch },
    }));
  }

  async function handleConnect(provider: "Alpaca" | "OANDA") {
    const form = forms[provider];
    if (form.loading || form.success) return;

    if (!form.apiKey.trim()) {
      updateForm(provider, { error: "API key is required." });
      return;
    }

    if (provider === "Alpaca" && !form.apiSecret.trim()) {
      updateForm(provider, { error: "API secret is required for Alpaca." });
      return;
    }

    updateForm(provider, { loading: true, error: null });

    try {
      const config = BROKER_CONFIGS.find((c) => c.provider === provider)!;
      const defaultLabel = `${config.name} ${form.environment === "live" ? "Live" : "Demo"}`;

      const result = await createBrokerConnectionApi({
        provider,
        environment: form.environment,
        label: form.label.trim() || defaultLabel,
        apiKey: form.apiKey.trim(),
        ...(provider === "Alpaca" ? { apiSecret: form.apiSecret.trim() } : {}),
      });

      updateForm(provider, { loading: false, success: true, apiKey: "", apiSecret: "" });

      // Short delay so user sees the success state, then close
      setTimeout(() => {
        onConnected(result.connection);
        onClose();
      }, 1200);
    } catch (err) {
      updateForm(provider, {
        loading: false,
        error: err instanceof Error ? err.message : "Failed to connect. Check your credentials.",
      });
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a broker"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/8 bg-[#111210] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-[1rem] font-semibold text-white">Connect a Broker</h2>
            <p className="mt-0.5 text-[0.76rem] text-slate-400">
              Link your trading account to view live balance and P&L.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Security banner */}
        <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-[0.46rem] border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3">
          <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true">🔒</span>
          <p className="text-[0.76rem] leading-5 text-emerald-200">
            API keys are stored encrypted in your account and are never logged,
            displayed, or shared. They cannot be recovered — if lost, disconnect
            and reconnect with new keys.
          </p>
        </div>

        {/* Broker cards */}
        <div className="flex flex-col gap-3 p-4">
          {BROKER_CONFIGS.map((config) => {
            const form = forms[config.provider];

            if (config.comingSoon) {
              return (
                <div
                  key={config.provider}
                  className={`rounded-[0.56rem] border ${config.borderColor} ${config.bgColor} p-4 opacity-50`}
                >
                  <div className="flex items-center gap-2">
                    <p className={`text-[0.9rem] font-semibold ${config.color}`}>
                      {config.name}
                    </p>
                    <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[0.65rem] text-slate-500">
                      Coming soon
                    </span>
                  </div>
                  <p className="mt-1 text-[0.76rem] text-slate-500">{config.description}</p>
                </div>
              );
            }

            const provider = config.provider as "Alpaca" | "OANDA";

            return (
              <div
                key={config.provider}
                className={`rounded-[0.56rem] border ${config.borderColor} ${config.bgColor} p-4`}
              >
                <p className={`text-[0.9rem] font-semibold ${config.color}`}>{config.name}</p>
                <p className="mt-0.5 text-[0.76rem] text-slate-400">{config.description}</p>

                {form.success ? (
                  <div className="mt-3 flex items-center gap-2 text-emerald-400">
                    <span>✓</span>
                    <span className="text-[0.82rem] font-medium">Connected successfully</span>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {/* Environment toggle */}
                    <div>
                      <label className="text-[0.68rem] font-medium uppercase tracking-widest text-slate-500">
                        Environment
                      </label>
                      <div className="mt-1.5 flex gap-2">
                        {(["demo", "live"] as const).map((env) => (
                          <button
                            key={env}
                            type="button"
                            onClick={() => updateForm(provider, { environment: env })}
                            className={`rounded-[0.32rem] border px-3 py-1 text-[0.73rem] font-medium transition ${
                              form.environment === env
                                ? "border-white/20 bg-white/10 text-white"
                                : "border-white/6 text-slate-500 hover:border-white/12 hover:text-slate-300"
                            }`}
                          >
                            {env === "demo" ? "Demo / Paper" : "Live"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* API Key */}
                    <div>
                      <label
                        htmlFor={`${provider}-apiKey`}
                        className="text-[0.68rem] font-medium uppercase tracking-widest text-slate-500"
                      >
                        {config.keyLabel}
                      </label>
                      <input
                        id={`${provider}-apiKey`}
                        type="password"
                        autoComplete="off"
                        placeholder={`Paste your ${config.keyLabel.toLowerCase()}…`}
                        value={form.apiKey}
                        onChange={(e) => updateForm(provider, { apiKey: e.target.value, error: null })}
                        className="mt-1.5 w-full rounded-[0.34rem] border border-white/10 bg-[#0a1320] px-3 py-2 text-[0.82rem] text-slate-100 placeholder-slate-600 outline-none focus:border-white/20"
                      />
                    </div>

                    {/* API Secret (Alpaca only) */}
                    {config.needsSecret && (
                      <div>
                        <label
                          htmlFor={`${provider}-apiSecret`}
                          className="text-[0.68rem] font-medium uppercase tracking-widest text-slate-500"
                        >
                          {config.secretLabel}
                        </label>
                        <input
                          id={`${provider}-apiSecret`}
                          type="password"
                          autoComplete="off"
                          placeholder="Paste your API secret…"
                          value={form.apiSecret}
                          onChange={(e) => updateForm(provider, { apiSecret: e.target.value, error: null })}
                          className="mt-1.5 w-full rounded-[0.34rem] border border-white/10 bg-[#0a1320] px-3 py-2 text-[0.82rem] text-slate-100 placeholder-slate-600 outline-none focus:border-white/20"
                        />
                      </div>
                    )}

                    {/* Help text */}
                    <p className="text-[0.7rem] text-slate-600">{config.helpText}</p>

                    {/* Error */}
                    {form.error && (
                      <p className="rounded-[0.3rem] border border-red-500/20 bg-red-500/8 px-3 py-2 text-[0.76rem] text-red-300">
                        {form.error}
                      </p>
                    )}

                    {/* Connect button */}
                    <button
                      type="button"
                      disabled={form.loading}
                      onClick={() => void handleConnect(provider)}
                      className={`w-full rounded-[0.38rem] border px-4 py-2 text-[0.82rem] font-semibold transition ${
                        form.loading
                          ? "cursor-not-allowed border-white/6 text-slate-600"
                          : `${config.borderColor} ${config.color} hover:bg-white/5`
                      }`}
                    >
                      {form.loading ? "Verifying…" : `Connect ${config.name}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
