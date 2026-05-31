import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedBacktestRecord } from "../workspace-types";

export async function listBacktests() {
  const data = await readWorkspaceData();
  return data.backtests;
}

export async function getBacktestById(backtestId: string) {
  const data = await readWorkspaceData();
  return data.backtests.find((backtest) => backtest.id === backtestId) ?? null;
}

export async function createBacktest(
  input: Omit<PersistedBacktestRecord, "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextBacktest: PersistedBacktestRecord = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.backtests.push(nextBacktest);
  await writeWorkspaceData(data);

  return nextBacktest;
}

export async function updateBacktest(
  backtestId: string,
  input: Partial<Omit<PersistedBacktestRecord, "createdAt" | "updatedAt">>,
) {
  const data = await readWorkspaceData();
  const index = data.backtests.findIndex((backtest) => backtest.id === backtestId);

  if (index === -1) {
    return null;
  }

  const current = data.backtests[index];
  const updated: PersistedBacktestRecord = {
    ...current,
    ...input,
    id: current.id,
    updatedAt: new Date().toISOString(),
  };

  data.backtests[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function deleteBacktest(backtestId: string) {
  const data = await readWorkspaceData();
  const index = data.backtests.findIndex((backtest) => backtest.id === backtestId);

  if (index === -1) {
    return false;
  }

  data.backtests.splice(index, 1);
  await writeWorkspaceData(data);

  return true;
}
