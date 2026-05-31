import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedScannerResult } from "../workspace-types";

export async function listScannerResults() {
  const data = await readWorkspaceData();
  return data.scannerResults;
}

export async function getScannerResultById(resultId: string) {
  const data = await readWorkspaceData();
  return data.scannerResults.find((result) => result.id === resultId) ?? null;
}

export async function createScannerResult(
  input: Omit<PersistedScannerResult, "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextResult: PersistedScannerResult = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.scannerResults.push(nextResult);
  await writeWorkspaceData(data);

  return nextResult;
}

export async function updateScannerResult(
  resultId: string,
  input: Partial<Omit<PersistedScannerResult, "createdAt" | "updatedAt">>,
) {
  const data = await readWorkspaceData();
  const index = data.scannerResults.findIndex((result) => result.id === resultId);

  if (index === -1) {
    return null;
  }

  const current = data.scannerResults[index];
  const updated: PersistedScannerResult = {
    ...current,
    ...input,
    id: current.id,
    updatedAt: new Date().toISOString(),
  };

  data.scannerResults[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function deleteScannerResult(resultId: string) {
  const data = await readWorkspaceData();
  const index = data.scannerResults.findIndex((result) => result.id === resultId);

  if (index === -1) {
    return false;
  }

  data.scannerResults.splice(index, 1);
  await writeWorkspaceData(data);

  return true;
}
