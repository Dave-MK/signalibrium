import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedMarketSnapshot } from "../workspace-types";

export async function getMarketSnapshot() {
  const data = await readWorkspaceData();
  return data.marketSnapshot;
}

export async function updateMarketSnapshot(
  input: Partial<Omit<PersistedMarketSnapshot, "id" | "createdAt" | "updatedAt">>,
) {
  const data = await readWorkspaceData();
  const updated: PersistedMarketSnapshot = {
    ...data.marketSnapshot,
    ...input,
    id: data.marketSnapshot.id,
    createdAt: data.marketSnapshot.createdAt,
    updatedAt: new Date().toISOString(),
  };

  data.marketSnapshot = updated;
  await writeWorkspaceData(data);

  return updated;
}
