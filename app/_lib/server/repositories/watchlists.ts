import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedWatchlist } from "../workspace-types";

export async function listWatchlists() {
  const data = await readWorkspaceData();
  return data.watchlists;
}

export async function getWatchlistById(watchlistId: string) {
  const data = await readWorkspaceData();
  return data.watchlists.find((watchlist) => watchlist.id === watchlistId) ?? null;
}

export async function createWatchlist(
  input: Omit<PersistedWatchlist, "id" | "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextWatchlist: PersistedWatchlist = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.watchlists.push(nextWatchlist);
  await writeWorkspaceData(data);

  return nextWatchlist;
}

export async function updateWatchlist(
  watchlistId: string,
  input: Partial<Omit<PersistedWatchlist, "id" | "createdAt" | "updatedAt">>,
) {
  const data = await readWorkspaceData();
  const index = data.watchlists.findIndex((watchlist) => watchlist.id === watchlistId);

  if (index === -1) {
    return null;
  }

  const current = data.watchlists[index];
  const updated: PersistedWatchlist = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  };

  data.watchlists[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function deleteWatchlist(watchlistId: string) {
  const data = await readWorkspaceData();
  const index = data.watchlists.findIndex((watchlist) => watchlist.id === watchlistId);

  if (index === -1) {
    return false;
  }

  data.watchlists.splice(index, 1);
  await writeWorkspaceData(data);

  return true;
}
