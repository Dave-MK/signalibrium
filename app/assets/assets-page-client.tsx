"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import type { MarketDataSyncSummary } from "@/app/_lib/market-data-contract";
import { getMarketSession } from "@/app/_lib/market-hours";
import type {
  PersistedAssetRecord,
  PersistedWatchlist,
} from "@/app/_lib/server/workspace-types";
import { useDisplayCurrency } from "../_components/display-currency-provider";
import { Sparkline } from "../_components/sparkline";
import { ActionLink, PageHeader, Panel, StatusChip } from "../_components/ui";
import { formatDateTimeLabel, formatPercent } from "../_lib/format";
import { getDefaultPersistedWatchlist } from "../_lib/reference-data";
import { createWatchlist, updateWatchlist } from "../_lib/workspace-api";

function WatchMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
      <p className="micro-label">{label}</p>
      <p className="mt-1.5 text-[0.82rem] font-semibold text-white">{value}</p>
    </div>
  );
}

function formatMarketSessionLabel(state: ReturnType<typeof getMarketSession>["state"]) {
  if (state === "Open") {
    return "MARKET OPEN";
  }

  if (state === "Closed") {
    return "MARKET CLOSED";
  }

  return state;
}

export default function AssetsPageClient({
  initialWatchlists,
  initialAssets,
}: {
  initialWatchlists: PersistedWatchlist[];
  initialAssets: PersistedAssetRecord[];
}) {
  const router = useRouter();
  const { formatPrice } = useDisplayCurrency();
  const initialSelectedWatchlist = getDefaultPersistedWatchlist(initialWatchlists);
  const [watchlists, setWatchlists] = useState<PersistedWatchlist[]>(initialWatchlists);
  const [assets, setAssets] = useState<PersistedAssetRecord[]>(initialAssets);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>(
    initialSelectedWatchlist?.id ?? "",
  );
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<MarketDataSyncSummary | null>(null);

  const selectedWatchlist =
    watchlists.find((watchlist) => watchlist.id === selectedWatchlistId) ?? null;

  useEffect(() => {
    function handleSynced(event: Event) {
      const customEvent = event as CustomEvent<MarketDataSyncSummary>;
      setAssets(customEvent.detail.assets);
      setSyncSummary(customEvent.detail);
      setError(null);
      startTransition(() => router.refresh());
    }

    function handleSyncError(event: Event) {
      const customEvent = event as CustomEvent<{ message: string }>;
      setError(customEvent.detail.message);
    }

    window.addEventListener(
      "signalibrium:market-data-synced",
      handleSynced as EventListener,
    );
    window.addEventListener(
      "signalibrium:market-data-sync-error",
      handleSyncError as EventListener,
    );

    return () => {
      window.removeEventListener(
        "signalibrium:market-data-synced",
        handleSynced as EventListener,
      );
      window.removeEventListener(
        "signalibrium:market-data-sync-error",
        handleSyncError as EventListener,
      );
    };
  }, [router]);

  const visibleAssets = useMemo(() => {
    if (!selectedWatchlist || selectedWatchlist.itemSymbols.length === 0) {
      return assets;
    }

    const selectedSet = new Set(selectedWatchlist.itemSymbols);
    return assets.filter((asset) => selectedSet.has(asset.symbol));
  }, [assets, selectedWatchlist]);

  async function handleCreateWatchlist() {
    if (!newWatchlistName.trim()) {
      setError("Name is required to create a watchlist.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      const watchlist = await createWatchlist({
        name: newWatchlistName.trim(),
        description: "",
        itemSymbols: [],
        isDefault: watchlists.length === 0,
      });

      setWatchlists((current) => [...current, watchlist]);
      setSelectedWatchlistId(watchlist.id);
      setNewWatchlistName("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create watchlist");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleAsset(symbol: string) {
    if (!selectedWatchlist) {
      return;
    }

    const nextSymbols = selectedWatchlist.itemSymbols.includes(symbol)
      ? selectedWatchlist.itemSymbols.filter((itemSymbol) => itemSymbol !== symbol)
      : [...selectedWatchlist.itemSymbols, symbol];

    try {
      setIsSaving(true);
      setError(null);
      const updated = await updateWatchlist(selectedWatchlist.id, {
        itemSymbols: nextSymbols,
      });

      setWatchlists((current) =>
        current.map((watchlist) => (watchlist.id === updated.id ? updated : watchlist)),
      );
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update watchlist");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Watchlist"
        description="Scan the basket, then open the chart as soon as something sets up."
        action={
          <ActionLink href={visibleAssets[0] ? `/assets/${visibleAssets[0].symbol}` : "/assets"}>
            Open First Chart
          </ActionLink>
        }
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] xl:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <p className="micro-label">Watchlists</p>
            <div className="mt-3 flex flex-wrap gap-[5px]">
              {watchlists.map((watchlist) => (
                <button
                  key={watchlist.id}
                  type="button"
                  onClick={() => setSelectedWatchlistId(watchlist.id)}
                  className={`inline-flex items-center gap-2 rounded-[0.4rem] px-3 py-2 text-[0.8rem] font-semibold transition ${
                    watchlist.id === selectedWatchlistId
                      ? "signal-accent-surface text-white"
                      : "signal-surface-soft text-slate-300 hover:text-white"
                  }`}
                >
                  <span>{watchlist.name}</span>
                  <span className="text-[0.68rem] text-slate-400">{watchlist.itemSymbols.length}</span>
                </button>
              ))}
            </div>

            {syncSummary ? (
              <div className="signal-surface-soft mt-3 rounded-[0.65rem] p-3">
                <p className="micro-label">Live Sync</p>
                <p className="mt-1.5 text-[0.84rem] font-semibold text-white">
                  {syncSummary.syncedSymbols.length} symbols refreshed
                </p>
                <p className="mt-1 text-[0.76rem] text-slate-400">
                  {syncSummary.provider} / {formatDateTimeLabel(syncSummary.syncedAt)}
                </p>
              </div>
            ) : null}
          </div>

          <div className="signal-surface-soft rounded-[0.65rem] p-3">
            <p className="micro-label">New Watchlist</p>
            <div className="mt-3 space-y-2.5">
              <input
                value={newWatchlistName}
                onChange={(event) => setNewWatchlistName(event.target.value)}
                placeholder="Momentum"
                className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCreateWatchlist()}
                disabled={isSaving}
                className="signal-button w-full rounded-[0.46rem] px-3.5 py-2 text-[0.82rem] font-semibold"
              >
                Add Watchlist
              </button>
            </div>
          </div>
        </div>

        {error ? <p className="mt-3 text-[0.82rem] text-amber-200">{error}</p> : null}
      </Panel>

      <div className="grid gap-[5px] md:grid-cols-2 2xl:grid-cols-3">
        {visibleAssets.map((asset) => {
          const inSelectedWatchlist =
            selectedWatchlist?.itemSymbols.includes(asset.symbol) ?? false;
          const marketSession = getMarketSession(asset);

          return (
            <Panel key={asset.symbol} className="p-3 sm:p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="micro-label">{asset.assetClass}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Link
                      href={`/assets/${asset.symbol}`}
                      className="text-[1rem] font-semibold text-white transition hover:text-[#00C884]/80"
                    >
                      {asset.symbol}
                    </Link>
                    {asset.tradeable ? <StatusChip label="TRADEABLE" /> : <StatusChip label="WATCH" />}
                    <StatusChip label={formatMarketSessionLabel(marketSession.state)} />
                  </div>
                  <p className="mt-0.5 text-[0.8rem] text-slate-400">{asset.name}</p>
                  <p className="mt-1 text-[0.72rem] text-slate-500">
                    {marketSession.venue} / {marketSession.detail}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[0.98rem] font-semibold text-white">{formatPrice(asset.price, asset.assetClass)}</p>
                  <p className={`mt-0.5 text-[0.8rem] ${asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {formatPercent(asset.change24h, true)}
                  </p>
                </div>
              </div>

              <Sparkline data={asset.sparkline} className="mt-3 h-10 w-full" />

              <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-4">
                <WatchMetric label="Regime" value={asset.regime} />
                <WatchMetric label="Strategy" value={asset.activeStrategy} />
                <WatchMetric label="Market" value={marketSession.state} />
                <WatchMetric label="Synced" value={formatDateTimeLabel(asset.lastSyncedAt)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-[5px]">
                <Link
                  href={`/assets/${asset.symbol}`}
                  className="signal-accent-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                >
                  Open Chart
                </Link>
                {selectedWatchlist ? (
                  <button
                    type="button"
                    onClick={() => void handleToggleAsset(asset.symbol)}
                    disabled={isSaving}
                    className={`rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold ${
                      inSelectedWatchlist
                        ? "signal-warning-surface text-amber-100"
                        : "signal-surface-soft text-white"
                    }`}
                  >
                    {inSelectedWatchlist ? "Remove" : "Add"}
                  </button>
                ) : null}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
