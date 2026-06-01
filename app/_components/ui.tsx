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
  BLOCKED: "border border-red-500/22 bg-red-500/10 text-red-100",
  FAIL: "border border-red-500/22 bg-red-500/10 text-red-100",
  "HIGH RISK": "border border-red-500/22 bg-red-500/10 text-red-100",
  PASS: "border border-emerald-400/18 bg-emerald-400/10 text-emerald-100",
  TRADEABLE: "border border-cyan-300/18 bg-cyan-400/10 text-cyan-100",
  WATCH: "border border-amber-300/20 bg-amber-400/10 text-amber-100",
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
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-1 lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-[52rem] space-y-2.5 pl-1 sm:pl-1.5">
        <p className="micro-label">{eyebrow}</p>
        <h1 className="text-[1.55rem] font-semibold leading-[1.08] tracking-tight text-white sm:text-[1.9rem] lg:text-[2.12rem]">
          {title}
        </h1>
        <p className="max-w-3xl text-[0.86rem] leading-[1.75rem] text-slate-300 sm:text-[0.9rem]">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0 self-start lg:mt-1">{action}</div> : null}
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
    <div className="min-w-0 space-y-1">
      <p className="micro-label">
        {tooltip ? <LabelWithTip label={label} tooltip={tooltip} /> : label}
      </p>
      <p className="text-[0.95rem] font-semibold leading-tight text-white sm:text-[1rem]">
        {value}
      </p>
      {detail ? <p className="text-[0.82rem] leading-5 text-slate-400">{detail}</p> : null}
    </div>
  );
}
