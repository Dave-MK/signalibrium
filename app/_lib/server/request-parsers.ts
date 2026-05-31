import type { PersistedJournalEntry, PersistedTradeTicket, PersistedWatchlist } from "./workspace-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }

  return value.trim();
}

function asOptionalString(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return asString(value, "string");
}

function asNullableString(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return asString(value, "string");
}

function asNumber(value: unknown, field: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid ${field}`);
  }

  return value;
}

function asStringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid ${field}`);
  }

  return [...new Set(value.map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function asLiteral<T extends readonly string[]>(value: unknown, field: string, options: T) {
  if (typeof value !== "string" || !options.includes(value)) {
    throw new Error(`Invalid ${field}`);
  }

  return value as T[number];
}

function asGateResults(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Invalid gateResults");
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid gateResults");
    }

    return {
      label: asString(item.label, "gateResults.label"),
      status: asLiteral(item.status, "gateResults.status", ["PASS", "WARN", "FAIL"] as const),
      detail: asString(item.detail, "gateResults.detail"),
    };
  });
}

export function parseCreateWatchlistInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  return {
    name: asString(body.name, "name"),
    description: typeof body.description === "string" ? body.description.trim() : "",
    itemSymbols: body.itemSymbols ? asStringArray(body.itemSymbols, "itemSymbols") : [],
    isDefault: body.isDefault === true,
  } satisfies Omit<PersistedWatchlist, "id" | "createdAt" | "updatedAt">;
}

export function parseUpdateWatchlistInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  const next: Partial<Omit<PersistedWatchlist, "id" | "createdAt" | "updatedAt">> = {};

  if ("name" in body) {
    next.name = asString(body.name, "name");
  }

  if ("description" in body) {
    next.description = typeof body.description === "string" ? body.description.trim() : "";
  }

  if ("itemSymbols" in body) {
    next.itemSymbols = asStringArray(body.itemSymbols, "itemSymbols");
  }

  if ("isDefault" in body) {
    next.isDefault = body.isDefault === true;
  }

  return next;
}

export function parseCreateTradeTicketInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  return {
    symbol: asString(body.symbol, "symbol").toUpperCase(),
    strategy: asString(body.strategy, "strategy"),
    side: asLiteral(body.side, "side", ["Long", "Short"] as const),
    orderType: asLiteral(body.orderType, "orderType", ["Limit", "Market"] as const),
    entry: asNumber(body.entry, "entry"),
    stopLoss: asNumber(body.stopLoss, "stopLoss"),
    takeProfit: asNumber(body.takeProfit, "takeProfit"),
    quantity: asNumber(body.quantity, "quantity"),
    estimatedValue: asNumber(body.estimatedValue, "estimatedValue"),
    plannedLoss: asNumber(body.plannedLoss, "plannedLoss"),
    potentialGain: asNumber(body.potentialGain, "potentialGain"),
    riskReward: asNumber(body.riskReward, "riskReward"),
    status: asLiteral(
      body.status,
      "status",
      ["Prepared", "Simulated Open", "Closed"] as const,
    ),
    rationale: asString(body.rationale, "rationale"),
    gateResults: asGateResults(body.gateResults),
    sourceAssetSymbol: asNullableString(body.sourceAssetSymbol ?? body.symbol),
    sourceSetupId: asNullableString(body.sourceSetupId),
    notes: typeof body.notes === "string" ? body.notes.trim() : "",
  } satisfies Omit<PersistedTradeTicket, "id" | "createdAt" | "updatedAt">;
}

export function parseUpdateTradeTicketInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  const next: Partial<Omit<PersistedTradeTicket, "id" | "createdAt" | "updatedAt">> = {};

  if ("symbol" in body) next.symbol = asString(body.symbol, "symbol").toUpperCase();
  if ("strategy" in body) next.strategy = asString(body.strategy, "strategy");
  if ("side" in body) next.side = asLiteral(body.side, "side", ["Long", "Short"] as const);
  if ("orderType" in body) {
    next.orderType = asLiteral(body.orderType, "orderType", ["Limit", "Market"] as const);
  }
  if ("entry" in body) next.entry = asNumber(body.entry, "entry");
  if ("stopLoss" in body) next.stopLoss = asNumber(body.stopLoss, "stopLoss");
  if ("takeProfit" in body) next.takeProfit = asNumber(body.takeProfit, "takeProfit");
  if ("quantity" in body) next.quantity = asNumber(body.quantity, "quantity");
  if ("estimatedValue" in body) next.estimatedValue = asNumber(body.estimatedValue, "estimatedValue");
  if ("plannedLoss" in body) next.plannedLoss = asNumber(body.plannedLoss, "plannedLoss");
  if ("potentialGain" in body) next.potentialGain = asNumber(body.potentialGain, "potentialGain");
  if ("riskReward" in body) next.riskReward = asNumber(body.riskReward, "riskReward");
  if ("status" in body) {
    next.status = asLiteral(
      body.status,
      "status",
      ["Prepared", "Simulated Open", "Closed"] as const,
    );
  }
  if ("rationale" in body) next.rationale = asString(body.rationale, "rationale");
  if ("gateResults" in body) next.gateResults = asGateResults(body.gateResults);
  if ("sourceAssetSymbol" in body) next.sourceAssetSymbol = asNullableString(body.sourceAssetSymbol);
  if ("sourceSetupId" in body) next.sourceSetupId = asNullableString(body.sourceSetupId);
  if ("notes" in body) next.notes = asOptionalString(body.notes) ?? "";

  return next;
}

export function parseCreateJournalEntryInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  return {
    date: asString(body.date, "date"),
    asset: asString(body.asset, "asset").toUpperCase(),
    status: asLiteral(
      body.status,
      "status",
      [
        "Planned",
        "Simulated",
        "Taken",
        "Skipped",
        "Closed",
        "Stopped Out",
        "Target Hit",
      ] as const,
    ),
    pnl: asNumber(body.pnl, "pnl"),
    notes: asString(body.notes, "notes"),
    emotionTags: body.emotionTags ? asStringArray(body.emotionTags, "emotionTags") : [],
    aiReview: asString(body.aiReview, "aiReview"),
    ticketId: asNullableString(body.ticketId),
  } satisfies Omit<PersistedJournalEntry, "id" | "createdAt" | "updatedAt">;
}

export function parseUpdateJournalEntryInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  const next: Partial<Omit<PersistedJournalEntry, "id" | "createdAt" | "updatedAt">> = {};

  if ("date" in body) next.date = asString(body.date, "date");
  if ("asset" in body) next.asset = asString(body.asset, "asset").toUpperCase();
  if ("status" in body) {
    next.status = asLiteral(
      body.status,
      "status",
      [
        "Planned",
        "Simulated",
        "Taken",
        "Skipped",
        "Closed",
        "Stopped Out",
        "Target Hit",
      ] as const,
    );
  }
  if ("pnl" in body) next.pnl = asNumber(body.pnl, "pnl");
  if ("notes" in body) next.notes = asString(body.notes, "notes");
  if ("emotionTags" in body) next.emotionTags = asStringArray(body.emotionTags, "emotionTags");
  if ("aiReview" in body) next.aiReview = asString(body.aiReview, "aiReview");
  if ("ticketId" in body) next.ticketId = asNullableString(body.ticketId);

  return next;
}
