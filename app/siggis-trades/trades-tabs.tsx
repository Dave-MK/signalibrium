"use client";

import { useState, type ReactNode } from "react";

type Tab = "open" | "closed" | "analytics";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: "open",
    label: "Open",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8" cy="8" r="3" />
        <circle cx="8" cy="8" r="6" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: "closed",
    label: "Closed",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 8h10" />
        <path d="M9 4l4 4-4 4" />
      </svg>
    ),
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M2 12 5.5 7 8 9.5 11 5 14 7.5" />
        <path d="M2 14h12" />
      </svg>
    ),
  },
];

export function TradesTabs({
  openCount,
  closedCount,
  openContent,
  closedContent,
  analyticsContent,
}: {
  openCount: number;
  closedCount: number;
  openContent: ReactNode;
  closedContent: ReactNode;
  analyticsContent: ReactNode;
}) {
  const [active, setActive] = useState<Tab>("open");

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-[5px] flex items-center gap-1 rounded-[0.5rem] bg-white/[0.025] p-1 ring-1 ring-white/[0.06]">
        {TABS.map((tab) => {
          const count = tab.id === "open" ? openCount : tab.id === "closed" ? closedCount : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[0.38rem] px-3 py-2 text-[0.80rem] font-semibold transition ${
                active === tab.id
                  ? "bg-[linear-gradient(135deg,rgba(0,200,132,0.14),rgba(37,107,255,0.08))] text-white shadow-[inset_0_0_0_1px_rgba(0,200,132,0.08)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className={active === tab.id ? "text-[#00C884]" : "text-slate-500"}>
                {tab.icon}
              </span>
              {tab.label}
              {count !== null && (
                <span
                  className={`min-w-[1.25rem] rounded-full px-1 py-0.5 text-center text-[0.60rem] font-bold leading-none ${
                    active === tab.id
                      ? count > 0
                        ? "bg-[#00C884]/20 text-[#00C884]/80"
                        : "bg-white/[0.06] text-slate-500"
                      : "bg-white/[0.04] text-slate-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="space-y-[5px]">
        {active === "open" && openContent}
        {active === "closed" && closedContent}
        {active === "analytics" && analyticsContent}
      </div>
    </div>
  );
}
