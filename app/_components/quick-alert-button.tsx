"use client";

/**
 * QuickAlertButton
 *
 * A small button that opens a mini popover to set a price alert.
 * Pre-fills symbol, condition, and price from props.
 *
 * Used on signal cards to quickly set a stop or target alert.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

export type QuickAlertPrefill = {
  symbol:    string;
  label?:    string;
  condition: "above" | "below";
  price:     number;
};

type Props = {
  prefill:    QuickAlertPrefill;
  /** Extra classNames for the trigger button */
  className?: string;
  buttonLabel?: string;
  onCreated?: () => void;
};

function fmtPrice(p: number) {
  if (p < 0.001) return p.toFixed(6);
  if (p < 10)    return p.toFixed(4);
  if (p < 10_000) return p.toFixed(2);
  return p.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

function Popover({
  prefill,
  anchorRect,
  onClose,
  onCreated,
}: {
  prefill:    QuickAlertPrefill;
  anchorRect: DOMRect;
  onClose:    () => void;
  onCreated?: () => void;
}) {
  const [label,     setLabel]     = useState(prefill.label ?? `${prefill.symbol} ${prefill.condition} ${fmtPrice(prefill.price)}`);
  const [condition, setCondition] = useState<"above" | "below">(prefill.condition);
  const [priceStr,  setPriceStr]  = useState(String(prefill.price));
  const [error,     setError]     = useState<string | null>(null);
  const [pending,   startT]       = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Position the popover below the anchor
  const top   = anchorRect.bottom + window.scrollY + 6;
  const left  = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 288));

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(priceStr);
    if (!label.trim())                           { setError("Label is required."); return; }
    if (!Number.isFinite(price) || price <= 0)   { setError("Enter a valid price."); return; }
    setError(null);
    startT(async () => {
      try {
        const res = await fetch("/api/alerts", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ symbol: prefill.symbol, label, condition, targetPrice: price }),
        });
        if (!res.ok) throw new Error(await res.text());
        onCreated?.();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9993]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        style={{ position: "absolute", top, left, width: 272 }}
        className="z-[9994] rounded-[0.55rem] border border-white/10 bg-[#111210] p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.8)]"
      >
        <p className="mb-2.5 text-[0.76rem] font-semibold text-white">Set price alert · {prefill.symbol}</p>
        <form onSubmit={submit} className="space-y-2.5">
          <div>
            <label className="mb-1 block text-[0.62rem] font-semibold uppercase tracking-wider text-slate-500">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-[0.3rem] border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[0.75rem] text-slate-200 focus:border-[#00C884]/40 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[0.62rem] font-semibold uppercase tracking-wider text-slate-500">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as "above" | "below")}
                className="w-full rounded-[0.3rem] border border-white/8 bg-[#111210] px-2.5 py-1.5 text-[0.75rem] text-slate-200 focus:outline-none"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[0.62rem] font-semibold uppercase tracking-wider text-slate-500">Price</label>
              <input
                type="number"
                step="any"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                className="w-full rounded-[0.3rem] border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-[0.75rem] text-slate-200 focus:border-[#00C884]/40 focus:outline-none"
              />
            </div>
          </div>
          {error && <p className="text-[0.68rem] text-red-400">{error}</p>}
          <div className="flex gap-2 pt-0.5">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-[0.3rem] bg-[#00C884]/15 py-1.5 text-[0.72rem] font-semibold text-[#00C884] ring-1 ring-[#00C884]/25 transition hover:bg-[#00C884]/25 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save alert"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[0.3rem] px-3 py-1.5 text-[0.72rem] font-semibold text-slate-500 ring-1 ring-white/8 transition hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}

export function QuickAlertButton({ prefill, className, buttonLabel = "Alert", onCreated }: Props) {
  const [open, setOpen]     = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect]     = useState<DOMRect | null>(null);
  const btnRef              = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  function handleClick() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        title={`Set alert: ${prefill.symbol} ${prefill.condition} ${fmtPrice(prefill.price)}`}
        className={
          className ??
          "flex items-center gap-1 rounded-[0.28rem] bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-300 ring-1 ring-amber-500/15 transition hover:bg-amber-500/18"
        }
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M8 2a4.5 4.5 0 0 0-4.5 4.5v2.5L2 11h12l-1.5-2V6.5A4.5 4.5 0 0 0 8 2Z" />
          <path d="M7 13.5a1 1 0 0 0 2 0" />
        </svg>
        {buttonLabel}
      </button>

      {mounted && open && rect && (
        <Popover
          prefill={prefill}
          anchorRect={rect}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}
