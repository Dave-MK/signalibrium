import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedScannerResult } from "../workspace-types";

const tradeabilityRank: Record<PersistedScannerResult["tradeability"], number> = {
  TRADEABLE: 3,
  WATCH: 2,
  BLOCKED: 1,
};

function getTimestampScore(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareScannerResults(left: PersistedScannerResult, right: PersistedScannerResult) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (tradeabilityRank[right.tradeability] !== tradeabilityRank[left.tradeability]) {
    return tradeabilityRank[right.tradeability] - tradeabilityRank[left.tradeability];
  }

  const rightTimeScore = Math.max(
    getTimestampScore(right.analysisUpdatedAt),
    getTimestampScore(right.updatedAt),
    getTimestampScore(right.createdAt),
  );
  const leftTimeScore = Math.max(
    getTimestampScore(left.analysisUpdatedAt),
    getTimestampScore(left.updatedAt),
    getTimestampScore(left.createdAt),
  );

  return rightTimeScore - leftTimeScore;
}

function selectBestScannerResultsPerSymbol(results: PersistedScannerResult[]) {
  const bestBySymbol = new Map<string, PersistedScannerResult>();

  for (const result of results) {
    const current = bestBySymbol.get(result.symbol);

    if (!current || compareScannerResults(current, result) > 0) {
      bestBySymbol.set(result.symbol, result);
    }
  }

  return [...bestBySymbol.values()].sort(compareScannerResults);
}

export async function listScannerResults() {
  const data = await readWorkspaceData();
  return selectBestScannerResultsPerSymbol(data.scannerResults);
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
