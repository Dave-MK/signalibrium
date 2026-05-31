import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedTradeTicket } from "../workspace-types";

export async function listTradeTickets() {
  const data = await readWorkspaceData();
  return data.tradeTickets;
}

export async function getTradeTicketById(ticketId: string) {
  const data = await readWorkspaceData();
  return data.tradeTickets.find((ticket) => ticket.id === ticketId) ?? null;
}

export async function createTradeTicket(
  input: Omit<PersistedTradeTicket, "id" | "createdAt" | "updatedAt">,
) {
  const data = await readWorkspaceData();
  const now = new Date().toISOString();
  const nextTicket: PersistedTradeTicket = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  data.tradeTickets.push(nextTicket);
  await writeWorkspaceData(data);

  return nextTicket;
}

export async function updateTradeTicket(
  ticketId: string,
  input: Partial<Omit<PersistedTradeTicket, "id" | "createdAt" | "updatedAt">>,
) {
  const data = await readWorkspaceData();
  const index = data.tradeTickets.findIndex((ticket) => ticket.id === ticketId);

  if (index === -1) {
    return null;
  }

  const current = data.tradeTickets[index];
  const updated: PersistedTradeTicket = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  };

  data.tradeTickets[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function deleteTradeTicket(ticketId: string) {
  const data = await readWorkspaceData();
  const index = data.tradeTickets.findIndex((ticket) => ticket.id === ticketId);

  if (index === -1) {
    return false;
  }

  data.tradeTickets.splice(index, 1);
  await writeWorkspaceData(data);

  return true;
}
