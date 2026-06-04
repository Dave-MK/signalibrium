import { readWorkspaceData } from "../workspace-store";

export async function listPredictionHistory() {
  const data = await readWorkspaceData();

  return [...data.predictionHistory].sort(
    (left, right) => Date.parse(right.calledAt) - Date.parse(left.calledAt),
  );
}
