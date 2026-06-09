"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const coreLinks: NavItem[] = [
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
    href: "/my-trades",
    label: "My Trades",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="5" width="14" height="11" rx="1.3" />
        <path d="M7 5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V5" />
        <path d="M7 10h6" />
        <path d="M7 13h4" />
      </svg>
    ),
  },
];

const analyseLinks: NavItem[] = [
  {
    href: "/history",
    label: "Signal History",
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
    href: "/strategy-performance",
    label: "Strategy Stats",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 14.5 7 9l3 3 3.5-5 3.5 3" />
        <path d="M16 5.5h-3.5V9" />
        <path d="M3 17h14" />
      </svg>
    ),
  },
  {
    href: "/backtesting-lab",
    label: "Backtest Lab",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 16h14" />
        <path d="M5 16V9" />
        <path d="M9.5 16V5" />
        <path d="M14 16V11" />
        <circle cx="5" cy="7" r="1.5" />
        <circle cx="9.5" cy="3.5" r="1.5" />
        <circle cx="14" cy="9" r="1.5" />
        <path d="M5 7 9.5 3.5 14 9" />
      </svg>
    ),
  },
];

const toolLinks: NavItem[] = [
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
    href: "/journal",
    label: "Journal",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="2.5" width="12" height="15" rx="1.3" />
        <path d="M7 7h6" />
        <path d="M7 10h6" />
        <path d="M7 13h3.5" />
      </svg>
    ),
  },
  {
    href: "/alerts",
    label: "Alerts",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 2.5A5.5 5.5 0 0 0 4.5 8v3l-1.5 2h14l-1.5-2V8A5.5 5.5 0 0 0 10 2.5Z" />
        <path d="M8.5 15.5a1.5 1.5 0 0 0 3 0" />
        <path d="M10 2.5V1" />
      </svg>
    ),
  },
];

const devLinks: NavItem[] = [
  {
    href: "/api-access",
    label: "API Access",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M7.5 7 4 10l3.5 3" />
        <path d="M12.5 7 16 10l-3.5 3" />
        <path d="M11 5.5 9 14.5" />
      </svg>
    ),
  },
];

function NavLink({
  item,
  collapsed,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
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
        {item.icon as ReactNode}
      </span>
      <span className={`min-w-0 flex-1 truncate ${collapsed ? "lg:hidden" : ""}`}>
        {item.label}
      </span>
      <span
        className={`h-1.5 w-1.5 rounded-full transition ${collapsed ? "lg:hidden" : ""} ${
          isActive
            ? "bg-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.7)]"
            : "bg-slate-600 group-hover:bg-slate-400"
        }`}
      />
    </Link>
  );
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="my-1.5 hidden lg:flex lg:justify-center">
        <div className="h-px w-5 bg-white/[0.08]" />
      </div>
    );
  }
  return (
    <p className="hidden lg:block mt-3 mb-1 px-3 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-slate-700">
      {label}
    </p>
  );
}

export function NavLinks({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <nav
      className={`grid grid-cols-2 gap-1.25 sm:flex sm:overflow-x-auto sm:gap-1.25 sm:pb-1 lg:block lg:overflow-visible lg:pb-0 ${
        collapsed ? "lg:-mx-2 lg:space-y-0" : "lg:-mx-3 lg:space-y-0"
      }`}
    >
      {/* ── Core ── */}
      {coreLinks.map((link) => (
        <NavLink key={link.href} item={link} collapsed={collapsed} isActive={isActive(link.href)} />
      ))}

      {/* ── Analyse ── */}
      <SectionLabel label="Analyse" collapsed={collapsed} />
      {analyseLinks.map((link) => (
        <NavLink key={link.href} item={link} collapsed={collapsed} isActive={isActive(link.href)} />
      ))}

      {/* ── Tools ── */}
      <SectionLabel label="Tools" collapsed={collapsed} />
      {toolLinks.map((link) => (
        <NavLink key={link.href} item={link} collapsed={collapsed} isActive={isActive(link.href)} />
      ))}

      {/* ── Dev — quieter treatment ── */}
      <div className={`hidden lg:block ${collapsed ? "mt-1" : "mt-3 border-t border-white/[0.05] pt-2"}`}>
        {devLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-label={link.label}
            title={collapsed ? link.label : undefined}
            className={`group flex min-w-0 items-center gap-2 rounded-none py-1.5 text-[0.74rem] font-medium transition ${
              collapsed ? "justify-center px-0" : "px-3"
            } ${
              isActive(link.href)
                ? "text-slate-300"
                : "text-slate-600 hover:text-slate-400"
            }`}
          >
            <span className={`flex shrink-0 items-center justify-center ${collapsed ? "h-9 w-9" : "h-6 w-6"} text-slate-600 group-hover:text-slate-400 transition`}>
              {link.icon as ReactNode}
            </span>
            {!collapsed && <span className="truncate">{link.label}</span>}
          </Link>
        ))}
      </div>

      {/* Mobile-only: show API Access as regular nav item */}
      <div className="sm:flex lg:hidden">
        {devLinks.map((link) => (
          <NavLink key={link.href} item={link} collapsed={false} isActive={isActive(link.href)} />
        ))}
      </div>
    </nav>
  );
}
