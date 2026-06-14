"use client";

import { useBrokerPositions } from "@/app/_lib/use-broker-positions";
import { PositionsPanel } from "./positions-panel";

/**
 * Dashboard positions widget — appears on the Overview page when the user
 * has a connected broker.  Uses the same live polling hook as the status chip.
 */
export function DashboardPositionsWidget({ connectionId }: { connectionId: string }) {
  const { positions, loading, error, fetchedAt } = useBrokerPositions(connectionId, {
    enabled: true,
    intervalMs: 15_000,
  });

  if (loading && positions.length === 0) {
    return (
      <div className="signal-surface-soft rounded-[0.4rem] p-4">
        <p className="micro-label mb-2">Live Positions</p>
        <p className="text-[0.78rem] text-slate-500">Loading positions…</p>
      </div>
    );
  }

  if (error && positions.length === 0) {
    return (
      <div className="signal-surface-soft rounded-[0.4rem] p-4">
        <p className="micro-label mb-2">Live Positions</p>
        <p className="text-[0.78rem] text-red-400">{error}</p>
      </div>
    );
  }

  if (positions.length === 0) return null;

  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3 sm:p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="micro-label">Live Positions</p>
        {fetchedAt && (
          <span className="text-[0.62rem] text-slate-600">
            Updated {new Date(fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>
      <PositionsPanel positions={positions} compact />
    </div>
  );
}
