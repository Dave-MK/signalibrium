"use client";

import { useId } from "react";

export function HelpTip({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const tooltipId = useId();

  return (
    <span className={`group relative inline-flex items-center ${className}`}>
      <button
        type="button"
        aria-describedby={tooltipId}
        className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white/12 bg-white/3 text-[0.62rem] font-semibold text-slate-400 transition hover:border-[#00C884]/24 hover:text-[#00C884]/80 focus:border-[#00C884]/24 focus:text-[#00C884]/80 focus:outline-none"
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-56 -translate-x-1/2 rounded-[0.46rem] border border-white/10 bg-[#0b1422]/98 px-3 py-2 text-left text-[0.72rem] font-medium leading-5 text-slate-200 shadow-[0_18px_40px_rgba(0,0,0,0.34)] group-hover:block group-focus-within:block"
      >
        {content}
      </span>
    </span>
  );
}

export function LabelWithTip({
  label,
  tooltip,
  className = "",
}: {
  label: string;
  tooltip: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span>{label}</span>
      <HelpTip content={tooltip} />
    </span>
  );
}
