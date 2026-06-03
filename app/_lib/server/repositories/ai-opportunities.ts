import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedAiOpportunity } from "../workspace-types";

export async function listAiOpportunities() {
  const data = await readWorkspaceData();
  return data.aiOpportunities;
}

export async function getAiOpportunityById(opportunityId: string) {
  const data = await readWorkspaceData();
  return data.aiOpportunities.find((opportunity) => opportunity.id === opportunityId) ?? null;
}

export async function createAiOpportunity(
  input: Omit<PersistedAiOpportunity, "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextOpportunity: PersistedAiOpportunity = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.aiOpportunities.unshift(nextOpportunity);
  await writeWorkspaceData(data);

  return nextOpportunity;
}
