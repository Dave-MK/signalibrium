"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  PersistedAssetRecord,
  PersistedWatchlist,
} from "@/app/_lib/server/workspace-types";
import { Sparkline } from "../_components/sparkline";
import { PageHeader, Panel, StatusChip } from "../_components/ui";
import { formatCurrency, formatPercent } from "../_lib/format";
import {
  getDefaultPersistedWatchlist,
} from "../_lib/reference-data";
import {
  createWatchlist,
  deleteWatchlist,
  updateWatchlist,
} from "../_lib/workspace-api";

export default function AssetsPageClient({
  initialWatchlists,
  initialAssets,
}: {
  initialWatchlists: PersistedWatchlist[];
  initialAssets: PersistedAssetRecord[];
}) {
  const initialSelectedWatchlist = getDefaultPersistedWatchlist(initialWatchlists);
  const [watchlists, setWatchlists] = useState<PersistedWatchlist[]>(initialWatchlists);
  const [assets] = useState<PersistedAssetRecord[]>(initialAssets);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>(
    initialSelectedWatchlist?.id ?? "",
  );
  const [draftName, setDraftName] = useState(initialSelectedWatchlist?.name ?? "");
  const [draftDescription, setDraftDescription] = useState(
    initialSelectedWatchlist?.description ?? "",
  );
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [newWatchlistDescription, setNewWatchlistDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWatchlist =
    watchlists.find((watchlist) => watchlist.id === selectedWatchlistId) ?? null;

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
        description: newWatchlistDescription.trim(),
        itemSymbols: [],
        isDefault: watchlists.length === 0,
      });

      const nextWatchlists = [...watchlists, watchlist];
      setWatchlists(nextWatchlists);
      setSelectedWatchlistId(watchlist.id);
      setDraftName(watchlist.name);
      setDraftDescription(watchlist.description);
      setNewWatchlistName("");
      setNewWatchlistDescription("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create watchlist");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveWatchlist() {
    if (!selectedWatchlist) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      const updated = await updateWatchlist(selectedWatchlist.id, {
        name: draftName.trim(),
        description: draftDescription.trim(),
      });

      setWatchlists((current) =>
        current.map((watchlist) =>
          watchlist.id === updated.id ? updated : watchlist,
        ),
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save watchlist");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleDefault() {
    if (!selectedWatchlist) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      const updates = await Promise.all(
        watchlists.map((watchlist) =>
          updateWatchlist(watchlist.id, {
            isDefault: watchlist.id === selectedWatchlist.id,
          }),
        ),
      );
      setWatchlists(updates);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to set default watchlist");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteWatchlist() {
    if (!selectedWatchlist || selectedWatchlist.isDefault) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await deleteWatchlist(selectedWatchlist.id);
      const remaining = watchlists.filter(
        (watchlist) => watchlist.id !== selectedWatchlist.id,
      );
      const fallback = getDefaultPersistedWatchlist(remaining);
      setWatchlists(remaining);
      setSelectedWatchlistId(fallback?.id ?? "");
      setDraftName(fallback?.name ?? "");
      setDraftDescription(fallback?.description ?? "");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete watchlist");
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
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update watchlist items");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Assets"
        title="Focused watchlist, not infinite noise"
        description="The V1 seed universe is intentionally narrow so the scanner, backtester, and risk layers can prove signal quality before scale. Every asset here links into a detail workstation view."
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-3">
            <div>
              <p className="micro-label">Workspace Watchlists</p>
              <div className="mt-3 flex flex-wrap gap-[5px]">
                {watchlists.map((watchlist) => (
                  <button
                    key={watchlist.id}
                    type="button"
                    onClick={() => {
                      setSelectedWatchlistId(watchlist.id);
                      setDraftName(watchlist.name);
                      setDraftDescription(watchlist.description);
                    }}
                    className={`inline-flex items-center gap-2 rounded-[0.4rem] px-3 py-2 text-[0.8rem] font-semibold transition ${
                      watchlist.id === selectedWatchlistId
                        ? "signal-accent-surface text-white"
                        : "signal-surface-soft text-slate-300 hover:text-white"
                    }`}
                  >
                    <span>{watchlist.name}</span>
                    <span className="text-[0.68rem] text-slate-400">
                      {watchlist.itemSymbols.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {selectedWatchlist ? (
              <div className="signal-surface-soft rounded-[0.4rem] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.9rem] font-semibold text-white">
                    Edit selected watchlist
                  </p>
                  {selectedWatchlist.isDefault ? (
                    <StatusChip label="DEFAULT" />
                  ) : null}
                </div>
                <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="micro-label">Name</span>
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="micro-label">Description</span>
                    <input
                      value={draftDescription}
                      onChange={(event) => setDraftDescription(event.target.value)}
                      className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-[5px]">
                  <button
                    type="button"
                    onClick={() => void handleSaveWatchlist()}
                    disabled={isSaving}
                    className="signal-button rounded-[0.46rem] px-3.5 py-2 text-[0.82rem] font-semibold"
                  >
                    Save Details
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleDefault()}
                    disabled={isSaving || selectedWatchlist.isDefault}
                    className="signal-surface-soft rounded-[0.4rem] px-3.5 py-2 text-[0.82rem] font-semibold text-white disabled:opacity-50"
                  >
                    Set Default
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteWatchlist()}
                    disabled={isSaving || selectedWatchlist.isDefault}
                    className="signal-warning-surface rounded-[0.4rem] px-3.5 py-2 text-[0.82rem] font-semibold text-amber-100 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="signal-surface-soft rounded-[0.4rem] p-3">
            <p className="micro-label">Create Watchlist</p>
            <div className="mt-3 space-y-2.5">
              <label className="space-y-1">
                <span className="micro-label">Name</span>
                <input
                  value={newWatchlistName}
                  onChange={(event) => setNewWatchlistName(event.target.value)}
                  placeholder="AI Rotation"
                  className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="micro-label">Description</span>
                <textarea
                  value={newWatchlistDescription}
                  onChange={(event) => setNewWatchlistDescription(event.target.value)}
                  rows={3}
                  className="signal-surface-soft w-full rounded-[0.4rem] px-3 py-2 text-[0.84rem] text-white outline-none"
                />
              </label>
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
        {assets.map((asset) => {
          const inSelectedWatchlist =
            selectedWatchlist?.itemSymbols.includes(asset.symbol) ?? false;

          return (
            <Panel key={asset.symbol} className="h-full p-3 sm:p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="micro-label">{asset.assetClass}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Link
                      href={`/assets/${asset.symbol}`}
                      className="text-lg font-semibold text-white transition hover:text-cyan-200 sm:text-[1.15rem]"
                    >
                      {asset.symbol}
                    </Link>
                    {inSelectedWatchlist ? <StatusChip label="IN WATCHLIST" /> : null}
                  </div>
                  <p className="mt-0.5 text-[0.84rem] text-slate-400">{asset.name}</p>
                </div>
                <StatusChip label={asset.tradeable ? "TRADEABLE" : "WATCH"} />
              </div>

              <div className="mt-3 grid gap-[5px] sm:grid-cols-2">
                <div>
                  <p className="text-[1.45rem] font-semibold text-white">
                    {formatCurrency(asset.price)}
                  </p>
                  <p
                    className={`mt-0.5 text-[0.82rem] ${
                      asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {formatPercent(asset.change24h, true)} over the latest session
                  </p>
                </div>
                <div className="text-[0.82rem] leading-5 text-slate-300">
                  <p>Regime: {asset.regime}</p>
                  <p>Strategy match: {asset.activeStrategy}</p>
                  <p>Liquidity: {asset.liquidity}</p>
                </div>
              </div>

              <Sparkline data={asset.sparkline} className="mt-3 h-14 w-full sm:h-16" />

              <p className="mt-3 text-[0.82rem] leading-5 text-slate-300">{asset.aiBias}</p>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[0.74rem] text-slate-500">
                  {selectedWatchlist
                    ? `${selectedWatchlist.name} contains ${selectedWatchlist.itemSymbols.length} assets`
                    : "Create a watchlist to begin saving assets."}
                </p>
                <button
                  type="button"
                  onClick={() => void handleToggleAsset(asset.symbol)}
                  disabled={!selectedWatchlist || isSaving}
                  className={`rounded-[0.4rem] px-3 py-2 text-[0.78rem] font-semibold transition disabled:opacity-50 ${
                    inSelectedWatchlist
                      ? "signal-warning-surface text-amber-100"
                      : "signal-surface-soft text-white"
                  }`}
                >
                  {inSelectedWatchlist ? "Remove" : "Add"}
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
