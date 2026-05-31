"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="2.5" width="6" height="6" rx="1.2" />
        <rect x="11.5" y="2.5" width="6" height="6" rx="1.2" />
        <rect x="2.5" y="11.5" width="6" height="6" rx="1.2" />
        <rect x="11.5" y="11.5" width="6" height="6" rx="1.2" />
      </svg>
    ),
  },
  {
    href: "/scanner",
    label: "Scanner",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8.5" cy="8.5" r="4.5" />
        <path d="m12 12 5 5" />
      </svg>
    ),
  },
  {
    href: "/assets",
    label: "Assets",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 15.5h14" />
        <path d="M5.5 13V8.5" />
        <path d="M10 13V5.5" />
        <path d="M14.5 13v-3" />
      </svg>
    ),
  },
  {
    href: "/strategy-lab",
    label: "Strategy Lab",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 15.5h12" />
        <path d="M6 15.5V7l4-3 4 3v8.5" />
      </svg>
    ),
  },
  {
    href: "/backtesting-lab",
    label: "Backtesting Lab",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 13.5c1.5 0 2-7 3.5-7s2 10 3.5 10 2-12 3.5-12S15 11 17 11" />
      </svg>
    ),
  },
  {
    href: "/risk-lab",
    label: "Risk Lab",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 3 16 15H4L10 3Z" />
        <path d="M10 7.5v3.5" />
        <circle cx="10" cy="13.5" r=".8" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/trade-tickets",
    label: "Trade Tickets",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 7.5h14" />
        <path d="M6 4.5h8" />
        <path d="M5 7.5v8h10v-8" />
        <path d="m8 11 1.5 1.5L13 9" />
      </svg>
    ),
  },
  {
    href: "/journal",
    label: "Journal",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 3.5h8a2 2 0 0 1 2 2v11H7a2 2 0 0 0-2 2Z" />
        <path d="M5 3.5v13a2 2 0 0 1 2-2h8" />
        <path d="M8 7.5h4.5" />
        <path d="M8 10.5h4.5" />
      </svg>
    ),
  },
];

export function NavLinks({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className={`grid grid-cols-2 gap-[5px] sm:flex sm:overflow-x-auto sm:gap-[5px] sm:pb-1 lg:block lg:overflow-visible lg:pb-0 ${
        collapsed ? "lg:-mx-2 lg:space-y-[5px]" : "lg:-mx-3 lg:space-y-[5px]"
      }`}
    >
      {links.map((link) => {
        const isActive =
          pathname === link.href ||
          (link.href !== "/" && pathname.startsWith(link.href));

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-label={link.label}
            title={collapsed ? link.label : undefined}
            className={`group flex min-w-0 items-center gap-2 rounded-none px-2.5 py-2 text-[0.82rem] font-semibold transition sm:min-w-[126px] sm:shrink-0 sm:text-[0.86rem] lg:min-w-0 ${
              collapsed ? "lg:justify-center lg:px-0 lg:py-2.5" : "lg:px-3 lg:py-2.5"
            } ${
              isActive
                ? "bg-[linear-gradient(135deg,rgba(0,229,255,0.14),rgba(37,107,255,0.08),rgba(124,58,237,0.05))] text-white shadow-[inset_0_0_0_1px_rgba(0,229,255,0.05)]"
                : "bg-transparent text-slate-300 hover:bg-[linear-gradient(135deg,rgba(0,229,255,0.08),rgba(37,107,255,0.04),rgba(124,58,237,0.02))] hover:text-white"
            }`}
          >
            <span
              className={`flex shrink-0 items-center justify-center rounded-[0.34rem] transition ${
                collapsed ? "h-9 w-9" : "h-7.5 w-7.5"
              } ${
                isActive
                  ? "bg-cyan-400/10 text-cyan-200"
                  : "bg-white/[0.025] text-slate-400 group-hover:bg-cyan-400/8 group-hover:text-white"
              }`}
            >
              {link.icon as ReactNode}
            </span>
            <span
              className={`min-w-0 flex-1 truncate ${
                collapsed ? "lg:hidden" : ""
              }`}
            >
              {link.label}
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full transition ${
                collapsed ? "lg:hidden" : ""
              } ${
                isActive
                  ? "bg-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.7)]"
                  : "bg-slate-600 group-hover:bg-slate-400"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
