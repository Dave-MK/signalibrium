"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBrokerPositionsApi, type BrokerPosition } from "./workspace-api";

export type PositionsState = {
  positions: BrokerPosition[];
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
};

/**
 * Polls /api/broker-connections/[connectionId]/positions every `intervalMs`
 * (default 5 000 ms = 5 s) while the document is visible.
 *
 * Stops polling automatically on unmount or when the tab is hidden.
 */
export function useBrokerPositions(
  connectionId: string | null,
  { intervalMs = 5_000, enabled = true }: { intervalMs?: number; enabled?: boolean } = {},
): PositionsState & { refresh: () => void } {
  const [state, setState] = useState<PositionsState>({
    positions: [],
    fetchedAt: null,
    loading: false,
    error: null,
  });

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchingRef    = useRef(false);
  const connectionRef  = useRef(connectionId);
  connectionRef.current = connectionId;

  const fetchPositions = useCallback(async () => {
    const id = connectionRef.current;
    if (!id || fetchingRef.current) return;
    fetchingRef.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await fetchBrokerPositionsApi(id);
      setState({ positions: result.positions, fetchedAt: result.fetchedAt, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch positions.";
      setState((prev) => ({ ...prev, loading: false, error: msg }));
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!connectionId || !enabled) {
      setState({ positions: [], fetchedAt: null, loading: false, error: null });
      return;
    }

    // Initial fetch
    void fetchPositions();

    // Set up interval — skip when tab is hidden to reduce unnecessary requests
    timerRef.current = setInterval(() => {
      if (document.visibilityState === "visible") void fetchPositions();
    }, intervalMs);

    // Refresh on tab focus
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void fetchPositions();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [connectionId, enabled, intervalMs, fetchPositions]);

  return { ...state, refresh: fetchPositions };
}
