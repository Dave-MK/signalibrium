import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { BrokerEnvironment, BrokerProvider, PersistedBrokerConnection } from "../workspace-types";

export async function listBrokerConnections(): Promise<PersistedBrokerConnection[]> {
  const data = await readWorkspaceData();
  return data.brokerConnections;
}

export async function getBrokerConnectionById(
  connectionId: string,
): Promise<PersistedBrokerConnection | null> {
  const data = await readWorkspaceData();
  return data.brokerConnections.find((c) => c.id === connectionId) ?? null;
}

export type CreateBrokerConnectionInput = {
  provider: BrokerProvider;
  environment: BrokerEnvironment;
  label: string;
  accountRef: string | null;
  status: PersistedBrokerConnection["status"];
};

export async function createBrokerConnection(
  input: CreateBrokerConnectionInput,
): Promise<PersistedBrokerConnection> {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();

  const executionMode: PersistedBrokerConnection["executionModes"][number] =
    input.provider === "Alpaca"
      ? input.environment === "live" ? "Alpaca Live" : "Alpaca Demo"
      : input.provider === "OANDA"
        ? input.environment === "live" ? "OANDA Live" : "OANDA Demo"
        : input.provider === "Binance"
          ? "Binance Spot"
          : input.provider === "Kraken"
            ? "Kraken Spot"
            : input.environment === "live" ? "IBKR Live" : "IBKR Demo";

  const connection: PersistedBrokerConnection = {
    id: crypto.randomUUID(),
    provider: input.provider,
    environment: input.environment,
    label: input.label,
    status: input.status,
    accountRef: input.accountRef,
    executionModes: [executionMode],
    lastError: null,
    lastSyncedAt: input.status === "connected" ? now : null,
    createdAt: now,
    updatedAt: now,
  };

  data.brokerConnections.push(connection);
  await writeWorkspaceData(data);

  return connection;
}

export async function updateBrokerConnection(
  connectionId: string,
  patch: Partial<
    Pick<
      PersistedBrokerConnection,
      "label" | "status" | "accountRef" | "lastError" | "lastSyncedAt" | "executionModes"
    >
  >,
): Promise<PersistedBrokerConnection | null> {
  const data = await readWorkspaceData();
  const index = data.brokerConnections.findIndex((c) => c.id === connectionId);

  if (index === -1) return null;

  const current = data.brokerConnections[index];
  const updated: PersistedBrokerConnection = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  data.brokerConnections[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function deleteBrokerConnection(connectionId: string): Promise<boolean> {
  const data = await readWorkspaceData();
  const index = data.brokerConnections.findIndex((c) => c.id === connectionId);

  if (index === -1) return false;

  data.brokerConnections.splice(index, 1);
  await writeWorkspaceData(data);

  return true;
}
