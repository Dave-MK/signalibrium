import Link from "next/link";
import type { ReactNode } from "react";
import { LabelWithTip } from "./help-tip";

type PanelProps = {
  children: ReactNode;
  className?: string;
};

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  accent?: "cyan" | "violet" | "gold" | "success" | "danger";
};

const toneMap = {
  AMBIGUOUS: "border border-amber-200/22 bg-amber-300/10 text-amber-100",
  BLOCKED: "border border-red-500/22 bg-red-500/10 text-red-100",
  FAIL: "border border-red-500/22 bg-red-500/10 text-red-100",
  "HIGH RISK": "border border-red-500/22 bg-red-500/10 text-red-100",
  CANCELLED: "border border-slate-400/18 bg-slate-400/10 text-slate-100",
  CLOSED: "border border-slate-400/18 bg-slate-400/10 text-slate-100",
  "MARKET CLOSED": "border border-amber-300/20 bg-amber-400/10 text-amber-100",
  "MARKET OPEN": "border border-emerald-400/18 bg-emerald-400/10 text-emerald-100",
  DRAFT: "border border-slate-400/18 bg-slate-400/10 text-slate-100",
  FILLED: "border border-emerald-400/18 bg-emerald-400/10 text-emerald-100",
  "IBKR DEMO": "border border-cyan-300/18 bg-cyan-400/10 text-cyan-100",
  "IBKR LIVE": "border border-red-500/22 bg-red-500/10 text-red-100",
  "NOT SENT": "border border-slate-400/18 bg-slate-400/10 text-slate-100",
  PENDING: "border border-amber-300/20 bg-amber-400/10 text-amber-100",
  PAPER: "border border-blue-400/20 bg-blue-500/10 text-blue-100",
  READY: "border border-blue-400/20 bg-blue-500/10 text-blue-100",
  REJECTED: "border border-red-500/22 bg-red-500/10 text-red-100",
  SUBMITTED: "border border-amber-300/20 bg-amber-400/10 text-amber-100",
  WORKING: "border border-cyan-300/18 bg-cyan-400/10 text-cyan-100",
  PASS: "border border-emerald-400/18 bg-emerald-400/10 text-emerald-100",
  "PARTIALLY CLOSED": "border border-violet-300/20 bg-violet-400/10 text-violet-100",
  "24/7": "border border-emerald-400/18 bg-emerald-400/10 text-emerald-100",
  TRADEABLE: "border border-cyan-300/18 bg-cyan-400/10 text-cyan-100",
  WATCH: "border border-amber-300/20 bg-amber-400/10 text-amber-100",
  WEEKEND: "border border-slate-400/18 bg-slate-400/10 text-slate-100",
  WARN: "border border-amber-300/20 bg-amber-400/10 text-amber-100",
  "RISK-ON": "border border-cyan-300/18 bg-cyan-400/10 text-cyan-100",
  "RISK-OFF": "border border-violet-300/20 bg-violet-400/10 text-violet-100",
  BACKTESTED: "border border-blue-400/20 bg-blue-500/10 text-blue-100",
};

const accentMap = {
  cyan: "from-cyan-300/20 via-cyan-400/0 to-transparent",
  danger: "from-red-400/20 via-red-400/0 to-transparent",
  gold: "from-amber-300/20 via-amber-300/0 to-transparent",
  success: "from-emerald-300/20 via-emerald-300/0 to-transparent",
  violet: "from-violet-300/20 via-violet-300/0 to-transparent",
};

export function Panel({ children, className = "" }: PanelProps) {
  return <section className={`panel panel-hover relative ${className}`}>{children}</section>;
}

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
    <div className="flex flex-col gap-1 py-0.5 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-[44rem] space-y-1 pl-1 sm:pl-1.5">
        {eyebrow ? <p className="micro-label">{eyebrow}</p> : null}
        <h1 className="text-[1.2rem] font-semibold leading-[1.08] tracking-tight text-white sm:text-[1.42rem] lg:text-[1.56rem]">
          {title}
        </h1>
        <p className="max-w-2xl text-[0.78rem] leading-5 text-slate-400 sm:text-[0.82rem]">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0 self-start lg:mt-0.5">{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  accent = "cyan",
}: MetricCardProps) {
  return (
    <Panel className="overflow-hidden p-3 sm:p-3.5">
      <div
        className={`absolute inset-x-0 top-0 h-16 bg-gradient-to-r ${accentMap[accent]}`}
      />
      <div className="relative space-y-2.5">
        <p className="micro-label">{label}</p>
        <p className="text-[1.35rem] font-semibold tracking-tight text-white sm:text-[1.55rem]">
          {value}
        </p>
        <p className="text-[0.84rem] leading-[1.45rem] text-slate-300">{detail}</p>
      </div>
    </Panel>
  );
}

export function StatusChip({ label }: { label: string }) {
  const tone =
    toneMap[label as keyof typeof toneMap] ??
    "border border-white/10 bg-white/[0.04] text-slate-100";

  return (
    <span className={`inline-flex rounded-[0.4rem] px-2.5 py-[0.3rem] text-[0.67rem] font-semibold leading-none ${tone}`}>
      {label}
    </span>
  );
}

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
      className={`inline-flex items-center justify-center rounded-[0.46rem] px-3 py-1.75 text-[0.8rem] font-semibold transition ${
        variant === "primary"
          ? "signal-button"
          : "signal-surface-soft text-white hover:border-cyan-300/24 hover:bg-white/[0.04]"
      }`}
    >
      {children}
    </Link>
  );
}

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
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <p className="micro-label">{label}</p>
      <p className={`mt-1.5 text-[0.96rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[0.76rem] leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

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
      {detail ? <p className="text-[0.76rem] leading-5 text-slate-400">{detail}</p> : null}
    </div>
  );
}
