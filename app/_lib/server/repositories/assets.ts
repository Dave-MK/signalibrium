import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedAssetRecord } from "../workspace-types";

export async function listAssets() {
  const data = await readWorkspaceData();
  return data.assets;
}

export async function getAssetBySymbol(symbol: string) {
  const data = await readWorkspaceData();
  return data.assets.find((asset) => asset.symbol === symbol.toUpperCase()) ?? null;
}

export async function createAsset(
  input: Omit<PersistedAssetRecord, "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextAsset: PersistedAssetRecord = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.assets.push(nextAsset);
  await writeWorkspaceData(data);

  return nextAsset;
}

export async function updateAsset(
  symbol: string,
  input: Partial<Omit<PersistedAssetRecord, "createdAt" | "updatedAt">>,
) {
  const data = await readWorkspaceData();
  const index = data.assets.findIndex((asset) => asset.symbol === symbol.toUpperCase());

  if (index === -1) {
    return null;
  }

  const current = data.assets[index];
  const updated: PersistedAssetRecord = {
    ...current,
    ...input,
    symbol: current.symbol,
    updatedAt: new Date().toISOString(),
  };

  data.assets[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}
