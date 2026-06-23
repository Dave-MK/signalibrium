"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useEffect,
  type ReactElement,
  type ReactNode,
} from "react";

// ─── types ────────────────────────────────────────────────────────────────────

export type ToastType = "signal" | "trade" | "event" | "info";

export type Toast = {
  id:   string;
  type: ToastType;
  title: string;
  body:  string;
  /** ms before auto-dismiss — default 7 000 */
  ttl?: number;
};

type ToastCtx = {
  addToast: (t: Omit<Toast, "id">) => void;
};

// ─── context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ─── accent colours by type ───────────────────────────────────────────────────

const ACCENT: Record<ToastType, { bar: string; icon: ReactElement }> = {
  signal: {
    bar: "bg-emerald-400",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M10 3v14M3 10h14" />
        <circle cx="10" cy="10" r="7" />
      </svg>
    ),
  },
  trade: {
    bar: "bg-[#00C884]",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#00C884]" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 9.5c-2.67 0-4.47-1.33-4.47-2 0-.67 1.8-2 4.47-2s4.47 1.33 4.47 2c0 .67-1.8 2-4.47 2Z" fill="currentColor" />
      </svg>
    ),
  },
  event: {
    bar: "bg-amber-400",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M10 3l1.8 5.5H17l-4.6 3.4 1.8 5.5L10 14l-4.2 3.4 1.8-5.5L3 8.5h5.2z" />
      </svg>
    ),
  },
  info: {
    bar: "bg-slate-400",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 9v5M10 7v.5" strokeLinecap="round" />
      </svg>
    ),
  },
};

// ─── single toast card ────────────────────────────────────────────────────────

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const accent = ACCENT[toast.type];
  const [visible, setVisible] = useState(false);

  // Animate in from the left
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    const ms = toast.ttl ?? 7_000;
    const id = setTimeout(onDismiss, ms);
    return () => clearTimeout(id);
  }, [toast.ttl, onDismiss]);

  return (
    <div
      className={`relative flex w-[260px] shrink-0 items-start gap-3 overflow-hidden rounded-[0.55rem] border border-white/10 bg-[#111210]/98 px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-all duration-300 ${
        visible ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0"
      }`}
    >
      {/* Coloured left bar */}
      <span className={`absolute inset-y-0 left-0 w-[3px] rounded-l-[0.55rem] ${accent.bar}`} />

      {/* Icon */}
      <span className="mt-0.5 shrink-0">{accent.icon}</span>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-[0.80rem] font-semibold leading-tight text-white">{toast.title}</p>
        <p className="mt-0.5 text-[0.72rem] leading-[1.4] text-slate-400">{toast.body}</p>
      </div>

      {/* Dismiss */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="mt-0.5 shrink-0 text-slate-600 transition hover:text-slate-300"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m3 3 10 10M13 3 3 13" />
        </svg>
      </button>
    </div>
  );
}

// ─── provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    counterRef.current += 1;
    const id = `toast-${counterRef.current}`;
    setToasts((prev) => {
      // Keep at most 3 in the row — drop the oldest (last in array) when full
      const trimmed = prev.length >= 3 ? prev.slice(0, 2) : prev;
      // Prepend so newest is always leftmost
      return [{ ...t, id }, ...trimmed];
    });
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Single horizontal row — newest on left, older pushed right, max 3 */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-5 left-3 z-[60] flex flex-row gap-2 sm:left-5"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
