import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedConfirmationCheck } from "../workspace-types";

export async function listConfirmationChecks() {
  const data = await readWorkspaceData();
  return data.confirmationChecks;
}

export async function getConfirmationCheckById(checkId: string) {
  const data = await readWorkspaceData();
  return data.confirmationChecks.find((check) => check.id === checkId) ?? null;
}

export async function createConfirmationCheck(
  input: Omit<PersistedConfirmationCheck, "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextCheck: PersistedConfirmationCheck = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.confirmationChecks.unshift(nextCheck);
  await writeWorkspaceData(data);

  return nextCheck;
}

