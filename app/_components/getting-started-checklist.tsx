"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

// New keys — avoids inheriting the old "dismissed" state from the
// previous inline checklist that lived on the overview page.
const GONE_KEY    = "siggi.guide.gone";     // true = tab hidden permanently
const CHECKED_KEY = "siggi.guide.checked";
const OPEN_KEY    = "siggi.guide.open";

const PANEL_WIDTH = 304; // px — keep in sync with w-[304px] below

const STEPS = [
  {
    id: "market-read",
    icon: "📊",
    label: "Check today's market read",
    detail: "The overview shows whether the tape is bullish, bearish, or mixed — and what's driving it right now.",
    href: "/",
    pageLabel: "Overview",
  },
  {
    id: "scanner",
    icon: "🔍",
    label: "Browse the opportunity scanner",
    detail: "Every ranked setup across Crypto, Forex, Equities, and Commodities — sorted by edge and confidence.",
    href: "/scanner",
    pageLabel: "Opportunities",
  },
  {
    id: "analysis",
    icon: "📈",
    label: "Pull up a live chart",
    detail: "Open Charts and click any asset to see live price, EMAs, support/resistance, and Siggi's read.",
    href: "/assets",
    pageLabel: "Charts",
  },
  {
    id: "strategies",
    icon: "📋",
    label: "Review the strategies Siggi uses",
    detail: "Understand the playbook — which setups Siggi looks for and why they work in this market.",
    href: "/strategies",
    pageLabel: "Strategies",
  },
  {
    id: "siggi-trades",
    icon: "🤖",
    label: "Watch Siggi's live positions",
    detail: "Siggi trades his own capital using the same signals. Follow his open trades and track record.",
    href: "/siggis-trades",
    pageLabel: "Siggi's Trades",
  },
  {
    id: "history",
    icon: "📝",
    label: "Review past signal accuracy",
    detail: "Every enter-now call is tracked and its outcome recorded — no cherry-picking, ever.",
    href: "/history",
    pageLabel: "History",
  },
  {
    id: "ask-siggi",
    icon: "💬",
    label: "Ask Siggi anything",
    detail: "Hit the chat button (bottom right) and ask about any market, strategy, or trade in plain English.",
    href: null,
    pageLabel: null,
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function isCurrentPage(href: string | null, pathname: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function GettingStartedChecklist() {
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  // gone = tab permanently hidden by the user
  const [gone, setGone]       = useState(false);
  const [open, setOpen]       = useState(false);
  const [checked, setChecked] = useState<Set<StepId>>(new Set());

  // Hydrate from localStorage once on the client
  useEffect(() => {
    const isGone  = localStorage.getItem(GONE_KEY) === "true";
    const wasOpen = localStorage.getItem(OPEN_KEY) !== "false"; // open by default on first visit
    const raw     = localStorage.getItem(CHECKED_KEY);
    if (raw) {
      try { setChecked(new Set(JSON.parse(raw) as StepId[])); } catch { /* ignore */ }
    }
    setGone(isGone);
    // Only auto-open on first visit (when OPEN_KEY hasn't been written yet)
    const openKeySet = localStorage.getItem(OPEN_KEY) !== null;
    setOpen(!isGone && (openKeySet ? wasOpen : true));
    setMounted(true);
  }, []);

  // Auto-mark a step when the user navigates to its page
  useEffect(() => {
    if (!mounted || gone) return;
    const matchingStep = STEPS.find((s) => s.href && isCurrentPage(s.href, pathname));
    if (matchingStep && !checked.has(matchingStep.id)) {
      setChecked((prev) => {
        const next = new Set(prev);
        next.add(matchingStep.id);
        localStorage.setItem(CHECKED_KEY, JSON.stringify([...next]));
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, mounted]);

  function toggle(id: StepId) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(CHECKED_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function openGuide() {
    // If user had permanently hidden it, unhide first
    if (gone) {
      localStorage.removeItem(GONE_KEY);
      setGone(false);
    }
    setOpen(true);
    localStorage.setItem(OPEN_KEY, "true");
  }

  function toggleOpen() {
    setOpen((prev) => {
      localStorage.setItem(OPEN_KEY, String(!prev));
      return !prev;
    });
  }

  function closePanel() {
    setOpen(false);
    localStorage.setItem(OPEN_KEY, "false");
  }

  /** Permanently removes the tab. User can restore via dev tools / clearing storage. */
  function removeGuide() {
    localStorage.setItem(GONE_KEY, "true");
    setGone(true);
    setOpen(false);
  }

  // Don't render at all until client-side state is ready (avoid SSR mismatch)
  if (!mounted) return null;

  // If permanently gone, render nothing — but user can always clear storage to get it back
  if (gone) return null;

  const completedCount = STEPS.filter((s) => checked.has(s.id)).length;
  const total          = STEPS.length;
  const progress       = Math.round((completedCount / total) * 100);

  return (
    <>
      {/* ── Tab trigger — always pinned to right edge ─────────────────── */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={open ? "Close guide" : "Open getting-started guide"}
        style={{
          right: open ? PANEL_WIDTH : 0,
          transition: "right 300ms cubic-bezier(0.4,0,0.2,1)",
        }}
        className="fixed top-1/2 z-50 -translate-y-1/2 cursor-pointer select-none rounded-l-[0.55rem] border border-r-0 border-cyan-400/25 bg-gradient-to-b from-[#0d2236] to-[#091a2b] shadow-[0_4px_24px_rgba(0,0,0,0.55),-2px_0_12px_rgba(6,182,212,0.08)] backdrop-blur-xl"
      >
        {/* Coloured accent strip on left edge */}
        <span className="absolute inset-y-0 left-0 w-[3px] rounded-l-[0.55rem] bg-gradient-to-b from-cyan-400 to-violet-500 opacity-80" />

        <div className="px-2.5 py-3.5">
          {/* Checklist icon */}
          <svg
            viewBox="0 0 20 20"
            className="mx-auto h-[1.1rem] w-[1.1rem] text-cyan-300"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M4 5.5h12M4 10h8M4 14.5h5" />
            <circle
              cx="15.5" cy="13.5" r="3.5"
              fill="rgba(52,211,153,0.15)"
              stroke="#34d399"
              strokeWidth="1.4"
            />
            <path
              d="m13.8 13.5.9.9 1.6-1.6"
              stroke="#34d399"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Vertical label */}
          <span
            className="mt-2 block text-[0.58rem] font-bold uppercase tracking-[0.12em] text-cyan-400"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            Guide
          </span>

          {/* Progress fraction */}
          <span
            className="mt-1.5 block text-[0.56rem] font-semibold leading-none text-slate-500"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            {completedCount}/{total}
          </span>

          {/* Chevron */}
          <svg
            viewBox="0 0 10 10"
            className={`mx-auto mt-2 h-2.5 w-2.5 text-slate-500 transition-transform duration-300 ${open ? "rotate-0" : "rotate-180"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m7 2-4 3 4 3" />
          </svg>
        </div>
      </button>

      {/* ── Slide-out panel ───────────────────────────────────────────── */}
      <div
        style={{ width: PANEL_WIDTH }}
        className={`fixed top-0 right-0 z-40 flex h-full flex-col border-l border-white/8 bg-[#07111d]/98 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-white/6 px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Getting started
              </p>
              <p className="mt-0.5 text-[0.88rem] font-semibold text-white">
                Your route to profitable trades
              </p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close guide panel"
              className="mt-0.5 shrink-0 rounded p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 3l10 10M13 3 3 13" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[0.68rem] text-slate-500">{completedCount} of {total} done</span>
              <span className={`text-[0.68rem] font-semibold ${progress === 100 ? "text-emerald-400" : "text-cyan-300"}`}>
                {progress}%
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Steps list — scrollable */}
        <div className="flex-1 overflow-y-auto py-2">
          {STEPS.map((step, index) => {
            const isDone     = checked.has(step.id);
            const onThisPage = isCurrentPage(step.href, pathname);

            return (
              <div
                key={step.id}
                className={`relative mx-2 mb-1 rounded-[0.4rem] p-2.5 transition ${
                  isDone
                    ? "bg-emerald-500/6"
                    : onThisPage
                      ? "bg-cyan-400/6 ring-1 ring-cyan-400/15"
                      : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggle(step.id)}
                    aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                      isDone
                        ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-400"
                        : "border-white/20 bg-white/5 text-transparent hover:border-white/40"
                    }`}
                  >
                    {isDone && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-[0.60rem] font-medium text-slate-600">
                      {step.icon} Step {index + 1}
                    </p>
                    <p className={`mt-0.5 text-[0.80rem] font-semibold leading-tight ${
                      isDone ? "text-slate-500 line-through" : "text-white"
                    }`}>
                      {step.label}
                    </p>
                    <p className="mt-1 text-[0.70rem] leading-[1.4] text-slate-500">
                      {step.detail}
                    </p>

                    {/* CTA — You're here / navigate link / got it */}
                    <div className="mt-1.5">
                      {step.href === null ? (
                        <button
                          type="button"
                          onClick={() => toggle(step.id)}
                          className="text-[0.70rem] font-semibold text-cyan-400 transition hover:text-cyan-200"
                        >
                          {isDone ? "✓ Done" : "Got it →"}
                        </button>
                      ) : onThisPage ? (
                        <span className="inline-flex items-center gap-1 text-[0.70rem] font-semibold text-cyan-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.8)]" />
                          You&apos;re here
                        </span>
                      ) : (
                        <Link
                          href={step.href}
                          className="text-[0.70rem] font-semibold text-slate-400 transition hover:text-cyan-300"
                          onClick={closePanel}
                        >
                          Go to {step.pageLabel} →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer — completion banner or dismiss link */}
        <div className="shrink-0 border-t border-white/6 p-3">
          {progress === 100 ? (
            <div className="rounded-[0.4rem] bg-emerald-500/10 px-3 py-2.5 ring-1 ring-emerald-500/20">
              <p className="text-[0.76rem] font-semibold text-emerald-300">
                🚀 You know the platform — go find your next trade.
              </p>
              <button
                type="button"
                onClick={removeGuide}
                className="mt-1 text-[0.68rem] font-medium text-emerald-500 transition hover:text-emerald-300"
              >
                Hide guide permanently
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={removeGuide}
              className="w-full text-center text-[0.66rem] text-slate-700 transition hover:text-slate-400"
            >
              Hide guide permanently
            </button>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
          onClick={toggleOpen}
          aria-hidden="true"
        />
      )}
    </>
  );
}
