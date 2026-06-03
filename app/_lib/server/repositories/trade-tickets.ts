import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type { PersistedTradeTicket } from "../workspace-types";
import { getAssetBySymbol } from "./assets";

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

function buildPaperReference(ticket: PersistedTradeTicket) {
  return `paper-${ticket.symbol.toLowerCase()}-${ticket.id.slice(0, 8)}`;
}

function getExecutionDirectionMultiplier(ticket: PersistedTradeTicket) {
  return ticket.side === "Long" ? 1 : -1;
}

function buildPaperFillPrice(ticket: PersistedTradeTicket) {
  const slippageFactor = ticket.orderType === "Market" ? 0.0008 : 0.00025;
  const directionalSlippage = ticket.entry * slippageFactor * getExecutionDirectionMultiplier(ticket);
  const fillPrice = ticket.side === "Long"
    ? ticket.entry + directionalSlippage
    : ticket.entry - directionalSlippage;

  return Number(fillPrice.toFixed(4));
}

export async function submitTradeTicket(ticketId: string) {
  const data = await readWorkspaceData();
  const index = data.tradeTickets.findIndex((ticket) => ticket.id === ticketId);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const current = data.tradeTickets[index];
  const nextStatus = current.orderType === "Market" ? "Filled" : "Working";
  const fillPrice = current.orderType === "Market" ? buildPaperFillPrice(current) : null;

  const updated: PersistedTradeTicket = {
    ...current,
    status: nextStatus,
    brokerStatus: current.orderType === "Market" ? "Filled" : "Working",
    brokerReference: current.brokerReference ?? buildPaperReference(current),
    submittedAt: now,
    filledAt: current.orderType === "Market" ? now : current.filledAt,
    executedEntry: current.orderType === "Market" ? fillPrice : current.executedEntry,
    executedQuantity: current.orderType === "Market" ? current.quantity : current.executedQuantity,
    unrealizedPnl: current.orderType === "Market" ? 0 : current.unrealizedPnl,
    updatedAt: now,
  };

  data.tradeTickets[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function fillTradeTicket(ticketId: string) {
  const data = await readWorkspaceData();
  const index = data.tradeTickets.findIndex((ticket) => ticket.id === ticketId);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const current = data.tradeTickets[index];
  const executedEntry = buildPaperFillPrice(current);

  const updated: PersistedTradeTicket = {
    ...current,
    status: "Filled",
    brokerStatus: "Filled",
    brokerReference: current.brokerReference ?? buildPaperReference(current),
    submittedAt: current.submittedAt ?? now,
    filledAt: now,
    executedEntry,
    executedQuantity: current.quantity,
    unrealizedPnl: 0,
    updatedAt: now,
  };

  data.tradeTickets[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function cancelTradeTicket(ticketId: string) {
  const data = await readWorkspaceData();
  const index = data.tradeTickets.findIndex((ticket) => ticket.id === ticketId);

  if (index === -1) {
    return null;
  }

  const current = data.tradeTickets[index];
  const updated: PersistedTradeTicket = {
    ...current,
    status: "Cancelled",
    brokerStatus: "Cancelled",
    updatedAt: new Date().toISOString(),
  };

  data.tradeTickets[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}

export async function closeTradeTicket(ticketId: string) {
  const data = await readWorkspaceData();
  const index = data.tradeTickets.findIndex((ticket) => ticket.id === ticketId);

  if (index === -1) {
    return null;
  }

  const current = data.tradeTickets[index];
  const asset = await getAssetBySymbol(current.symbol);
  const closePrice = asset?.price ?? current.takeProfit;
  const executedEntry = current.executedEntry ?? current.entry;
  const executedQuantity = current.executedQuantity ?? current.quantity;
  const grossMove =
    current.side === "Long"
      ? closePrice - executedEntry
      : executedEntry - closePrice;
  const realizedPnl = Number((grossMove * executedQuantity).toFixed(2));
  const now = new Date().toISOString();

  const updated: PersistedTradeTicket = {
    ...current,
    status: "Closed",
    brokerStatus: "Closed",
    closedAt: now,
    realizedPnl,
    unrealizedPnl: 0,
    updatedAt: now,
  };

  data.tradeTickets[index] = updated;
  await writeWorkspaceData(data);

  return updated;
}
