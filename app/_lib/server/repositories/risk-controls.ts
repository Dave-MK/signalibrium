/**
 * Risk controls repository.
 *
 * Reads and writes the `riskControls` slice of workspace data.
 * The controls drive Siggi's simulation guard-rails (max risk per trade,
 * cash reserve ratio, concurrent trade cap, etc.).
 */

import { readWorkspaceData, writeWorkspaceData } from "@/app/_lib/server/workspace-store";
import { DEFAULT_RISK_CONTROLS } from "@/app/_lib/server/workspace-types";
import type { PersistedRiskControls } from "@/app/_lib/server/workspace-types";

export async function getRiskControls(): Promise<PersistedRiskControls> {
  const data = await readWorkspaceData();
  return data.riskControls ?? DEFAULT_RISK_CONTROLS;
}

export type UpdateRiskControlsInput = Partial<PersistedRiskControls>;

export async function updateRiskControls(
  patch: UpdateRiskControlsInput,
): Promise<PersistedRiskControls> {
  const data = await readWorkspaceData();
  const now  = new Date().toISOString();

  const updated: PersistedRiskControls = {
    ...(data.riskControls ?? DEFAULT_RISK_CONTROLS),
    ...patch,
  };

  data.riskControls = updated;
  data.updatedAt    = now;

  await writeWorkspaceData(data);
  return updated;
}
