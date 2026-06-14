import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedTradeTicket } from "../workspace-types";
import type { TradeTicket } from "@/app/_data/mock-data";

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listTradeTickets(): Promise<PersistedTradeTicket[]> {
  const data = await readWorkspaceData();
  return [...(data.tradeTickets ?? [])].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export async function getTradeTicketById(ticketId: string): Promise<PersistedTradeTicket | null> {
  const data = await readWorkspaceData();
  return (data.tradeTickets ?? []).find((t) => t.id === ticketId) ?? null;
}

// ── Create ────────────────────────────────────────────────────────────────────

export type CreateTradeTicketInput = Omit<TradeTicket, "id"> & {
  sourceAssetSymbol?: string | null;
  sourceSetupId?: string | null;
  notes?: string;
};

export async function createTradeTicket(
  input: CreateTradeTicketInput,
): Promise<PersistedTradeTicket> {
  const data = await readWorkspaceData();
  const now  = new Date().toISOString();

  const ticket: PersistedTradeTicket = {
    ...input,
    id:                 crypto.randomUUID(),
    sourceAssetSymbol:  input.sourceAssetSymbol ?? null,
    sourceSetupId:      input.sourceSetupId     ?? null,
    notes:              input.notes             ?? "",
    createdAt:          now,
    updatedAt:          now,
  };

  if (!data.tradeTickets) (data as Record<string, unknown>).tradeTickets = [];
  data.tradeTickets.push(ticket);
  await writeWorkspaceData(data);

  return ticket;
}

// ── Update ────────────────────────────────────────────────────────────────────

export type UpdateTradeTicketInput = Partial<
  Pick<
    PersistedTradeTicket,
    | "status"
    | "brokerStatus"
    | "brokerReference"
    | "brokerDealId"
    | "brokerConnectionId"
    | "submittedAt"
    | "filledAt"
    | "closedAt"
    | "executedEntry"
    | "executedQuantity"
    | "realizedPnl"
    | "unrealizedPnl"
    | "notes"
    | "entry"
    | "stopLoss"
    | "takeProfit"
    | "quantity"
    | "estimatedValue"
    | "plannedLoss"
    | "potentialGain"
    | "riskReward"
  >
>;

export async function updateTradeTicket(
  ticketId: string,
  patch: UpdateTradeTicketInput,
): Promise<PersistedTradeTicket | null> {
  const data  = await readWorkspaceData();
  const index = (data.tradeTickets ?? []).findIndex((t) => t.id === ticketId);

  if (index === -1) return null;

  const updated: PersistedTradeTicket = {
    ...data.tradeTickets[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  data.tradeTickets[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteTradeTicket(ticketId: string): Promise<boolean> {
  const data  = await readWorkspaceData();
  const index = (data.tradeTickets ?? []).findIndex((t) => t.id === ticketId);

  if (index === -1) return false;

  data.tradeTickets.splice(index, 1);
  await writeWorkspaceData(data);

  return true;
}

// ── Apply broker result ───────────────────────────────────────────────────────
// Called after a successful order submission to stamp the broker reference.

export type BrokerSubmitResult = {
  orderId: string;
  status: "submitted" | "filled" | "working" | "pending";
  filledQuantity?: number;
  filledPrice?: number;
  connectionId?: string;
};

export async function applyBrokerResultToTicket(
  ticketId: string,
  result: BrokerSubmitResult,
): Promise<PersistedTradeTicket | null> {
  const now    = new Date().toISOString();
  const status = result.status === "filled" ? "Filled" as const
    : result.status === "working"  ? "Working"    as const
    : result.status === "pending"  ? "Submitted"  as const
    : "Submitted" as const;

  return updateTradeTicket(ticketId, {
    status,
    brokerStatus:      status === "Filled" ? "Filled" : "Working",
    brokerReference:   result.orderId,
    brokerConnectionId: result.connectionId ?? undefined,
    submittedAt:       now,
    filledAt:          result.status === "filled" ? now : null,
    executedEntry:     result.filledPrice ?? null,
    executedQuantity:  result.filledQuantity ?? null,
  });
}
