"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  {
    href: "/",
    label: "Overview",
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
    label: "Opportunities",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8.5" cy="8.5" r="4.5" />
        <path d="m12 12 5 5" />
      </svg>
    ),
  },
  {
    href: "/assets",
    label: "Charts",
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
    href: "/strategies",
    label: "Strategies",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 15.5V5.25A1.25 1.25 0 0 1 5.25 4h9.5A1.25 1.25 0 0 1 16 5.25v9.5A1.25 1.25 0 0 1 14.75 16H5.25A1.25 1.25 0 0 1 4 14.75" />
        <path d="M7 7h6" />
        <path d="M7 10h4" />
        <path d="m7 13 1.25 1.25L13 9.5" />
      </svg>
    ),
  },
  {
    href: "/siggis-trades",
    label: "Siggi's Trades",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 13.5 8 9.5l2.5 2.5L16 6.5" />
        <path d="M13.5 6.5H16v2.5" />
        <path d="M3 16.5h14" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3.5 4.5v11" />
        <path d="M8.25 8v7.5" />
        <path d="M13 6v9.5" />
        <path d="M17 10v5.5" />
      </svg>
    ),
  },
  {
    href: "/billing",
    label: "Billing",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="5.5" width="15" height="9" rx="1.5" />
        <path d="M2.5 8.5h15" />
        <path d="M6 12.5h2.5" />
      </svg>
    ),
  },
];

export function NavLinks({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className={`grid grid-cols-2 gap-1.25 sm:flex sm:overflow-x-auto sm:gap-1.25 sm:pb-1 lg:block lg:overflow-visible lg:pb-0 ${
        collapsed ? "lg:-mx-2 lg:space-y-1.25" : "lg:-mx-3 lg:space-y-1.25"
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
            className={`group flex min-w-0 items-center gap-2 rounded-none px-2.5 py-2 text-[0.82rem] font-semibold transition sm:min-w-31.5 sm:shrink-0 sm:text-[0.86rem] lg:min-w-0 ${
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
                  : "bg-white/2.5 text-slate-400 group-hover:bg-cyan-400/8 group-hover:text-white"
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
