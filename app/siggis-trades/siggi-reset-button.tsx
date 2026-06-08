"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetSiggiAccount } from "@/app/_lib/workspace-api";

export function SiggiResetButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleReset() {
    startTransition(async () => {
      try {
        const result = await resetSiggiAccount();
        setStatus(
          `Reset complete — Siggi restarted with £${result.startingBalanceGbp.toLocaleString("en-GB")} and a clean slate.`,
        );
        setConfirmOpen(false);
        router.refresh();
      } catch {
        setStatus("Reset failed — please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!confirmOpen ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="signal-surface-soft rounded-[0.4rem] px-3 py-1.5 text-[0.73rem] font-semibold text-amber-300 transition hover:bg-white/[0.06] hover:text-amber-200"
        >
          Reset Siggi
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[0.72rem] text-slate-400">Wipe all trades and history?</span>
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={isPending}
            className="signal-surface-soft rounded-[0.4rem] px-2.5 py-1 text-[0.71rem] font-semibold text-slate-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="rounded-[0.4rem] bg-red-500/20 px-2.5 py-1 text-[0.71rem] font-semibold text-red-300 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Resetting..." : "Yes, reset"}
          </button>
        </div>
      )}
      {status && (
        <p className="text-[0.72rem] text-emerald-400">{status}</p>
      )}
    </div>
  );
}
