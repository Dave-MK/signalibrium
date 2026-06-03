"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { MarketDataSyncSummary } from "@/app/_lib/market-data-contract";
import type {
  PersistedAssetRecord,
  PersistedWatchlist,
} from "@/app/_lib/server/workspace-types";
import { Sparkline } from "../_components/sparkline";
import { ActionLink, PageHeader, Panel, StatusChip } from "../_components/ui";
import { formatCurrency, formatDateTimeLabel, formatPercent } from "../_lib/format";
import {
  getDefaultPersistedWatchlist,
} from "../_lib/reference-data";
import {
  createWatchlist,
  updateWatchlist,
} from "../_lib/workspace-api";

function AssetMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-2.5">
      <p className="micro-label">{label}</p>
      <p className="mt-1.5 text-[0.84rem] font-semibold text-white">{value}</p>
    </div>
  );
}

export default function AssetsPageClient({
  initialWatchlists,
  initialAssets,
}: {
  initialWatchlists: PersistedWatchlist[];
  initialAssets: PersistedAssetRecord[];
}) {
  const router = useRouter();
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
      router.refresh();
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
    if (!selectedWatchlist) {
      return assets;
    }

    if (selectedWatchlist.itemSymbols.length === 0) {
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
        current.map((watchlist) =>
          watchlist.id === updated.id ? updated : watchlist,
        ),
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
        eyebrow="Market Charts"
        title="Live markets with less clutter"
        description="Keep this page focused on the names that matter. Use it to watch the live basket, jump into full chart workstations, and maintain a clean watchlist instead of scanning noise."
        action={<ActionLink href={visibleAssets[0] ? `/assets/${visibleAssets[0].symbol}` : "/assets"}>Open First Chart</ActionLink>}
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div>
              <p className="micro-label">Active Watchlists</p>
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
            </div>

            {syncSummary ? (
              <div className="signal-surface-soft rounded-[0.4rem] p-3">
                <p className="micro-label">Latest Sync</p>
                <p className="mt-1.5 text-[0.9rem] font-semibold text-white">
                  {syncSummary.syncedSymbols.length} symbols refreshed from {syncSummary.provider}
                </p>
                <p className="mt-1 text-[0.76rem] text-slate-400">
                  Synced {formatDateTimeLabel(syncSummary.syncedAt)}
                </p>
              </div>
            ) : null}
          </div>

          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Create Watchlist</p>
            <div className="mt-3 space-y-2.5">
              <input
                value={newWatchlistName}
                onChange={(event) => setNewWatchlistName(event.target.value)}
                placeholder="AI Momentum"
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

        {error ? (
          <p className="mt-3 text-[0.82rem] text-amber-200">{error}</p>
        ) : null}
      </Panel>

      <div className="grid gap-[5px] lg:grid-cols-2">
        {visibleAssets.map((asset) => {
          const inSelectedWatchlist =
            selectedWatchlist?.itemSymbols.includes(asset.symbol) ?? false;

          return (
            <Panel key={asset.symbol} className="p-3 sm:p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="micro-label">{asset.assetClass}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Link
                      href={`/assets/${asset.symbol}`}
                      className="text-[1rem] font-semibold text-white transition hover:text-cyan-200"
                    >
                      {asset.symbol}
                    </Link>
                    {asset.tradeable ? <StatusChip label="TRADEABLE" /> : <StatusChip label="WATCH" />}
                  </div>
                  <p className="mt-0.5 text-[0.82rem] text-slate-400">{asset.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[1rem] font-semibold text-white">{formatCurrency(asset.price)}</p>
                  <p className={`mt-0.5 text-[0.8rem] ${asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {formatPercent(asset.change24h, true)}
                  </p>
                </div>
              </div>

              <Sparkline data={asset.sparkline} className="mt-3 h-12 w-full" />

              <div className="mt-3 grid gap-[5px] sm:grid-cols-3">
                <AssetMetric label="Regime" value={asset.regime} />
                <AssetMetric label="Strategy" value={asset.activeStrategy} />
                <AssetMetric label="Synced" value={formatDateTimeLabel(asset.lastSyncedAt)} />
              </div>

              <p className="mt-3 text-[0.82rem] leading-5 text-slate-300">{asset.aiBias}</p>

              <div className="mt-3 flex flex-wrap gap-[5px]">
                <Link
                  href={`/assets/${asset.symbol}`}
                  className="signal-accent-surface rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold text-white"
                >
                  Open Chart Workspace
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
                    {inSelectedWatchlist ? "Remove From Watchlist" : "Add To Watchlist"}
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
