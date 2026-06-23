import Link from "next/link";
import type { ReactNode } from "react";
import { LabelWithTip } from "./help-tip";

type PanelProps = {
  children: ReactNode;
  className?: string;
};

/* ── Status chip tone map ────────────────────────────────────────────────── */
const toneMap: Record<string, string> = {
  AMBIGUOUS:         "border border-amber-400/20 bg-amber-400/8  text-amber-200",
  BLOCKED:           "border border-red-500/22   bg-red-500/8    text-red-200",
  FAIL:              "border border-red-500/22   bg-red-500/8    text-red-200",
  "HIGH RISK":       "border border-red-500/22   bg-red-500/8    text-red-200",
  CANCELLED:         "border border-white/10     bg-white/[0.04] text-slate-300",
  CLOSED:            "border border-white/10     bg-white/[0.04] text-slate-300",
  "MARKET CLOSED":   "border border-amber-400/20 bg-amber-400/8  text-amber-200",
  "MARKET OPEN":     "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  DRAFT:             "border border-white/10     bg-white/[0.04] text-slate-300",
  FILLED:            "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  "IBKR DEMO":       "border border-sky-400/18   bg-sky-400/8    text-sky-200",
  "IBKR LIVE":       "border border-red-500/22   bg-red-500/8    text-red-200",
  "NOT SENT":        "border border-white/10     bg-white/[0.04] text-slate-300",
  PENDING:           "border border-amber-400/20 bg-amber-400/8  text-amber-200",
  PAPER:             "border border-sky-400/18   bg-sky-400/8    text-sky-200",
  READY:             "border border-sky-400/18   bg-sky-400/8    text-sky-200",
  REJECTED:          "border border-red-500/22   bg-red-500/8    text-red-200",
  SUBMITTED:         "border border-amber-400/20 bg-amber-400/8  text-amber-200",
  WORKING:           "border border-sky-400/18   bg-sky-400/8    text-sky-200",
  PASS:              "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  "PARTIALLY CLOSED":"border border-violet-400/20 bg-violet-400/8 text-violet-200",
  "24/7":            "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  TRADEABLE:         "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  WATCH:             "border border-amber-400/20 bg-amber-400/8  text-amber-200",
  WEEKEND:           "border border-white/10     bg-white/[0.04] text-slate-400",
  WARN:              "border border-amber-400/20 bg-amber-400/8  text-amber-200",
  "RISK-ON":         "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  "RISK-OFF":        "border border-red-400/22   bg-red-400/8    text-red-200",
  BACKTESTED:        "border border-sky-400/18   bg-sky-400/8    text-sky-200",
  BUY:               "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  "BUY NOW":         "border border-emerald-400/28 bg-emerald-400/12 text-emerald-100 font-bold",
  LONG:              "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  SELL:              "border border-red-400/22   bg-red-400/8    text-red-200",
  "SELL NOW":        "border border-red-400/28   bg-red-400/12   text-red-100 font-bold",
  SHORT:             "border border-red-400/22   bg-red-400/8    text-red-200",
  WAIT:              "border border-amber-400/20 bg-amber-400/8  text-amber-200",
  WIN:               "border border-emerald-400/22 bg-emerald-400/8 text-emerald-200",
  LOSS:              "border border-red-400/22   bg-red-400/8    text-red-200",
  BREAKEVEN:         "border border-white/14     bg-white/[0.05] text-slate-200",
  LIVE:              "border border-emerald-400/28 bg-emerald-400/10 text-emerald-200",
  "BOT LIVE":        "border border-emerald-400/28 bg-emerald-400/10 text-emerald-200",
};

/* ── Panel ───────────────────────────────────────────────────────────────── */
export function Panel({ children, className = "" }: PanelProps) {
  return (
    <section className={`panel panel-hover relative ${className}`}>
      {children}
    </section>
  );
}

/* ── PageHeader ──────────────────────────────────────────────────────────── */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-1 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-[48rem] space-y-1.5 pl-0.5">
        {eyebrow && (
          <p className="text-[0.60rem] font-semibold uppercase tracking-[0.18em] text-[#00C884]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[1.3rem] font-bold leading-[1.1] tracking-tight text-white sm:text-[1.55rem] lg:text-[1.75rem]">
          {title}
        </h1>
        <p className="max-w-2xl text-[0.80rem] leading-[1.6] text-[#A6B0AC] sm:text-[0.84rem]">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0 self-start lg:mt-1">{action}</div>}
    </div>
  );
}

/* ── MetricCard ──────────────────────────────────────────────────────────── */
const accentMap = {
  cyan:    "from-[#00C884]/15 to-transparent",
  success: "from-[#00C884]/15 to-transparent",
  danger:  "from-red-400/14 to-transparent",
  gold:    "from-amber-300/12 to-transparent",
  violet:  "from-violet-400/12 to-transparent",
};

export function MetricCard({
  label,
  value,
  detail,
  accent = "cyan",
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "cyan" | "violet" | "gold" | "success" | "danger";
}) {
  return (
    <Panel className="overflow-hidden p-3.5 sm:p-4">
      <div className={`absolute inset-x-0 top-0 h-14 bg-gradient-to-b ${accentMap[accent]}`} />
      <div className="relative space-y-2">
        <p className="micro-label">{label}</p>
        <p className="text-[1.35rem] font-bold tracking-tight text-white sm:text-[1.55rem]">
          {value}
        </p>
        <p className="text-[0.82rem] leading-[1.5] text-[#A6B0AC]">{detail}</p>
      </div>
    </Panel>
  );
}

/* ── StatusChip ──────────────────────────────────────────────────────────── */
export function StatusChip({ label }: { label: string }) {
  const tone =
    toneMap[label] ??
    toneMap[label.toUpperCase()] ??
    "border border-white/10 bg-white/[0.04] text-slate-300";

  return (
    <span
      className={`inline-flex items-center rounded-[0.38rem] px-2.5 py-[0.28rem] text-[0.64rem] font-semibold leading-none tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

/* ── ActionLink ──────────────────────────────────────────────────────────── */
export function ActionLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[0.5rem] px-3.5 py-2 text-[0.82rem] font-semibold transition-all ${
        variant === "primary"
          ? "signal-button"
          : "border border-white/10 bg-white/[0.04] text-white hover:border-white/16 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </Link>
  );
}

/* ── SummaryCard ─────────────────────────────────────────────────────────── */
export function SummaryCard({
  label,
  value,
  detail,
  tone = "text-white",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.65rem] p-3.5">
      <p className="micro-label">{label}</p>
      <p className={`mt-2 text-[0.96rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[0.76rem] leading-[1.5] text-[#A6B0AC]">{detail}</p>
    </div>
  );
}

/* ── KeyValue ────────────────────────────────────────────────────────────── */
export function KeyValue({
  label,
  value,
  detail,
  tooltip,
}: {
  label: string;
  value: string;
  detail?: string;
  tooltip?: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="micro-label">
        {tooltip ? <LabelWithTip label={label} tooltip={tooltip} /> : label}
      </p>
      <p className="text-[0.88rem] font-semibold leading-tight text-white sm:text-[0.94rem]">
        {value}
      </p>
      {detail && <p className="text-[0.76rem] leading-[1.5] text-[#A6B0AC]">{detail}</p>}
    </div>
  );
}

/* ── KpiStrip card — used in page-level KPI rows ────────────────────────── */
export function KpiCard({
  label,
  value,
  sub,
  tone = "text-white",
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[0.65rem] border p-3 sm:p-3.5 ${
        accent
          ? "border-[#00C884]/20 bg-[#00C884]/[0.06]"
          : "border-white/[0.06] bg-[#111210]"
      }`}
    >
      <p className="micro-label">{label}</p>
      <p className={`mt-1.5 text-[1.1rem] font-bold tracking-tight sm:text-[1.25rem] ${tone}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[0.68rem] text-[#4B5A6B]">{sub}</p>}
    </div>
  );
}
