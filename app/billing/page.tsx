"use client";

import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

type Tier = "free" | "pro" | "algo";

const PLANS: Array<{
  tier: Tier;
  name: string;
  price: string;
  features: string[];
  cta: string;
}> = [
  {
    tier: "free",
    name: "Free",
    price: "£0 / mo",
    features: ["View live signals", "Signal history (last 30 days)", "Market dashboard"],
    cta: "Current plan",
  },
  {
    tier: "pro",
    name: "Pro",
    price: "£29 / mo",
    features: [
      "Everything in Free",
      "Full signal history",
      "Siggi paper trading",
      "Live sync & auto-analysis",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
  },
  {
    tier: "algo",
    name: "Algo",
    price: "£79 / mo",
    features: [
      "Everything in Pro",
      "Signal webhook API",
      "HMAC-signed requests",
      "API key management",
      "Algo-grade latency",
    ],
    cta: "Upgrade to Algo",
  },
];

function BillingContent() {
  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<Tier | null>(null);
  const success = searchParams.get("success") === "true";
  const cancelled = searchParams.get("cancelled") === "true";

  async function handleUpgrade(tier: Tier) {
    if (tier === "free") return;
    setLoading(tier);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoading(null);
    }
  }

  if (!isSignedIn) {
    return (
      <div className="p-8 text-neutral-400">You must be signed in to manage billing.</div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-100">Billing & Plan</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Upgrade your plan to unlock more of Signalibrium.
        </p>
      </div>

      {success && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-emerald-300 text-sm">
          Payment successful — your plan has been upgraded.
        </div>
      )}

      {cancelled && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-amber-300 text-sm">
          Checkout cancelled — your plan was not changed.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.tier}
            className={`rounded-xl border p-6 space-y-5 ${
              plan.tier === "pro"
                ? "border-emerald-700 bg-emerald-950/20"
                : "border-neutral-800 bg-neutral-900/40"
            }`}
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
                {plan.name}
              </p>
              <p className="text-2xl font-bold text-neutral-100 mt-1">{plan.price}</p>
            </div>

            <ul className="space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="text-sm text-neutral-300 flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleUpgrade(plan.tier)}
              disabled={plan.tier === "free" || loading !== null}
              className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                plan.tier === "free"
                  ? "bg-neutral-800 text-neutral-500 cursor-default"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
              }`}
            >
              {loading === plan.tier ? "Redirecting…" : plan.cta}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-600">
        Payments processed securely by Stripe. Cancel any time from your billing portal.
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}
