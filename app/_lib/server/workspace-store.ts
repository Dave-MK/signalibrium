import { roundPriceValue } from "@/app/_lib/market-prices";
import {
  getStrategyTriggerTimeframe,
  selectStrategyProfile,
} from "@/app/_lib/strategy-profiles";
import { defaultWorkspaceData } from "@/app/_lib/server/workspace-seed";
import type {
  PersistedAssetRecord,
  PersistedAiOpportunity,
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

const vercelTempStorePath = "/tmp/signalibrium-workspace.json";
const kvWorkspaceKey = process.env.SIGNALIBRIUM_KV_WORKSPACE_KEY ?? "signalibrium:workspace";
let pendingWrite = Promise.resolve();

type UpstashRestResponse<T> = {
  result?: T;
  error?: string;
};

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

function normalizeSparkline(price: number, sparkline: number[]) {
  const validPoints = sparkline.filter((value) => Number.isFinite(value) && value > 0);

  if (!(Number.isFinite(price) && price > 0)) {
    return validPoints;
  }

  if (validPoints.length < 2) {
    return Array.from({ length: 12 }, () => roundPriceValue(price));
  }

  const max = Math.max(...validPoints);
  const min = Math.min(...validPoints);
  const last = validPoints[validPoints.length - 1];
  const wildlyOutOfScale =
    max > price * 250 ||
    min < price / 250 ||
    last > price * 250 ||
    last < price / 250;

  if (wildlyOutOfScale) {
    return Array.from({ length: Math.max(validPoints.length, 12) }, () => roundPriceValue(price));
  }

  return validPoints;
}

function parseFormattedPriceLabel(value: string | null | undefined) {
  if (typeof value !== "string") {
    return 0;
  }

  const normalized = Number(value.replaceAll("£", "").replaceAll("$", "").replaceAll(",", "").trim());
  return Number.isFinite(normalized) ? normalized : 0;
}

function parseFormattedPriceRange(value: string | null | undefined) {
  if (typeof value !== "string") {
    return { low: 0, high: 0 };
  }

  const [rawLow, rawHigh] = value.split("-").map((part) => parseFormattedPriceLabel(part));
  const low = Number.isFinite(rawLow) ? rawLow : 0;
  const high = Number.isFinite(rawHigh) ? rawHigh : low;

  return {
    low,
    high,
  };
}

function inferDirectionalStance(input: {
  analysisBias?: string | null;
  aiBias?: string | null;
  forecast?: string | null;
  thesis?: string | null;
}) {
  const combined = [
    input.analysisBias,
    input.aiBias,
    input.forecast,
    input.thesis,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  if (
    combined.includes("bear") ||
    combined.includes("fade") ||
    combined.includes("breakdown") ||
    combined.includes("defensive") ||
    combined.includes("weakening")
  ) {
    return "Short" as const;
  }

  return "Long" as const;
}

function normalizeAsset(asset: PersistedAssetRecord): PersistedAssetRecord {
  const healedPrice =
    typeof asset.price === "number" && Number.isFinite(asset.price) && asset.price > 0
      ? asset.price
      : getLastPositivePrice(asset.sparkline) ?? asset.price;
  const normalizedSparkline = normalizeSparkline(healedPrice, asset.sparkline);
  const profile = selectStrategyProfile({
    assetClass: asset.assetClass,
    liquidity: asset.liquidity,
    regime: asset.regime,
    score: asset.score,
    stance: inferDirectionalStance({
      aiBias: asset.aiBias,
      forecast: asset.forecast,
    }),
    tradeability: asset.tradeable ? "TRADEABLE" : "WATCH",
    volatility: asset.volatility,
  });
  const sparklineAtr =
    normalizedSparkline.length > 1
      ? normalizedSparkline
          .slice(1)
          .map((value, index) => Math.abs(value - normalizedSparkline[index]))
          .reduce((total, value) => total + value, 0) / (normalizedSparkline.length - 1)
      : asset.atr;

  return {
    ...asset,
    price: healedPrice,
    activeStrategy: profile.name,
    atr:
      Number.isFinite(asset.atr) && asset.atr > 0 && asset.atr <= healedPrice * 5
        ? asset.atr
        : roundPriceValue(Math.max(sparklineAtr, healedPrice * 0.004), asset.assetClass),
    sparkline: normalizedSparkline,
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
  if (process.env.SIGNALIBRIUM_STORE_PATH) {
    return process.env.SIGNALIBRIUM_STORE_PATH;
  }

  if (process.env.VERCEL) {
    return vercelTempStorePath;
  }

  return `${process.cwd()}/data/workspace.json`;
}

function getKvConfig() {
  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return {
    token,
    url: url.replace(/\/$/, ""),
  };
}

function shouldUseKvStore() {
  return Boolean(getKvConfig());
}

async function fetchKvJson<T>(pathName: string, init?: RequestInit) {
  const config = getKvConfig();

  if (!config) {
    throw new Error("Upstash Redis is not configured.");
  }

  const response = await fetch(`${config.url}${pathName}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Vercel KV request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as UpstashRestResponse<T>;

  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload.result;
}

async function readKvWorkspacePayload() {
  const stored = await fetchKvJson<string | PersistedWorkspaceData | null>(
    `/get/${encodeURIComponent(kvWorkspaceKey)}`,
  );

  if (stored) {
    return typeof stored === "string" ? stored : JSON.stringify(stored);
  }

  const seededPayload = JSON.stringify(defaultWorkspaceData, null, 2);
  await writeKvWorkspacePayload(seededPayload);

  return seededPayload;
}

async function writeKvWorkspacePayload(payload: string) {
  await fetchKvJson<"OK">(`/set/${encodeURIComponent(kvWorkspaceKey)}`, {
    body: payload,
    method: "POST",
  });
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

function getScannerResultBySymbolOrId(
  scannerResults: PersistedScannerResult[],
  symbol: string,
  sourceScannerResultId?: string | null,
) {
  if (sourceScannerResultId) {
    const exactMatch = scannerResults.find((result) => result.id === sourceScannerResultId);

    if (exactMatch) {
      return exactMatch;
    }
  }

  return scannerResults.find((result) => result.symbol === symbol) ?? null;
}

function normalizeAiOpportunityRecord(
  opportunity: PersistedAiOpportunity,
  scannerResults: PersistedScannerResult[],
  assetsBySymbol: Map<string, PersistedAssetRecord>,
  backtests: PersistedWorkspaceData["backtests"],
) {
  const scannerResult = getScannerResultBySymbolOrId(
    scannerResults,
    opportunity.symbol,
    opportunity.linkedScannerResultId,
  );
  const asset = assetsBySymbol.get(opportunity.symbol) ?? null;
  const backtest =
    (scannerResult
      ? backtests.find((item) => item.linkedScannerResultId === scannerResult.id)
      : null) ??
    backtests.find((item) => item.linkedAssetSymbol === opportunity.symbol) ??
    null;

  if (!scannerResult) {
    return opportunity;
  }

  const side = scannerResult.thesis.toLowerCase().includes("short") ? "Short" : opportunity.side;
  const action =
    scannerResult.tradeability === "TRADEABLE"
      ? side === "Short"
        ? ("Sell" as const)
        : ("Buy" as const)
      : ("Wait" as const);
  const leadWindow =
    scannerResult.timeframe === "15M"
      ? "the next few hours"
      : scannerResult.timeframe === "1H"
        ? "the next session"
        : "the next 24 hours";

  return {
    ...opportunity,
    side,
    title: `${scannerResult.strategy} intraday setup`,
    summary: `${scannerResult.symbol} is being tracked on the ${scannerResult.strategy} playbook for ${leadWindow}.`,
    action,
    entryPlan: scannerResult.entryZone,
    stopPlan: scannerResult.stopLoss,
    targetPlan: scannerResult.takeProfit,
    expectedMove:
      side === "Short"
        ? "Favors downside continuation if rallies fail back into resistance."
        : "Favors upside continuation if pullbacks hold the planned zone.",
    invalidation:
      side === "Short"
        ? "Reclaim the short trigger zone and hold above it, which would invalidate the fade."
        : "Lose the pullback shelf and fail to reclaim the preferred entry pocket.",
    marketContext: `${asset?.regime ?? "Mixed"} tape. ${asset?.forecast ?? opportunity.marketContext}`.slice(0, 240),
    newsContext: opportunity.newsContext,
    confirmationContext:
      scannerResult.analysis?.validationSummary ??
      `${scannerResult.strategy} is being cross-checked with event, confirmation, and replay memory before Siggi leans in.`,
    linkedScannerResultId: scannerResult.id,
    linkedBacktestId: backtest?.id ?? opportunity.linkedBacktestId,
  };
}

function normalizePredictionHistoryAgainstScanner(
  record: PersistedPredictionHistoryRecord,
  scannerResults: PersistedScannerResult[],
  assetsBySymbol: Map<string, PersistedAssetRecord>,
) {
  const scannerResult = getScannerResultBySymbolOrId(
    scannerResults,
    record.symbol,
    record.sourceScannerResultId,
  );
  const asset = assetsBySymbol.get(record.symbol) ?? null;

  if (!scannerResult) {
    return record;
  }

  const parsedEntry = parseFormattedPriceRange(record.entryAtCall);
  const parsedDiscountedEntry = parseFormattedPriceRange(record.discountedEntryAtCall);
  const parsedStop = parseFormattedPriceLabel(record.stopAtCall);
  const parsedTarget = parseFormattedPriceLabel(record.targetAtCall);
  const currentEntry = parseFormattedPriceRange(scannerResult.entryZone);
  const strategyAtCall =
    record.strategyAtCall === "Unknown strategy" ||
    record.strategyAtCall === "20-Day Breakout" ||
    record.strategyAtCall === "50/200 Trend" ||
    record.strategyAtCall === "RSI Pullback"
      ? scannerResult.strategy
      : record.strategyAtCall;
  const timeframe =
    record.timeframe === "4H" || record.timeframe === "1D" || record.timeframe === "1W"
      ? scannerResult.timeframe
      : record.timeframe;
  const indicatorSnapshot =
    record.indicatorSnapshotAtCall.length > 0
      ? record.indicatorSnapshotAtCall
      : (scannerResult.analysis?.indicatorSweep ?? []).map(
          (item) => `${item.label}: ${item.status} / ${item.detail}`,
        );
  const strategySnapshot =
    record.strategySnapshotAtCall.length > 0
      ? record.strategySnapshotAtCall
      : (scannerResult.analysis?.strategyChecks ?? []).map(
          (item) => `${item.label}: ${item.status} / ${item.detail}`,
        );
  const validationSnapshot =
    record.validationSnapshotAtCall.length > 0
      ? record.validationSnapshotAtCall
      : scannerResult.analysis?.validationSummary
        ? [scannerResult.analysis.validationSummary]
        : [];

  return {
    ...record,
    instrumentName: asset?.name ?? record.instrumentName,
    strategyAtCall,
    timeframe,
    horizon: "Day" as const,
    sourceScannerResultId: scannerResult.id,
    entryLowAtCall:
      record.entryLowAtCall > 0
        ? record.entryLowAtCall
        : parsedEntry.low > 0
          ? parsedEntry.low
          : currentEntry.low,
    entryHighAtCall:
      record.entryHighAtCall > 0
        ? record.entryHighAtCall
        : parsedEntry.high > 0
          ? parsedEntry.high
          : currentEntry.high,
    stopPriceAtCall:
      record.stopPriceAtCall > 0
        ? record.stopPriceAtCall
        : parsedStop > 0
          ? parsedStop
          : parseFormattedPriceLabel(scannerResult.stopLoss),
    targetPriceAtCall:
      record.targetPriceAtCall > 0
        ? record.targetPriceAtCall
        : parsedTarget > 0
          ? parsedTarget
          : parseFormattedPriceLabel(scannerResult.takeProfit),
    discountedEntryAtCall:
      parsedDiscountedEntry.low > 0 && parsedDiscountedEntry.high > 0
        ? record.discountedEntryAtCall
        : scannerResult.entryZone,
    patternSnapshotAtCall:
      record.patternSnapshotAtCall === "No pattern snapshot was saved for this historical record."
        ? `Siggi is now classifying this as a ${scannerResult.strategy} intraday setup built for ${scannerResult.timeframe} execution.`
        : record.patternSnapshotAtCall,
    indicatorSnapshotAtCall: indicatorSnapshot,
    strategySnapshotAtCall: strategySnapshot,
    validationSnapshotAtCall: validationSnapshot,
    narrative:
      record.narrative.includes("weekly")
        ? record.narrative.replaceAll("weekly", "intraday").replaceAll("Weekly", "Intraday")
        : record.narrative,
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
  const [{ promises: fs }, path] = await Promise.all([
    import("node:fs"),
    import("node:path"),
  ]);

  if (process.env.VERCEL && !shouldUseKvStore() && !process.env.SIGNALIBRIUM_STORE_PATH) {
    throw new Error(
      "Signalibrium needs Upstash Redis configured in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }

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
  const normalizedAssets = mergeByKey(
    Array.isArray(candidate.assets)
      ? candidate.assets.map((asset) => normalizeAsset(asset as PersistedAssetRecord))
      : undefined,
    defaultWorkspaceData.assets.map((asset) => normalizeAsset(asset)),
    (asset) => asset.symbol,
  );
  const assetBySymbol = new Map(normalizedAssets.map((asset) => [asset.symbol, asset] as const));
  const normalizedScannerResults = dedupeScannerResults(
    mergeByKey(
      Array.isArray(candidate.scannerResults)
        ? candidate.scannerResults.map((result) =>
            normalizeScannerResult(result as PersistedScannerResult),
          )
        : undefined,
      defaultWorkspaceData.scannerResults,
      (result) => result.id,
    ).map((result) => {
      const asset = assetBySymbol.get(result.symbol);

      if (!asset) {
        return result;
      }

      const profile = selectStrategyProfile({
        assetClass: asset.assetClass,
        liquidity: asset.liquidity,
        regime: asset.regime,
        score: result.score,
        stance: inferDirectionalStance({
          analysisBias: result.analysis?.bias,
          aiBias: asset.aiBias,
          forecast: asset.forecast,
          thesis: result.thesis,
        }),
        tradeability: result.tradeability,
        volatility: asset.volatility,
      });

      return {
        ...result,
        strategy: profile.name,
        timeframe: getStrategyTriggerTimeframe(profile, asset.assetClass),
      };
    }),
  );
  const normalizedBacktests = mergeByKey(
    Array.isArray(candidate.backtests) ? candidate.backtests : undefined,
    defaultWorkspaceData.backtests,
    (backtest) => backtest.id,
  ).map((backtest) => {
    const asset = assetBySymbol.get(backtest.linkedAssetSymbol);

    if (!asset) {
      return backtest;
    }

    const profile = selectStrategyProfile({
      assetClass: asset.assetClass,
      liquidity: asset.liquidity,
      regime: asset.regime,
      score: asset.score,
      stance: backtest.aiRead.toLowerCase().includes("weak") ? "Short" : "Long",
      tradeability: asset.tradeable ? "TRADEABLE" : "WATCH",
      volatility: asset.volatility,
    });

    return {
      ...backtest,
      strategy: profile.name,
      timeframe: getStrategyTriggerTimeframe(profile, asset.assetClass),
    };
  });
  const normalizedAiOpportunities = mergeByKey(
    Array.isArray(candidate.aiOpportunities) ? candidate.aiOpportunities : undefined,
    defaultWorkspaceData.aiOpportunities,
    (opportunity) => opportunity.id,
  ).map((opportunity) =>
    normalizeAiOpportunityRecord(
      opportunity,
      normalizedScannerResults,
      assetBySymbol,
      normalizedBacktests,
    ),
  );
  const normalizedPredictionHistory = mergeByKey(
    Array.isArray(candidate.predictionHistory)
      ? candidate.predictionHistory.map((record) =>
          normalizePredictionHistoryRecord(record as PersistedPredictionHistoryRecord),
        )
      : undefined,
    defaultWorkspaceData.predictionHistory,
    (record) => record.id,
  ).map((record) =>
    normalizePredictionHistoryAgainstScanner(
      record,
      normalizedScannerResults,
      assetBySymbol,
    ),
  );

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
    assets: normalizedAssets,
    scannerResults: normalizedScannerResults,
    backtests: normalizedBacktests,
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
    aiOpportunities: normalizedAiOpportunities,
    predictionHistory: normalizedPredictionHistory,
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

function isPermissionRenameError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function replaceWorkspaceFile(
  fs: typeof import("node:fs").promises,
  tempPath: string,
  storePath: string,
  payload: string,
) {
  const retryDelaysMs = [80, 180, 360, 720];

  for (const delayMs of [0, ...retryDelaysMs]) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    try {
      await fs.rename(tempPath, storePath);
      return;
    } catch (error) {
      if (!isPermissionRenameError(error)) {
        throw error;
      }
    }
  }

  try {
    await fs.copyFile(tempPath, storePath);
  } catch {
    try {
      await fs.writeFile(storePath, payload, "utf8");
    } catch {
      try {
        await fs.unlink(storePath);
      } catch {
        // If OneDrive still holds the destination, the final rename attempt below may still fail.
      }

      await fs.rename(tempPath, storePath);
      return;
    }
  }

  try {
    await fs.unlink(tempPath);
  } catch {
    // OneDrive can keep the temp file locked briefly; it is gitignored and harmless.
  }
}

export async function readWorkspaceData() {
  const raw = shouldUseKvStore()
    ? await readKvWorkspacePayload()
    : await import("node:fs").then(async ({ promises: fs }) =>
        fs.readFile(await ensureStoreFile(), "utf8"),
      );

  try {
    const parsed = JSON.parse(raw);
    const normalizedData = normalizeWorkspaceData(parsed);
    const normalizedPayload = JSON.stringify(normalizedData);
    const currentPayload = JSON.stringify(parsed);

    if (normalizedPayload !== currentPayload) {
      await writeWorkspaceData(normalizedData);
    }

    return normalizedData;
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
    const now = new Date().toISOString();
    const stampedData: PersistedWorkspaceData = {
      ...nextData,
      updatedAt: now,
      workspace: {
        ...nextData.workspace,
        updatedAt: now,
      },
    };
    const payload = JSON.stringify(stampedData, null, 2);

    if (shouldUseKvStore()) {
      await writeKvWorkspacePayload(payload);

      return stampedData;
    }

    const storePath = await ensureStoreFile();
    const { promises: fs } = await import("node:fs");
    const tempPath = `${storePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    await fs.writeFile(tempPath, payload, "utf8");
    await replaceWorkspaceFile(fs, tempPath, storePath, payload);

    return stampedData;
  });
}

export function getWorkspaceStorePath() {
  if (shouldUseKvStore()) {
    return `upstash-redis:${kvWorkspaceKey}`;
  }

  return resolveStorePath();
}
