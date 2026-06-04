import { readWorkspaceData } from "../workspace-store";

export async function getSiggiAccount() {
  const data = await readWorkspaceData();

  return data.siggiAccount;
}
