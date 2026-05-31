import type {
  PersistedAssetRecord,
  PersistedBacktestRecord,
  PersistedJournalEntry,
  PersistedMarketSnapshot,
  PersistedScannerResult,
  PersistedTradeTicket,
  PersistedWatchlist,
} from "./workspace-types";

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

function asNumberArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number" || Number.isNaN(item))) {
    throw new Error(`Invalid ${field}`);
  }

  return value;
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

export function parseCreateAssetInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  return {
    symbol: asString(body.symbol, "symbol").toUpperCase(),
    name: asString(body.name, "name"),
    assetClass: asLiteral(body.assetClass, "assetClass", ["Crypto", "ETF", "Equity"] as const),
    price: asNumber(body.price, "price"),
    change24h: asNumber(body.change24h, "change24h"),
    regime: asLiteral(body.regime, "regime", ["Risk-On", "Balanced", "Risk-Off"] as const),
    activeStrategy: asString(body.activeStrategy, "activeStrategy"),
    score: asNumber(body.score, "score"),
    tradeable: body.tradeable === true,
    liquidity: asLiteral(body.liquidity, "liquidity", ["High", "Moderate", "Thin"] as const),
    volatility: asLiteral(body.volatility, "volatility", ["Contained", "Elevated", "Fast"] as const),
    atr: asNumber(body.atr, "atr"),
    forecast: asString(body.forecast, "forecast"),
    aiBias: asString(body.aiBias, "aiBias"),
    sparkline: asNumberArray(body.sparkline, "sparkline"),
    source: asLiteral(body.source, "source", ["seed", "manual", "sync"] as const),
    lastSyncedAt: asString(body.lastSyncedAt, "lastSyncedAt"),
  } satisfies Omit<PersistedAssetRecord, "createdAt" | "updatedAt">;
}

export function parseUpdateAssetInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  const next: Partial<Omit<PersistedAssetRecord, "createdAt" | "updatedAt">> = {};

  if ("name" in body) next.name = asString(body.name, "name");
  if ("assetClass" in body) {
    next.assetClass = asLiteral(body.assetClass, "assetClass", ["Crypto", "ETF", "Equity"] as const);
  }
  if ("price" in body) next.price = asNumber(body.price, "price");
  if ("change24h" in body) next.change24h = asNumber(body.change24h, "change24h");
  if ("regime" in body) {
    next.regime = asLiteral(body.regime, "regime", ["Risk-On", "Balanced", "Risk-Off"] as const);
  }
  if ("activeStrategy" in body) next.activeStrategy = asString(body.activeStrategy, "activeStrategy");
  if ("score" in body) next.score = asNumber(body.score, "score");
  if ("tradeable" in body) next.tradeable = body.tradeable === true;
  if ("liquidity" in body) {
    next.liquidity = asLiteral(body.liquidity, "liquidity", ["High", "Moderate", "Thin"] as const);
  }
  if ("volatility" in body) {
    next.volatility = asLiteral(body.volatility, "volatility", ["Contained", "Elevated", "Fast"] as const);
  }
  if ("atr" in body) next.atr = asNumber(body.atr, "atr");
  if ("forecast" in body) next.forecast = asString(body.forecast, "forecast");
  if ("aiBias" in body) next.aiBias = asString(body.aiBias, "aiBias");
  if ("sparkline" in body) next.sparkline = asNumberArray(body.sparkline, "sparkline");
  if ("source" in body) {
    next.source = asLiteral(body.source, "source", ["seed", "manual", "sync"] as const);
  }
  if ("lastSyncedAt" in body) next.lastSyncedAt = asString(body.lastSyncedAt, "lastSyncedAt");

  return next;
}

export function parseCreateScannerResultInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  return {
    id: asString(body.id, "id"),
    symbol: asString(body.symbol, "symbol").toUpperCase(),
    strategy: asString(body.strategy, "strategy"),
    timeframe: asString(body.timeframe, "timeframe"),
    score: asNumber(body.score, "score"),
    riskScore: asNumber(body.riskScore, "riskScore"),
    regime: asLiteral(body.regime, "regime", ["Risk-On", "Balanced", "Risk-Off"] as const),
    entryZone: asString(body.entryZone, "entryZone"),
    stopLoss: asString(body.stopLoss, "stopLoss"),
    takeProfit: asString(body.takeProfit, "takeProfit"),
    riskReward: asNumber(body.riskReward, "riskReward"),
    liquidityStatus: asLiteral(body.liquidityStatus, "liquidityStatus", ["High", "Moderate", "Thin"] as const),
    tradeability: asLiteral(body.tradeability, "tradeability", ["TRADEABLE", "WATCH", "BLOCKED"] as const),
    assetClass: asLiteral(body.assetClass, "assetClass", ["Crypto", "ETF", "Equity"] as const),
    thesis: asString(body.thesis, "thesis"),
    linkedAssetSymbol: asString(body.linkedAssetSymbol, "linkedAssetSymbol").toUpperCase(),
    linkedBacktestId: asNullableString(body.linkedBacktestId),
  } satisfies Omit<PersistedScannerResult, "createdAt" | "updatedAt">;
}

export function parseUpdateScannerResultInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  const next: Partial<Omit<PersistedScannerResult, "createdAt" | "updatedAt">> = {};

  if ("symbol" in body) next.symbol = asString(body.symbol, "symbol").toUpperCase();
  if ("strategy" in body) next.strategy = asString(body.strategy, "strategy");
  if ("timeframe" in body) next.timeframe = asString(body.timeframe, "timeframe");
  if ("score" in body) next.score = asNumber(body.score, "score");
  if ("riskScore" in body) next.riskScore = asNumber(body.riskScore, "riskScore");
  if ("regime" in body) {
    next.regime = asLiteral(body.regime, "regime", ["Risk-On", "Balanced", "Risk-Off"] as const);
  }
  if ("entryZone" in body) next.entryZone = asString(body.entryZone, "entryZone");
  if ("stopLoss" in body) next.stopLoss = asString(body.stopLoss, "stopLoss");
  if ("takeProfit" in body) next.takeProfit = asString(body.takeProfit, "takeProfit");
  if ("riskReward" in body) next.riskReward = asNumber(body.riskReward, "riskReward");
  if ("liquidityStatus" in body) {
    next.liquidityStatus = asLiteral(body.liquidityStatus, "liquidityStatus", ["High", "Moderate", "Thin"] as const);
  }
  if ("tradeability" in body) {
    next.tradeability = asLiteral(body.tradeability, "tradeability", ["TRADEABLE", "WATCH", "BLOCKED"] as const);
  }
  if ("assetClass" in body) {
    next.assetClass = asLiteral(body.assetClass, "assetClass", ["Crypto", "ETF", "Equity"] as const);
  }
  if ("thesis" in body) next.thesis = asString(body.thesis, "thesis");
  if ("linkedAssetSymbol" in body) next.linkedAssetSymbol = asString(body.linkedAssetSymbol, "linkedAssetSymbol").toUpperCase();
  if ("linkedBacktestId" in body) next.linkedBacktestId = asNullableString(body.linkedBacktestId);

  return next;
}

export function parseCreateBacktestInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  return {
    id: asString(body.id, "id"),
    asset: asString(body.asset, "asset").toUpperCase(),
    strategy: asString(body.strategy, "strategy"),
    totalReturn: asNumber(body.totalReturn, "totalReturn"),
    annualisedReturn: asNumber(body.annualisedReturn, "annualisedReturn"),
    winRate: asNumber(body.winRate, "winRate"),
    maxDrawdown: asNumber(body.maxDrawdown, "maxDrawdown"),
    profitFactor: asNumber(body.profitFactor, "profitFactor"),
    sharpe: asNumber(body.sharpe, "sharpe"),
    warnings: body.warnings ? asStringArray(body.warnings, "warnings") : [],
    equityCurve: asNumberArray(body.equityCurve, "equityCurve"),
    drawdownCurve: asNumberArray(body.drawdownCurve, "drawdownCurve"),
    timeframe: asString(body.timeframe, "timeframe"),
    dateRange: asString(body.dateRange, "dateRange"),
    startingCapital: asNumber(body.startingCapital, "startingCapital"),
    feesBps: asNumber(body.feesBps, "feesBps"),
    slippageBps: asNumber(body.slippageBps, "slippageBps"),
    aiRead: asString(body.aiRead, "aiRead"),
    status: asLiteral(body.status, "status", ["BACKTESTED", "DRAFT"] as const),
    linkedAssetSymbol: asString(body.linkedAssetSymbol, "linkedAssetSymbol").toUpperCase(),
    linkedScannerResultId: asNullableString(body.linkedScannerResultId),
  } satisfies Omit<PersistedBacktestRecord, "createdAt" | "updatedAt">;
}

export function parseUpdateBacktestInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  const next: Partial<Omit<PersistedBacktestRecord, "createdAt" | "updatedAt">> = {};

  if ("asset" in body) next.asset = asString(body.asset, "asset").toUpperCase();
  if ("strategy" in body) next.strategy = asString(body.strategy, "strategy");
  if ("totalReturn" in body) next.totalReturn = asNumber(body.totalReturn, "totalReturn");
  if ("annualisedReturn" in body) next.annualisedReturn = asNumber(body.annualisedReturn, "annualisedReturn");
  if ("winRate" in body) next.winRate = asNumber(body.winRate, "winRate");
  if ("maxDrawdown" in body) next.maxDrawdown = asNumber(body.maxDrawdown, "maxDrawdown");
  if ("profitFactor" in body) next.profitFactor = asNumber(body.profitFactor, "profitFactor");
  if ("sharpe" in body) next.sharpe = asNumber(body.sharpe, "sharpe");
  if ("warnings" in body) next.warnings = asStringArray(body.warnings, "warnings");
  if ("equityCurve" in body) next.equityCurve = asNumberArray(body.equityCurve, "equityCurve");
  if ("drawdownCurve" in body) next.drawdownCurve = asNumberArray(body.drawdownCurve, "drawdownCurve");
  if ("timeframe" in body) next.timeframe = asString(body.timeframe, "timeframe");
  if ("dateRange" in body) next.dateRange = asString(body.dateRange, "dateRange");
  if ("startingCapital" in body) next.startingCapital = asNumber(body.startingCapital, "startingCapital");
  if ("feesBps" in body) next.feesBps = asNumber(body.feesBps, "feesBps");
  if ("slippageBps" in body) next.slippageBps = asNumber(body.slippageBps, "slippageBps");
  if ("aiRead" in body) next.aiRead = asString(body.aiRead, "aiRead");
  if ("status" in body) next.status = asLiteral(body.status, "status", ["BACKTESTED", "DRAFT"] as const);
  if ("linkedAssetSymbol" in body) next.linkedAssetSymbol = asString(body.linkedAssetSymbol, "linkedAssetSymbol").toUpperCase();
  if ("linkedScannerResultId" in body) next.linkedScannerResultId = asNullableString(body.linkedScannerResultId);

  return next;
}

export function parseUpdateMarketSnapshotInput(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Invalid body");
  }

  const next: Partial<Omit<PersistedMarketSnapshot, "id" | "createdAt" | "updatedAt">> = {};

  if ("state" in body) next.state = asString(body.state, "state");
  if ("description" in body) next.description = asString(body.description, "description");
  if ("breadthScore" in body) next.breadthScore = asNumber(body.breadthScore, "breadthScore");
  if ("tradeableSetups" in body) next.tradeableSetups = asNumber(body.tradeableSetups, "tradeableSetups");
  if ("blockedSetups" in body) next.blockedSetups = asNumber(body.blockedSetups, "blockedSetups");
  if ("watchlistMove" in body) next.watchlistMove = asNumber(body.watchlistMove, "watchlistMove");
  if ("simulatedEquity" in body) next.simulatedEquity = asNumber(body.simulatedEquity, "simulatedEquity");
  if ("openRisk" in body) next.openRisk = asNumber(body.openRisk, "openRisk");
  if ("lastRefresh" in body) next.lastRefresh = asString(body.lastRefresh, "lastRefresh");
  if ("journalReminder" in body) next.journalReminder = asString(body.journalReminder, "journalReminder");

  return next;
}
