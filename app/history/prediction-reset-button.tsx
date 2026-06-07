"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetPredictionHistory } from "@/app/_lib/workspace-api";

export function PredictionResetButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function handleReset(wipeAll: boolean) {
    startTransition(async () => {
      try {
        const result = await resetPredictionHistory(wipeAll);
        setStatus(
          `Done — removed ${result.recordsRemoved} prediction${result.recordsRemoved === 1 ? "" : "s"}, kept ${result.recordsKept} resolved outcomes.`,
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
          Reset predictions
        </button>
      ) : (
        <div className="flex flex-col items-end gap-2">
          <p className="text-[0.72rem] text-slate-400">
            What do you want to remove?
          </p>
          <div className="flex items-center gap-2">
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
              onClick={() => handleReset(false)}
              disabled={isPending}
              className="rounded-[0.4rem] bg-amber-500/20 px-2.5 py-1 text-[0.71rem] font-semibold text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Working…" : "Unresolved only"}
            </button>
            <button
              type="button"
              onClick={() => handleReset(true)}
              disabled={isPending}
              className="rounded-[0.4rem] bg-red-500/20 px-2.5 py-1 text-[0.71rem] font-semibold text-red-300 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Working…" : "Wipe everything"}
            </button>
          </div>
        </div>
      )}
      {status && (
        <p className="text-[0.72rem] text-emerald-400">{status}</p>
      )}
    </div>
  );
}
