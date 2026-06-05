import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultWorkspaceData } from "@/app/_lib/server/workspace-seed";
import type {
  PersistedAssetRecord,
  PersistedBrokerConnection,
  OpportunityAnalysisSnapshot,
  PersistedPredictionHistoryRecord,
  PersistedScannerResult,
  PersistedSiggiAccount,
  PersistedSiggiActivity,
  PersistedSiggiEquitySnapshot,
  PersistedSiggiTrade,
  PersistedTradeTicket,
  PersistedWorkspaceData,
} from "./workspace-types";

const dataDirectory = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const defaultStorePath = path.join(dataDirectory, "workspace.json");
let pendingWrite = Promise.resolve();

type LegacyTradeTicket = Omit<PersistedTradeTicket, "status" | "brokerStatus"> & {
  status?: PersistedTradeTicket["status"] | "Prepared" | "Simulated Open";
  brokerStatus?: PersistedTradeTicket["brokerStatus"] | null;
};

type LegacyScannerResult = Partial<PersistedScannerResult> & {
  analysisStatus?: PersistedScannerResult["analysisStatus"];
  analysisUpdatedAt?: string | null;
  analysis?: OpportunityAnalysisSnapshot | null;
};

function getLastPositivePrice(points: number[]) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index];

    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function normalizeAsset(asset: PersistedAssetRecord): PersistedAssetRecord {
  const healedPrice =
    typeof asset.price === "number" && Number.isFinite(asset.price) && asset.price > 0
      ? asset.price
      : getLastPositivePrice(asset.sparkline) ?? asset.price;

  return {
    ...asset,
    price: healedPrice,
  };
}

function normalizeExecutionMode(mode: string | null | undefined) {
  if (mode === "IG Live") {
    return "IBKR Live";
  }

  if (mode === "IG Demo") {
    return "IBKR Demo";
  }

  if (mode === "IBKR Live" || mode === "IBKR Demo" || mode === "Paper") {
    return mode;
  }

  return "Paper";
}

function resolveStorePath() {
  return process.env.SIGNALIBRIUM_STORE_PATH ?? defaultStorePath;
}

function normalizeTradeTicket(ticket: LegacyTradeTicket): PersistedTradeTicket {
  const normalizedStatus =
    ticket.status === "Prepared"
      ? "Ready"
      : ticket.status === "Simulated Open"
        ? "Filled"
        : (ticket.status ?? "Draft");

  return {
    ...ticket,
    executionMode: normalizeExecutionMode(ticket.executionMode),
    timeInForce: ticket.timeInForce ?? (ticket.orderType === "Market" ? "IOC" : "DAY"),
    status: normalizedStatus,
    brokerStatus:
      ticket.brokerStatus ??
      (normalizedStatus === "Closed"
        ? "Closed"
        : normalizedStatus === "Filled"
          ? "Filled"
        : "Not Sent"),
    brokerReference: ticket.brokerReference ?? null,
    brokerDealId: ticket.brokerDealId ?? null,
    submittedAt: ticket.submittedAt ?? null,
    filledAt: ticket.filledAt ?? null,
    closedAt: ticket.closedAt ?? null,
    executedEntry: ticket.executedEntry ?? null,
    executedQuantity: ticket.executedQuantity ?? null,
    realizedPnl: ticket.realizedPnl ?? null,
    unrealizedPnl: ticket.unrealizedPnl ?? null,
  };
}

function normalizeScannerResult(result: LegacyScannerResult): PersistedScannerResult {
  const analysis =
    result.analysis
      ? {
          ...result.analysis,
          regimeSummary:
            typeof result.analysis.regimeSummary === "string"
              ? result.analysis.regimeSummary
              : "Regime summary is not available yet for this saved analysis.",
          indicatorSweep: Array.isArray(result.analysis.indicatorSweep)
            ? result.analysis.indicatorSweep
            : [],
          multiTimeframeSummary:
            typeof result.analysis.multiTimeframeSummary === "string"
              ? result.analysis.multiTimeframeSummary
              : "Multi-timeframe confirmation is not available yet for this saved analysis.",
          multiTimeframeChecks: Array.isArray(result.analysis.multiTimeframeChecks)
            ? result.analysis.multiTimeframeChecks
            : [],
          timeframeAgreementScore:
            typeof result.analysis.timeframeAgreementScore === "number"
              ? result.analysis.timeframeAgreementScore
              : 50,
          strategyChecks: Array.isArray(result.analysis.strategyChecks)
            ? result.analysis.strategyChecks
            : [],
          validationSummary:
            typeof result.analysis.validationSummary === "string"
              ? result.analysis.validationSummary
              : "Validation summary is not available yet for this saved analysis.",
          trendPattern:
            typeof result.analysis.trendPattern === "string"
              ? result.analysis.trendPattern
              : "Trend pattern snapshot is not available yet for this saved analysis.",
        }
      : null;

  return {
    ...(result as PersistedScannerResult),
    analysisStatus: result.analysisStatus ?? "Ranked",
    analysisUpdatedAt:
      typeof result.analysisUpdatedAt === "string" ? result.analysisUpdatedAt : null,
    analysis,
  };
}

function normalizeScannerSignaturePart(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function getScannerResultSignature(result: PersistedScannerResult) {
  return [
    result.symbol.toUpperCase(),
    normalizeScannerSignaturePart(result.strategy),
    normalizeScannerSignaturePart(result.timeframe),
  ].join("|");
}

function getTimestampScore(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function preferScannerResult(
  current: PersistedScannerResult,
  candidate: PersistedScannerResult,
) {
  const currentAnalysisScore =
    (current.analysis ? 1 : 0) +
    (current.analysisStatus === "Analysed" ? 1 : 0);
  const candidateAnalysisScore =
    (candidate.analysis ? 1 : 0) +
    (candidate.analysisStatus === "Analysed" ? 1 : 0);

  if (candidateAnalysisScore !== currentAnalysisScore) {
    return candidateAnalysisScore > currentAnalysisScore ? candidate : current;
  }

  if (candidate.score !== current.score) {
    return candidate.score > current.score ? candidate : current;
  }

  const candidateTimeScore = Math.max(
    getTimestampScore(candidate.analysisUpdatedAt),
    getTimestampScore(candidate.updatedAt),
    getTimestampScore(candidate.createdAt),
  );
  const currentTimeScore = Math.max(
    getTimestampScore(current.analysisUpdatedAt),
    getTimestampScore(current.updatedAt),
    getTimestampScore(current.createdAt),
  );

  return candidateTimeScore >= currentTimeScore ? candidate : current;
}

function dedupeScannerResults(results: PersistedScannerResult[]) {
  const dedupedBySignature = new Map<string, PersistedScannerResult>();

  for (const result of results) {
    const signature = getScannerResultSignature(result);
    const current = dedupedBySignature.get(signature);

    dedupedBySignature.set(
      signature,
      current ? preferScannerResult(current, result) : result,
    );
  }

  return [...dedupedBySignature.values()];
}

function normalizeBrokerConnection(
  connection: Partial<PersistedBrokerConnection>,
): PersistedBrokerConnection {
  const rawLabel =
    typeof connection.label === "string" && connection.label.trim().length > 0
      ? connection.label.trim()
      : `IBKR ${connection.environment ?? "demo"}`;
  const label =
    rawLabel === "IG Demo"
      ? "IBKR Demo"
      : rawLabel === "IG Live"
        ? "IBKR Live"
        : rawLabel;

  return {
    id:
      typeof connection.id === "string" && connection.id.trim().length > 0
        ? connection.id
        : crypto.randomUUID(),
    provider: "IBKR",
    environment: connection.environment ?? "demo",
    label,
    status: connection.status ?? "disconnected",
    accountRef:
      typeof connection.accountRef === "string" && connection.accountRef.trim().length > 0
        ? connection.accountRef
        : null,
    executionModes:
      Array.isArray(connection.executionModes) && connection.executionModes.length > 0
        ? connection.executionModes
            .map((mode) => normalizeExecutionMode(typeof mode === "string" ? mode : undefined))
            .filter((mode): mode is "IBKR Demo" | "IBKR Live" => mode !== "Paper")
        : connection.environment === "live"
          ? ["IBKR Live"]
          : ["IBKR Demo"],
    lastError:
      typeof connection.lastError === "string" && connection.lastError.trim().length > 0
        ? connection.lastError
        : null,
    lastSyncedAt:
      typeof connection.lastSyncedAt === "string" ? connection.lastSyncedAt : null,
    createdAt:
      typeof connection.createdAt === "string"
        ? connection.createdAt
        : defaultWorkspaceData.updatedAt,
    updatedAt:
      typeof connection.updatedAt === "string"
        ? connection.updatedAt
        : defaultWorkspaceData.updatedAt,
  };
}

function normalizePredictionHistoryRecord(
  record: Partial<PersistedPredictionHistoryRecord>,
): PersistedPredictionHistoryRecord {
  const now = defaultWorkspaceData.updatedAt;
  const legacyAmbiguousStop =
    record.ambiguousResolution === true && record.outcome === "Stopped";
  const normalizedOutcome =
    legacyAmbiguousStop
      ? "Ambiguous"
      : record.outcome === "Hit Target" ||
          record.outcome === "Stopped" ||
          record.outcome === "Ambiguous" ||
          record.outcome === "Recovered Late" ||
          record.outcome === "Stayed Flat" ||
          record.outcome === "Skipped Correctly" ||
          record.outcome === "Monitoring"
        ? record.outcome
        : "Monitoring";
  const normalizedNarrative =
    typeof record.narrative === "string"
      ? legacyAmbiguousStop
        ? record.narrative
            .replace(
              `${record.symbol ?? "This setup"} invalidated the setup and hit the tracked stop after entry was locked.`,
              `${record.symbol ?? "This setup"} traded through both the tracked stop and target after entry was locked.`,
            )
            .replace(
              "A single candle touched both stop and target, so the bot logged the outcome conservatively as a stop.",
              "A single candle touched both stop and target, and the candle data could not confirm which level printed first. Siggi logged the outcome as ambiguous rather than assuming the stop was hit first.",
            )
            .replace(
              "A single candle touched both stop and target, so Siggi logged the outcome conservatively as a stop.",
              "A single candle touched both stop and target, and the candle data could not confirm which level printed first. Siggi logged the outcome as ambiguous rather than assuming the stop was hit first.",
            )
        : record.narrative
      : "Historical replay note unavailable.";
  const normalizedResolutionEvidence =
    typeof record.resolutionEvidence === "string" && record.resolutionEvidence.trim().length > 0
      ? record.resolutionEvidence.trim()
      : legacyAmbiguousStop
        ? "Stop and target both printed in the same candle, so order could not be confirmed."
        : normalizedOutcome === "Monitoring"
          ? null
          : null;

  return {
    id:
      typeof record.id === "string" && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    symbol: record.symbol ?? "UNKNOWN",
    instrumentName: record.instrumentName ?? record.symbol ?? "Unknown instrument",
    assetClass: record.assetClass ?? "Equity",
    strategyAtCall: record.strategyAtCall ?? "Unknown strategy",
    timeframe: record.timeframe ?? "1D",
    horizon: record.horizon ?? "Week",
    sourceScannerResultId: record.sourceScannerResultId ?? null,
    trendAtCall: record.trendAtCall ?? "Neutral",
    actionAtCall: record.actionAtCall ?? "WAIT",
    decisionAtCall: record.decisionAtCall ?? "WAIT",
    confidenceAtCall:
      typeof record.confidenceAtCall === "number" ? record.confidenceAtCall : 50,
    monitoringStatus:
      normalizedOutcome === "Ambiguous"
        ? "Resolved"
        : record.monitoringStatus ?? "Resolved",
    priceAtCall: typeof record.priceAtCall === "number" ? record.priceAtCall : 0,
    entryLowAtCall: typeof record.entryLowAtCall === "number" ? record.entryLowAtCall : 0,
    entryHighAtCall: typeof record.entryHighAtCall === "number" ? record.entryHighAtCall : 0,
    stopPriceAtCall: typeof record.stopPriceAtCall === "number" ? record.stopPriceAtCall : 0,
    targetPriceAtCall:
      typeof record.targetPriceAtCall === "number" ? record.targetPriceAtCall : 0,
    entryAtCall: record.entryAtCall ?? "N/A",
    discountedEntryAtCall: record.discountedEntryAtCall ?? record.entryAtCall ?? "N/A",
    stopAtCall: record.stopAtCall ?? "N/A",
    targetAtCall: record.targetAtCall ?? "N/A",
    eventMoveAtCall: record.eventMoveAtCall ?? "Whipsaw",
    eventLikelihoodAtCall:
      typeof record.eventLikelihoodAtCall === "number" ? record.eventLikelihoodAtCall : 50,
    eventIdsAtCall: Array.isArray(record.eventIdsAtCall) ? record.eventIdsAtCall : [],
    eventTitlesAtCall: Array.isArray(record.eventTitlesAtCall) ? record.eventTitlesAtCall : [],
    eventContextAtCall:
      typeof record.eventContextAtCall === "string"
        ? record.eventContextAtCall
        : "No event context was saved for this historical record.",
    patternSnapshotAtCall:
      typeof record.patternSnapshotAtCall === "string"
        ? record.patternSnapshotAtCall
        : "No pattern snapshot was saved for this historical record.",
    indicatorSnapshotAtCall: Array.isArray(record.indicatorSnapshotAtCall)
      ? record.indicatorSnapshotAtCall
      : [],
    strategySnapshotAtCall: Array.isArray(record.strategySnapshotAtCall)
      ? record.strategySnapshotAtCall
      : [],
    validationSnapshotAtCall: Array.isArray(record.validationSnapshotAtCall)
      ? record.validationSnapshotAtCall
      : [],
    calledAt: typeof record.calledAt === "string" ? record.calledAt : now,
    lastCandleCheckAt:
      typeof record.lastCandleCheckAt === "string" ? record.lastCandleCheckAt : null,
    resolvedAt: typeof record.resolvedAt === "string" ? record.resolvedAt : null,
    resolutionMethod:
      record.resolutionMethod === "candle-range" ||
      record.resolutionMethod === "lower-timeframe-drilldown" ||
      record.resolutionMethod === "pulse-tape" ||
      record.resolutionMethod === "sequence-inference"
        ? record.resolutionMethod
        : "snapshot",
    ambiguousResolution:
      normalizedOutcome === "Ambiguous" ? true : record.ambiguousResolution ?? false,
    outcome: normalizedOutcome,
    outcomeAccuracy:
      legacyAmbiguousStop
        ? "Neutral"
        : record.outcomeAccuracy === "Accurate" ||
            record.outcomeAccuracy === "Inaccurate" ||
            record.outcomeAccuracy === "Neutral"
          ? record.outcomeAccuracy
          : "Neutral",
    moveFromCallPct:
      typeof record.moveFromCallPct === "number" ? record.moveFromCallPct : 0,
    maxFavorableExcursionPct:
      typeof record.maxFavorableExcursionPct === "number"
        ? record.maxFavorableExcursionPct
        : 0,
    maxAdverseExcursionPct:
      typeof record.maxAdverseExcursionPct === "number"
        ? record.maxAdverseExcursionPct
        : 0,
    accuracyScore:
      legacyAmbiguousStop ? 50 : typeof record.accuracyScore === "number" ? record.accuracyScore : 50,
    resolutionEvidence: normalizedResolutionEvidence,
    narrative: normalizedNarrative,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
  };
}

function normalizeSiggiTrade(
  trade: Partial<PersistedSiggiTrade>,
  now: string,
): PersistedSiggiTrade {
  return {
    id:
      typeof trade.id === "string" && trade.id.trim().length > 0
        ? trade.id
        : crypto.randomUUID(),
    predictionId: trade.predictionId ?? "unknown-prediction",
    sourceScannerResultId: trade.sourceScannerResultId ?? null,
    symbol: trade.symbol ?? "UNKNOWN",
    instrumentName: trade.instrumentName ?? trade.symbol ?? "Unknown instrument",
    side: trade.side === "SELL" ? "SELL" : "BUY",
    status:
      trade.status === "Hit Target" || trade.status === "Stopped" ? trade.status : "Open",
    confidenceAtOpen:
      typeof trade.confidenceAtOpen === "number" ? trade.confidenceAtOpen : 50,
    openedAt: typeof trade.openedAt === "string" ? trade.openedAt : now,
    closedAt: typeof trade.closedAt === "string" ? trade.closedAt : null,
    entryPrice: typeof trade.entryPrice === "number" ? trade.entryPrice : 0,
    stopPrice: typeof trade.stopPrice === "number" ? trade.stopPrice : 0,
    targetPrice: typeof trade.targetPrice === "number" ? trade.targetPrice : 0,
    stopMode:
      trade.stopMode === "Breakeven" || trade.stopMode === "Trailing"
        ? trade.stopMode
        : "Initial",
    stakeGbp: typeof trade.stakeGbp === "number" ? trade.stakeGbp : 0,
    stakeUsd: typeof trade.stakeUsd === "number" ? trade.stakeUsd : 0,
    quantity: typeof trade.quantity === "number" ? trade.quantity : 0,
    currentPriceUsd:
      typeof trade.currentPriceUsd === "number" ? trade.currentPriceUsd : null,
    unrealizedPnlGbp:
      typeof trade.unrealizedPnlGbp === "number" ? trade.unrealizedPnlGbp : null,
    unrealizedPnlUsd:
      typeof trade.unrealizedPnlUsd === "number" ? trade.unrealizedPnlUsd : null,
    peakUnrealizedPnlGbp:
      typeof trade.peakUnrealizedPnlGbp === "number" ? trade.peakUnrealizedPnlGbp : 0,
    realizedPnlGbp:
      typeof trade.realizedPnlGbp === "number" ? trade.realizedPnlGbp : null,
    realizedPnlUsd:
      typeof trade.realizedPnlUsd === "number" ? trade.realizedPnlUsd : null,
    lastMarkedAt:
      typeof trade.lastMarkedAt === "string" ? trade.lastMarkedAt : null,
    narrative:
      typeof trade.narrative === "string" ? trade.narrative : "Siggi trade memory unavailable.",
    createdAt: typeof trade.createdAt === "string" ? trade.createdAt : now,
    updatedAt: typeof trade.updatedAt === "string" ? trade.updatedAt : now,
  };
}

function normalizeSiggiEquitySnapshot(
  snapshot: Partial<PersistedSiggiEquitySnapshot>,
  now: string,
): PersistedSiggiEquitySnapshot {
  return {
    at: typeof snapshot.at === "string" ? snapshot.at : now,
    cashBalanceGbp:
      typeof snapshot.cashBalanceGbp === "number" ? snapshot.cashBalanceGbp : 0,
    equityGbp: typeof snapshot.equityGbp === "number" ? snapshot.equityGbp : 0,
    openTrades: typeof snapshot.openTrades === "number" ? snapshot.openTrades : 0,
  };
}

function normalizeSiggiActivity(
  activity: Partial<PersistedSiggiActivity>,
  now: string,
): PersistedSiggiActivity {
  const rawDetail =
    typeof activity.detail === "string" ? activity.detail : "Siggi activity unavailable.";
  const detail = rawDetail
    .replace("Â£50", "£50")
    .replace("GBP 50 starting capital", "£50 starting capital");

  return {
    id:
      typeof activity.id === "string" && activity.id.trim().length > 0
        ? activity.id
        : crypto.randomUUID(),
    at: typeof activity.at === "string" ? activity.at : now,
    type:
      activity.type === "Opened" ||
      activity.type === "Closed" ||
      activity.type === "Skipped" ||
      activity.type === "Stop Moved" ||
      activity.type === "Reset"
        ? activity.type
        : "Skipped",
    symbol: typeof activity.symbol === "string" ? activity.symbol : null,
    detail,
  };
}

function normalizeSiggiAccount(
  candidate: Partial<PersistedSiggiAccount> | undefined,
): PersistedSiggiAccount {
  const now = defaultWorkspaceData.updatedAt;
  const seeded = defaultWorkspaceData.siggiAccount;

  return {
    id:
      typeof candidate?.id === "string" && candidate.id.trim().length > 0
        ? candidate.id
        : seeded.id,
    botName:
      typeof candidate?.botName === "string" && candidate.botName.trim().length > 0
        ? candidate.botName
        : seeded.botName,
    baseCurrency: "GBP",
    startingBalanceGbp:
      typeof candidate?.startingBalanceGbp === "number"
        ? candidate.startingBalanceGbp
        : seeded.startingBalanceGbp,
    cashBalanceGbp:
      typeof candidate?.cashBalanceGbp === "number"
        ? candidate.cashBalanceGbp
        : seeded.cashBalanceGbp,
    highWatermarkGbp:
      typeof candidate?.highWatermarkGbp === "number"
        ? candidate.highWatermarkGbp
        : seeded.highWatermarkGbp,
    resetCount:
      typeof candidate?.resetCount === "number" ? candidate.resetCount : seeded.resetCount,
    successfulTrades:
      typeof candidate?.successfulTrades === "number"
        ? candidate.successfulTrades
        : seeded.successfulTrades,
    failedTrades:
      typeof candidate?.failedTrades === "number"
        ? candidate.failedTrades
        : seeded.failedTrades,
    openTrades: Array.isArray(candidate?.openTrades)
      ? candidate.openTrades.map((trade) => normalizeSiggiTrade(trade, now))
      : seeded.openTrades,
    closedTrades: Array.isArray(candidate?.closedTrades)
      ? candidate.closedTrades.map((trade) => normalizeSiggiTrade(trade, now))
      : seeded.closedTrades,
    equityCurve: Array.isArray(candidate?.equityCurve)
      ? candidate.equityCurve.map((snapshot) =>
          normalizeSiggiEquitySnapshot(snapshot, now),
        )
      : seeded.equityCurve,
    activityLog: Array.isArray(candidate?.activityLog)
      ? candidate.activityLog.map((activity) => normalizeSiggiActivity(activity, now))
      : seeded.activityLog,
    lastEvaluatedAt:
      typeof candidate?.lastEvaluatedAt === "string" ? candidate.lastEvaluatedAt : null,
    createdAt:
      typeof candidate?.createdAt === "string" ? candidate.createdAt : seeded.createdAt,
    updatedAt:
      typeof candidate?.updatedAt === "string" ? candidate.updatedAt : seeded.updatedAt,
  };
}

function mergeByKey<T>(
  current: T[] | undefined,
  seeded: T[],
  getKey: (item: T) => string,
) {
  if (!Array.isArray(current) || current.length === 0) {
    return seeded;
  }

  const seenKeys = new Set(current.map((item) => getKey(item)));
  const missingSeeded = seeded.filter((item) => !seenKeys.has(getKey(item)));

  return [...current, ...missingSeeded];
}

function normalizeWatchlists(candidateWatchlists: PersistedWorkspaceData["watchlists"] | undefined) {
  const seededWatchlists = defaultWorkspaceData.watchlists;

  if (!Array.isArray(candidateWatchlists) || candidateWatchlists.length === 0) {
    return seededWatchlists;
  }

  const seededDefault = seededWatchlists.find((watchlist) => watchlist.isDefault) ?? null;
  const candidateDefaultIndex = candidateWatchlists.findIndex((watchlist) => watchlist.isDefault);

  const nextWatchlists =
    candidateDefaultIndex >= 0 && seededDefault
      ? candidateWatchlists.map((watchlist, index) =>
          index === candidateDefaultIndex
            ? {
                ...watchlist,
                itemSymbols: [...new Set([...watchlist.itemSymbols, ...seededDefault.itemSymbols])],
              }
            : watchlist,
        )
      : [...candidateWatchlists];

  const nextIds = new Set(nextWatchlists.map((watchlist) => watchlist.id));
  const missingSeeded = seededWatchlists.filter((watchlist) => !nextIds.has(watchlist.id));

  return [...nextWatchlists, ...missingSeeded];
}

async function ensureStoreFile() {
  const storePath = resolveStorePath();

  try {
    await fs.access(storePath);
  } catch {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(defaultWorkspaceData, null, 2), "utf8");
  }

  return storePath;
}

function normalizeWorkspaceData(raw: unknown): PersistedWorkspaceData {
  const candidate = (raw ?? {}) as Partial<PersistedWorkspaceData>;

  return {
    schemaVersion: 12,
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : defaultWorkspaceData.updatedAt,
    workspace: {
      id: candidate.workspace?.id ?? defaultWorkspaceData.workspace.id,
      name: candidate.workspace?.name ?? defaultWorkspaceData.workspace.name,
      createdAt:
        candidate.workspace?.createdAt ?? defaultWorkspaceData.workspace.createdAt,
      updatedAt:
        candidate.workspace?.updatedAt ?? defaultWorkspaceData.workspace.updatedAt,
    },
    syncState: {
      sparklineCursor:
        typeof candidate.syncState?.sparklineCursor === "number"
          ? candidate.syncState.sparklineCursor
          : defaultWorkspaceData.syncState.sparklineCursor,
      intelligenceLastSyncedAt:
        typeof candidate.syncState?.intelligenceLastSyncedAt === "string"
          ? candidate.syncState.intelligenceLastSyncedAt
          : defaultWorkspaceData.syncState.intelligenceLastSyncedAt,
      pricePulseLastSyncedAt:
        typeof candidate.syncState?.pricePulseLastSyncedAt === "string"
          ? candidate.syncState.pricePulseLastSyncedAt
          : defaultWorkspaceData.syncState.pricePulseLastSyncedAt,
      pricePulseTape:
        candidate.syncState?.pricePulseTape &&
        typeof candidate.syncState.pricePulseTape === "object"
          ? Object.fromEntries(
              Object.entries(candidate.syncState.pricePulseTape).map(([symbol, points]) => [
                symbol,
                Array.isArray(points)
                  ? points
                      .filter(
                        (point) =>
                          point &&
                          typeof point === "object" &&
                          typeof point.at === "string" &&
                          typeof point.price === "number" &&
                          Number.isFinite(point.price),
                      )
                      .map((point) => ({
                        at: point.at,
                        price: point.price,
                      }))
                      .slice(-120)
                  : [],
              ]),
            )
          : defaultWorkspaceData.syncState.pricePulseTape,
    },
    brokerConnections: Array.isArray(candidate.brokerConnections)
      ? candidate.brokerConnections.map((connection) =>
          normalizeBrokerConnection(connection as PersistedBrokerConnection),
        )
      : defaultWorkspaceData.brokerConnections,
    watchlists: normalizeWatchlists(candidate.watchlists),
    tradeTickets: Array.isArray(candidate.tradeTickets)
      ? candidate.tradeTickets.map((ticket) =>
          normalizeTradeTicket(ticket as PersistedTradeTicket),
        )
      : defaultWorkspaceData.tradeTickets,
    journalEntries: Array.isArray(candidate.journalEntries)
      ? candidate.journalEntries
      : defaultWorkspaceData.journalEntries,
    assets: mergeByKey(
      Array.isArray(candidate.assets)
        ? candidate.assets.map((asset) => normalizeAsset(asset as PersistedAssetRecord))
        : undefined,
      defaultWorkspaceData.assets.map((asset) => normalizeAsset(asset)),
      (asset) => asset.symbol,
    ),
    scannerResults: dedupeScannerResults(
      mergeByKey(
        Array.isArray(candidate.scannerResults)
          ? candidate.scannerResults.map((result) =>
              normalizeScannerResult(result as PersistedScannerResult),
            )
          : undefined,
        defaultWorkspaceData.scannerResults,
        (result) => result.id,
      ),
    ),
    backtests: mergeByKey(
      Array.isArray(candidate.backtests) ? candidate.backtests : undefined,
      defaultWorkspaceData.backtests,
      (backtest) => backtest.id,
    ),
    marketSnapshot:
      candidate.marketSnapshot ?? defaultWorkspaceData.marketSnapshot,
    marketEvents: mergeByKey(
      Array.isArray(candidate.marketEvents) ? candidate.marketEvents : undefined,
      defaultWorkspaceData.marketEvents,
      (event) => event.id,
    ),
    confirmationChecks: mergeByKey(
      Array.isArray(candidate.confirmationChecks)
        ? candidate.confirmationChecks
        : undefined,
      defaultWorkspaceData.confirmationChecks,
      (check) => check.id,
    ),
    aiOpportunities: mergeByKey(
      Array.isArray(candidate.aiOpportunities) ? candidate.aiOpportunities : undefined,
      defaultWorkspaceData.aiOpportunities,
      (opportunity) => opportunity.id,
    ),
    predictionHistory: mergeByKey(
      Array.isArray(candidate.predictionHistory)
        ? candidate.predictionHistory.map((record) =>
            normalizePredictionHistoryRecord(record as PersistedPredictionHistoryRecord),
          )
        : undefined,
      defaultWorkspaceData.predictionHistory,
      (record) => record.id,
    ),
    siggiAccount: normalizeSiggiAccount(candidate.siggiAccount),
  };
}

function extractFirstCompleteJsonObject(raw: string) {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];

    if (startIndex === -1) {
      if (character === "{") {
        startIndex = index;
        depth = 1;
      }

      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return raw.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function queueWrite<T>(task: () => Promise<T>) {
  const result = pendingWrite.then(task, task);
  pendingWrite = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

export async function readWorkspaceData() {
  const storePath = await ensureStoreFile();
  const raw = await fs.readFile(storePath, "utf8");

  try {
    return normalizeWorkspaceData(JSON.parse(raw));
  } catch {
    const recoveredPayload = extractFirstCompleteJsonObject(raw);

    if (!recoveredPayload) {
      throw new Error("Workspace data is invalid and could not be repaired automatically.");
    }

    const recoveredData = normalizeWorkspaceData(JSON.parse(recoveredPayload));
    await writeWorkspaceData(recoveredData);

    return recoveredData;
  }
}

export async function writeWorkspaceData(nextData: PersistedWorkspaceData) {
  return queueWrite(async () => {
    const storePath = await ensureStoreFile();
    const now = new Date().toISOString();
    const stampedData: PersistedWorkspaceData = {
      ...nextData,
      updatedAt: now,
      workspace: {
        ...nextData.workspace,
        updatedAt: now,
      },
    };
    const tempPath = `${storePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    await fs.writeFile(tempPath, JSON.stringify(stampedData, null, 2), "utf8");
    await fs.rename(tempPath, storePath);

    return stampedData;
  });
}

export function getWorkspaceStorePath() {
  return resolveStorePath();
}
