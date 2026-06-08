"use client";

import { useState, useTransition } from "react";
import { Panel, StatusChip } from "@/app/_components/ui";

type Props = {
  initialApiKey: string | null;
  isAlgo: boolean;
  appUrl: string;
};

// ── Code examples ─────────────────────────────────────────────────────────────

function pythonExample(appUrl: string) {
  return `import hashlib, hmac, time, requests

API_KEY = "sk_sig_your_key_here"
BASE_URL = "${appUrl}"

def get_signals():
    ts = str(int(time.time()))
    message = f"{ts}:GET:/api/signals"
    sig = hmac.new(API_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()

    resp = requests.get(
        f"{BASE_URL}/api/signals",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "x-timestamp": ts,
            "x-signature": sig,
        },
    )
    return resp.json()

data = get_signals()
print(data["activeSignals"])   # list of ENTER NOW signals
print(data["openTrades"])      # Siggi's open positions`;
}

function jsExample(appUrl: string) {
  return `async function getSignals(apiKey) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const message = \`\${ts}:GET:/api/signals\`;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(apiKey),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBytes = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(message)
  );
  const sig = Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const res = await fetch("${appUrl}/api/signals", {
    headers: {
      "Authorization": \`Bearer \${apiKey}\`,
      "x-timestamp": ts,
      "x-signature": sig,
    },
  });
  return res.json();
}

const data = await getSignals("sk_sig_your_key_here");
console.log(data.activeSignals);  // ENTER NOW signals
console.log(data.openTrades);     // Siggi's live positions`;
}

function responseShape() {
  return `{
  "activeSignals": [
    {
      "id": "pred_...",
      "symbol": "BTC/USD",
      "instrumentName": "Bitcoin",
      "assetClass": "Crypto",
      "action": "BUY",
      "decision": "ENTER NOW",
      "confidence": 81,
      "horizon": "Day",
      "entryLow": 67200,
      "entryHigh": 67800,
      "stop": 65900,
      "target": 71500,
      "calledAt": "2025-06-08T09:14:00Z"
    }
  ],
  "openTrades": [
    {
      "id": "trade_...",
      "symbol": "BTC/USD",
      "side": "BUY",
      "status": "Open",
      "entryPrice": 67450,
      "stopPrice": 65900,
      "targetPrice": 71500,
      "stopMode": "Breakeven",
      "unrealizedPnlGbp": 142.30,
      "openedAt": "2025-06-08T09:15:00Z"
    }
  ],
  "syncedAt": "2025-06-08T10:00:00Z"
}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ApiAccessClient({ initialApiKey, isAlgo, appUrl }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(initialApiKey);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"python" | "javascript">("python");
  const [isPending, startTransition] = useTransition();

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 10)}${"•".repeat(24)}${apiKey.slice(-4)}`
    : null;

  async function enableAndGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/enable-api-access", { method: "POST" });
        const body = await res.json() as { ok?: boolean; apiKey?: string; error?: string };
        if (!body.ok || !body.apiKey) {
          setError(body.error ?? "Failed to enable API access.");
          return;
        }
        setApiKey(body.apiKey);
        setRevealed(true);
      } catch {
        setError("Network error — please try again.");
      }
    });
  }

  async function rotateKey() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/user/api-key", { method: "POST" });
        const body = await res.json() as { apiKey?: string; error?: string };
        if (!body.apiKey) {
          setError(body.error ?? "Failed to rotate key.");
          return;
        }
        setApiKey(body.apiKey);
        setRevealed(true);
      } catch {
        setError("Network error — please try again.");
      }
    });
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (id === "key") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopiedSnippet(id);
        setTimeout(() => setCopiedSnippet(null), 2000);
      }
    } catch {
      /* ignore */
    }
  }

  const snippet = activeTab === "python" ? pythonExample(appUrl) : jsExample(appUrl);
  const snippetWithKey = apiKey ? snippet.replace("sk_sig_your_key_here", apiKey) : snippet;

  return (
    <div className="space-y-[5px]">
      {/* ── Key management ──────────────────────────────────────────────────── */}
      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="micro-label">Your API key</p>
          {isAlgo && apiKey && (
            <StatusChip label="ACTIVE" />
          )}
        </div>

        {apiKey ? (
          <div className="space-y-3">
            {/* Key display */}
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-[0.4rem] border border-white/8 bg-white/[0.03] px-3 py-2.5 font-mono text-[0.78rem] text-cyan-200">
                {revealed ? apiKey : maskedKey}
              </code>
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="shrink-0 rounded-[0.35rem] border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[0.72rem] font-medium text-slate-400 transition hover:border-cyan-400/30 hover:text-white"
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
              {revealed && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(apiKey, "key")}
                  className="shrink-0 rounded-[0.35rem] border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[0.72rem] font-medium text-slate-400 transition hover:border-cyan-400/30 hover:text-white"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              )}
            </div>

            <p className="text-[0.70rem] leading-4 text-slate-600">
              Keep this key private — it grants read access to your live signals and open trades.
              Rotate it if it is ever exposed.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={rotateKey}
                disabled={isPending}
                className="rounded-[0.38rem] border border-amber-400/20 bg-amber-400/5 px-3 py-1.5 text-[0.74rem] font-semibold text-amber-300 transition hover:border-amber-400/40 hover:bg-amber-400/10 disabled:opacity-50"
              >
                {isPending ? "Rotating…" : "Rotate key"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[0.80rem] leading-5 text-slate-400">
              No API key generated yet. Click below to enable API access and generate your key.
            </p>
            <button
              type="button"
              onClick={enableAndGenerate}
              disabled={isPending}
              className="rounded-[0.4rem] bg-gradient-to-r from-cyan-500/20 to-violet-500/10 px-4 py-2 text-[0.82rem] font-semibold text-cyan-200 ring-1 ring-cyan-400/20 transition hover:from-cyan-500/30 hover:to-violet-500/20 disabled:opacity-50"
            >
              {isPending ? "Setting up…" : "Enable API access & generate key"}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-2 text-[0.72rem] text-red-300">{error}</p>
        )}
      </Panel>

      {/* ── Endpoint reference ───────────────────────────────────────────────── */}
      <Panel className="p-4">
        <p className="micro-label mb-3">Endpoint</p>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-[0.25rem] bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[0.70rem] font-bold text-emerald-300">
              GET
            </span>
            <code className="flex-1 overflow-x-auto font-mono text-[0.80rem] text-slate-200">
              {appUrl}/api/signals
            </code>
          </div>

          <div>
            <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600">
              Required headers
            </p>
            <div className="space-y-1 rounded-[0.4rem] border border-white/6 bg-white/[0.02] p-2.5">
              {[
                ["Authorization", "Bearer <your-api-key>"],
                ["x-timestamp", "Unix timestamp (seconds) — must be within ±5 min of server time"],
                ["x-signature", "HMAC-SHA256 of  <timestamp>:GET:/api/signals  signed with your key"],
              ].map(([header, desc]) => (
                <div key={header} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <code className="shrink-0 font-mono text-[0.72rem] text-cyan-300">{header}</code>
                  <span className="text-[0.68rem] text-slate-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600">
              What you get back
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-[0.4rem] border border-white/6 bg-[#060e18] p-3 font-mono text-[0.70rem] leading-5 text-slate-300">
                {responseShape()}
              </pre>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Code examples ────────────────────────────────────────────────────── */}
      <Panel className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.02] px-4 py-2.5">
          <p className="micro-label">Code examples</p>
          <div className="flex gap-1">
            {(["python", "javascript"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-[0.3rem] px-2.5 py-1 text-[0.70rem] font-semibold transition capitalize ${
                  activeTab === tab
                    ? "bg-cyan-400/10 text-cyan-200"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab === "python" ? "Python" : "JavaScript"}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <pre className="overflow-x-auto bg-[#060e18] p-4 font-mono text-[0.72rem] leading-[1.65] text-slate-300">
            {snippetWithKey}
          </pre>
          <button
            type="button"
            onClick={() => copyToClipboard(snippetWithKey, activeTab)}
            className="absolute right-3 top-3 rounded-[0.3rem] border border-white/10 bg-[#0a1525] px-2 py-1 text-[0.65rem] font-medium text-slate-500 transition hover:border-cyan-400/25 hover:text-cyan-300"
          >
            {copiedSnippet === activeTab ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </Panel>

      {/* ── Security notes ───────────────────────────────────────────────────── */}
      <Panel className="px-4 py-3">
        <p className="micro-label mb-2">Security notes</p>
        <ul className="space-y-1.5">
          {[
            "The HMAC signature prevents replay attacks — the timestamp window is ±5 minutes.",
            "Your API key is stored encrypted in Clerk's private user metadata, never in the database.",
            "The endpoint returns read-only data — no write access is exposed.",
            "Rotating your key immediately invalidates the old one with no downtime.",
          ].map((note) => (
            <li key={note} className="flex items-start gap-2 text-[0.72rem] leading-4 text-slate-500">
              <span className="mt-0.5 shrink-0 text-slate-600">·</span>
              {note}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
