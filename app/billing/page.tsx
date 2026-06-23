import { PageHeader, Panel } from "../_components/ui";

export default function BillingPage() {
  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Account"
        title="Plans & Billing"
        description="Signalibrium is currently in early access. Paid plans are coming soon — all features are available while we're in this phase."
      />

      <Panel className="p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              name: "Free",
              price: "£0 / mo",
              current: true,
              features: [
                "Live market signals",
                "Siggi paper trading",
                "Signal history",
                "Market dashboard",
                "AI chat with Siggi",
              ],
            },
            {
              name: "Pro",
              price: "£29 / mo",
              current: false,
              features: [
                "Everything in Free",
                "Priority signal alerts",
                "Advanced back-testing",
                "Custom watchlists",
                "Priority support",
              ],
            },
            {
              name: "Algo",
              price: "£79 / mo",
              current: false,
              features: [
                "Everything in Pro",
                "Signal webhook API",
                "HMAC-signed requests",
                "API key management",
                "Algo-grade latency",
              ],
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`rounded-[0.5rem] border p-4 ${
                plan.current
                  ? "border-[#00C884]/25 bg-[#00C884]/5"
                  : "border-white/8 bg-white/[0.02]"
              }`}
            >
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {plan.name}
              </p>
              <p className="mt-1 text-[1.4rem] font-bold text-white">{plan.price}</p>
              {plan.current && (
                <p className="mt-1 text-[0.70rem] font-semibold text-[#00C884]">Current plan</p>
              )}
              <ul className="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[0.78rem] text-slate-300">
                    <span className="mt-0.5 text-emerald-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {!plan.current && (
                <div className="mt-4 rounded-[0.4rem] border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[0.74rem] text-slate-500">
                  Coming soon
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[0.4rem] border border-amber-400/20 bg-amber-400/5 p-3.5">
          <p className="text-[0.80rem] font-semibold text-amber-200">Early access — all features unlocked</p>
          <p className="mt-1 text-[0.74rem] leading-5 text-slate-400">
            While Signalibrium is in early access, every feature is available on the free plan.
            Paid tiers will be introduced gradually — existing users will be grandfathered in at launch pricing.
            To express interest or ask about enterprise access, reach out directly.
          </p>
        </div>
      </Panel>
    </div>
  );
}
