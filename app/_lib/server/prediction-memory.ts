import { buildBotOpportunityView } from "@/app/_lib/bot-engine";
import { fetchLiveCandlesForSymbol } from "./market-data/market-data";
import { generateOpportunityAnalysis } from "./opportunity-analysis";
import type {
  PersistedAssetRecord,
  PersistedMarketEvent,
  PersistedPredictionHistoryRecord,
  PersistedScannerResult,
  PersistedWorkspaceData,
} from "./workspace-types";
import type { LiveCandle, SupportedChartInterval } from "./market-data/provider-types";

function computeSignedMovePercent(
  action: PersistedPredictionHistoryRecord["actionAtCall"],
  entryPrice: number,
  currentPrice: number,
) {
  if (entryPrice <= 0) {
    return 0;
  }

  if (action === "SELL") {
    return ((entryPrice - currentPrice) / entryPrice) * 100;
  }

  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

function computeExcursions(
  action: PersistedPredictionHistoryRecord["actionAtCall"],
  entryPrice: number,
  currentPrice: number,
) {
  const signedMove = computeSignedMovePercent(action, entryPrice, currentPrice);

  return {
    adverse: signedMove < 0 ? Math.abs(signedMove) : 0,
    favorable: signedMove > 0 ? signedMove : 0,
    signedMove,
  };
}

function getRelevantEvents(events: PersistedMarketEvent[], symbol: string) {
  return events
    .filter((event) => event.relatedSymbols.includes(symbol) || event.scope === "Macro")
    .slice(0, 3);
}

function buildPredictionNarrative(input: {
  ambiguousResolution?: boolean;
  eventContext: string;
  outcome: PersistedPredictionHistoryRecord["outcome"];
  resolutionMethod?: PersistedPredictionHistoryRecord["resolutionMethod"];
  symbol: string;
}) {
  const resolutionNote =
    input.resolutionMethod === "lower-timeframe-drilldown"
      ? " The outcome was resolved from a lower-timeframe drilldown after the higher bar touched both stop and target."
      : input.resolutionMethod === "candle-range"
      ? input.ambiguousResolution
        ? " A single candle touched both stop and target, so Siggi logged the outcome conservatively as a stop."
        : " The outcome was resolved from live candle highs and lows."
      : " The outcome was resolved from the latest synced price snapshot.";

  if (input.outcome === "Hit Target") {
    return `${input.symbol} reached the planned target after Siggi locked the entry.${resolutionNote} ${input.eventContext}`.trim();
  }

  if (input.outcome === "Stopped") {
    return `${input.symbol} invalidated the setup and hit the tracked stop after entry was locked.${resolutionNote} ${input.eventContext}`.trim();
  }

  return `${input.symbol} is still being monitored live against the locked stop and target. ${input.eventContext}`.trim();
}

function resolveMonitoringInterval(
  record: Pick<PersistedPredictionHistoryRecord, "horizon" | "timeframe">,
): SupportedChartInterval {
  const timeframe = record.timeframe.toLowerCase();

  if (timeframe.includes("15")) {
    return "15min";
  }

  if (timeframe.includes("1h") || timeframe.includes("60")) {
    return "1h";
  }

  if (timeframe.includes("4h") || timeframe.includes("240")) {
    return "4h";
  }

  if (record.horizon === "Day") {
    return "15min";
  }

  if (record.horizon === "Week") {
    return "4h";
  }

  return "1day";
}

function resolveMonitoringOutputSize(
  interval: SupportedChartInterval,
  record: Pick<PersistedPredictionHistoryRecord, "horizon">,
) {
  if (interval === "15min") {
    return record.horizon === "Day" ? 160 : 220;
  }

  if (interval === "1h") {
    return 180;
  }

  if (interval === "4h") {
    return 120;
  }

  return 90;
}

function resolveDrilldownInterval(interval: SupportedChartInterval) {
  if (interval === "1day") {
    return "4h" as const;
  }

  if (interval === "4h") {
    return "1h" as const;
  }

  if (interval === "1h") {
    return "15min" as const;
  }

  return null;
}

function getIntervalWindowMs(interval: SupportedChartInterval) {
  if (interval === "15min") {
    return 15 * 60 * 1000;
  }

  if (interval === "1h") {
    return 60 * 60 * 1000;
  }

  if (interval === "4h") {
    return 4 * 60 * 60 * 1000;
  }

  return 24 * 60 * 60 * 1000;
}

function getMonitoringCandles(
  candles: LiveCandle[],
  calledAt: string,
  lastCandleCheckAt: string | null,
  interval: SupportedChartInterval,
) {
  const calledAtMs = Date.parse(calledAt);
  const lastCheckMs = lastCandleCheckAt ? Date.parse(lastCandleCheckAt) : Number.NaN;
  const cutoffBase = Number.isFinite(lastCheckMs) ? Math.max(calledAtMs, lastCheckMs) : calledAtMs;
  const cutoff = cutoffBase - getIntervalWindowMs(interval);

  return candles.filter((candle) => {
    const candleTime = Date.parse(candle.datetime);
    return Number.isFinite(candleTime) && candleTime >= cutoff;
  });
}

function computeCandleRangeExcursions(
  action: PersistedPredictionHistoryRecord["actionAtCall"],
  entryPrice: number,
  candles: LiveCandle[],
  fallbackPrice: number,
) {
  if (candles.length === 0) {
    return computeExcursions(action, entryPrice, fallbackPrice);
  }

  const highWatermark = candles.reduce((maxValue, candle) => Math.max(maxValue, candle.high), -Infinity);
  const lowWatermark = candles.reduce((minValue, candle) => Math.min(minValue, candle.low), Infinity);
  const latestClose = candles.at(-1)?.close ?? fallbackPrice;

  if (action === "SELL") {
    return {
      adverse:
        highWatermark > entryPrice ? ((highWatermark - entryPrice) / entryPrice) * 100 : 0,
      favorable:
        lowWatermark < entryPrice ? ((entryPrice - lowWatermark) / entryPrice) * 100 : 0,
      signedMove: ((entryPrice - latestClose) / entryPrice) * 100,
    };
  }

  return {
    adverse:
      lowWatermark < entryPrice ? ((entryPrice - lowWatermark) / entryPrice) * 100 : 0,
    favorable:
      highWatermark > entryPrice ? ((highWatermark - entryPrice) / entryPrice) * 100 : 0,
    signedMove: ((latestClose - entryPrice) / entryPrice) * 100,
  };
}

function resolveOutcomeFromCandles(
  record: PersistedPredictionHistoryRecord,
  candles: LiveCandle[],
) {
  for (const candle of candles) {
    if (record.actionAtCall === "SELL") {
      const targetHit = candle.low <= record.targetPriceAtCall;
      const stopHit = candle.high >= record.stopPriceAtCall;

      if (targetHit && stopHit) {
        return {
          ambiguousResolution: true,
          outcome: "Stopped" as const,
        };
      }

      if (targetHit) {
        return {
          ambiguousResolution: false,
          outcome: "Hit Target" as const,
        };
      }

      if (stopHit) {
        return {
          ambiguousResolution: false,
          outcome: "Stopped" as const,
        };
      }

      continue;
    }

    const targetHit = candle.high >= record.targetPriceAtCall;
    const stopHit = candle.low <= record.stopPriceAtCall;

    if (targetHit && stopHit) {
      return {
        ambiguousResolution: true,
        outcome: "Stopped" as const,
      };
    }

    if (targetHit) {
      return {
        ambiguousResolution: false,
        outcome: "Hit Target" as const,
      };
    }

    if (stopHit) {
      return {
        ambiguousResolution: false,
        outcome: "Stopped" as const,
      };
    }
  }

  return null;
}

async function resolveAmbiguousOutcomeWithDrilldown(input: {
  interval: SupportedChartInterval;
  record: PersistedPredictionHistoryRecord;
}) {
  const drilldownInterval = resolveDrilldownInterval(input.interval);

  if (!drilldownInterval) {
    return null;
  }

  const drilldownSeries = await fetchLiveCandlesForSymbol(
    input.record.symbol,
    drilldownInterval,
    resolveMonitoringOutputSize(drilldownInterval, input.record),
  ).catch(() => null);

  if (!drilldownSeries) {
    return null;
  }

  const drilldownCandles = getMonitoringCandles(
    drilldownSeries.candles,
    input.record.calledAt,
    input.record.lastCandleCheckAt,
    drilldownInterval,
  );

  if (drilldownCandles.length === 0) {
    return null;
  }

  const drilldownOutcome = resolveOutcomeFromCandles(input.record, drilldownCandles);

  if (!drilldownOutcome || drilldownOutcome.ambiguousResolution) {
    return null;
  }

  return {
    candles: drilldownCandles,
    interval: drilldownInterval,
    outcome: drilldownOutcome.outcome,
  };
}

function createPredictionRecord(input: {
  asset: PersistedAssetRecord;
  events: PersistedMarketEvent[];
  setup: PersistedScannerResult;
  syncedAt: string;
  view: ReturnType<typeof buildBotOpportunityView>;
}): PersistedPredictionHistoryRecord {
  const entryLow = input.setup.analysis?.chartAnnotations.entryZone.low ?? input.asset.price;
  const entryHigh = input.setup.analysis?.chartAnnotations.entryZone.high ?? input.asset.price;
  const stopPrice =
    input.setup.analysis?.chartAnnotations.stopLevel ??
    (Number.isFinite(Number.parseFloat(input.view.stop))
      ? Number.parseFloat(input.view.stop)
      : input.asset.price);
  const targetPrice =
    input.setup.analysis?.chartAnnotations.targetLevel ??
    (Number.isFinite(Number.parseFloat(input.view.target))
      ? Number.parseFloat(input.view.target)
      : input.asset.price);
  const indicatorSnapshotAtCall =
    input.setup.analysis?.indicatorSweep?.map(
      (item) => `${item.label}: ${item.status} / ${item.detail}`,
    ) ?? [input.setup.analysis?.indicatorSummary ?? "Indicator sweep pending."];
  const strategySnapshotAtCall =
    input.setup.analysis?.strategyChecks?.map(
      (item) => `${item.label}: ${item.status} / ${item.detail}`,
    ) ?? [input.setup.strategy];
  const validationSnapshotAtCall = [
    input.setup.analysis?.validationSummary ?? "Validation summary pending.",
    input.view.confirmationSummary,
    input.view.backtestSummary,
  ];
  const eventContext = input.events.length
    ? input.events.map((event) => `${event.title} (${event.bias}, ${event.impact})`).join(" | ")
    : "No urgent event pressure was attached at the time of the call.";

  return {
    id: `prediction-live-${input.setup.id}-${Date.parse(input.syncedAt)}`,
    symbol: input.setup.symbol,
    instrumentName: input.asset.name,
    assetClass: input.asset.assetClass,
    strategyAtCall: input.setup.strategy,
    timeframe: input.setup.timeframe,
    horizon: input.view.horizon,
    sourceScannerResultId: input.setup.id,
    trendAtCall: input.view.direction,
    actionAtCall: input.view.opportunityAction,
    decisionAtCall: input.view.decision.label,
    confidenceAtCall: input.view.confidence,
    monitoringStatus: "Active",
    priceAtCall: input.asset.price,
    entryLowAtCall: entryLow,
    entryHighAtCall: entryHigh,
    stopPriceAtCall: stopPrice,
    targetPriceAtCall: targetPrice,
    entryAtCall: input.view.entry,
    discountedEntryAtCall: input.view.discountedEntry,
    stopAtCall: input.view.stop,
    targetAtCall: input.view.target,
    eventMoveAtCall: input.view.eventMove,
    eventLikelihoodAtCall: input.view.eventLikelihood,
    eventIdsAtCall: input.events.map((event) => event.id),
    eventTitlesAtCall: input.events.map((event) => event.title),
    eventContextAtCall: eventContext,
    patternSnapshotAtCall:
      input.setup.analysis?.trendPattern ??
      input.setup.analysis?.weeklyOutlook ??
      input.view.rationale,
    indicatorSnapshotAtCall,
    strategySnapshotAtCall,
    validationSnapshotAtCall,
    calledAt: input.syncedAt,
    lastCandleCheckAt: null,
    resolvedAt: null,
    resolutionMethod: "snapshot",
    ambiguousResolution: false,
    outcome: "Monitoring",
    outcomeAccuracy: "Neutral",
    moveFromCallPct: 0,
    maxFavorableExcursionPct: 0,
    maxAdverseExcursionPct: 0,
    accuracyScore: 50,
    narrative: buildPredictionNarrative({
      eventContext,
      outcome: "Monitoring",
      symbol: input.setup.symbol,
    }),
    createdAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };
}

async function resolvePredictionOutcome(
  record: PersistedPredictionHistoryRecord,
  currentPrice: number,
  syncedAt: string,
  candleRangeInput?: {
    candles: LiveCandle[];
    interval: SupportedChartInterval;
  },
) {
  const candleExcursions = candleRangeInput
    ? computeCandleRangeExcursions(
        record.actionAtCall,
        record.priceAtCall,
        candleRangeInput.candles,
        currentPrice,
      )
    : computeExcursions(record.actionAtCall, record.priceAtCall, currentPrice);
  const nextRecord: PersistedPredictionHistoryRecord = {
    ...record,
    moveFromCallPct: Number(candleExcursions.signedMove.toFixed(2)),
    maxFavorableExcursionPct: Number(
      Math.max(record.maxFavorableExcursionPct, candleExcursions.favorable).toFixed(2),
    ),
    maxAdverseExcursionPct: Number(
      Math.max(record.maxAdverseExcursionPct, candleExcursions.adverse).toFixed(2),
    ),
    lastCandleCheckAt: candleRangeInput ? syncedAt : record.lastCandleCheckAt,
    resolutionMethod: candleRangeInput ? "candle-range" : "snapshot",
    updatedAt: syncedAt,
  };

  const candleOutcome = candleRangeInput
    ? resolveOutcomeFromCandles(record, candleRangeInput.candles)
    : null;
  const drilldownResolution =
    candleOutcome?.ambiguousResolution && candleRangeInput
      ? await resolveAmbiguousOutcomeWithDrilldown({
          interval: candleRangeInput.interval,
          record,
        })
      : null;
  const effectiveOutcome = drilldownResolution
    ? {
        ambiguousResolution: false,
        outcome: drilldownResolution.outcome,
      }
    : candleOutcome;
  const effectiveExcursions = drilldownResolution
    ? computeCandleRangeExcursions(
        record.actionAtCall,
        record.priceAtCall,
        drilldownResolution.candles,
        currentPrice,
      )
    : candleExcursions;
  const resolutionMethod = drilldownResolution
    ? "lower-timeframe-drilldown"
    : candleRangeInput
      ? "candle-range"
      : "snapshot";
  const nextResolvedRecord: PersistedPredictionHistoryRecord = {
    ...nextRecord,
    moveFromCallPct: Number(effectiveExcursions.signedMove.toFixed(2)),
    maxFavorableExcursionPct: Number(
      Math.max(record.maxFavorableExcursionPct, effectiveExcursions.favorable).toFixed(2),
    ),
    maxAdverseExcursionPct: Number(
      Math.max(record.maxAdverseExcursionPct, effectiveExcursions.adverse).toFixed(2),
    ),
    resolutionMethod,
  };
  const targetHit = candleOutcome
    ? (effectiveOutcome?.outcome ?? candleOutcome.outcome) === "Hit Target"
    : record.actionAtCall === "SELL"
      ? currentPrice <= record.targetPriceAtCall
      : currentPrice >= record.targetPriceAtCall;
  const stopHit = candleOutcome
    ? (effectiveOutcome?.outcome ?? candleOutcome.outcome) === "Stopped"
    : record.actionAtCall === "SELL"
      ? currentPrice >= record.stopPriceAtCall
      : currentPrice <= record.stopPriceAtCall;

  if (targetHit || stopHit) {
    const outcome = targetHit ? "Hit Target" : "Stopped";

    return {
      ...nextResolvedRecord,
      ambiguousResolution: effectiveOutcome?.ambiguousResolution ?? false,
      monitoringStatus: "Resolved",
      resolvedAt: syncedAt,
      outcome,
      outcomeAccuracy: targetHit ? "Accurate" : "Inaccurate",
      accuracyScore: targetHit ? 100 : 0,
      narrative: buildPredictionNarrative({
        ambiguousResolution: effectiveOutcome?.ambiguousResolution ?? false,
        eventContext: record.eventContextAtCall,
        outcome,
        resolutionMethod,
        symbol: record.symbol,
      }),
    } satisfies PersistedPredictionHistoryRecord;
  }

  return nextResolvedRecord;
}

export async function refreshPredictionMemory(
  data: PersistedWorkspaceData,
  syncedAt: string,
) {
  const assetsBySymbol = new Map(data.assets.map((asset) => [asset.symbol, asset]));
  const scannerResults = [...data.scannerResults];
  let analysisRefreshBudget = 4;

  for (let index = 0; index < scannerResults.length; index += 1) {
    const scannerResult = scannerResults[index];
    const needsAnalysisRefresh =
      !scannerResult.analysis ||
      !scannerResult.analysis.multiTimeframeChecks?.length ||
      scannerResult.analysis.multiTimeframeSummary.includes("not available yet") ||
      scannerResult.analysis.regimeSummary.includes("not available yet");

    if (
      needsAnalysisRefresh &&
      analysisRefreshBudget > 0 &&
      scannerResult.tradeability !== "BLOCKED"
    ) {
      try {
        const analysis = await generateOpportunityAnalysis(scannerResult);
        scannerResults[index] = {
          ...scannerResult,
          analysis,
          analysisStatus: "Analysed",
          analysisUpdatedAt: analysis.analyzedAt,
          updatedAt: syncedAt,
        };
        analysisRefreshBudget -= 1;
      } catch {
        // Keep sync resilient even if one analysis call fails.
      }
    }
  }

  data.scannerResults = scannerResults;

  const activeRecords = data.predictionHistory.filter(
    (record) => record.monitoringStatus === "Active",
  );
  const activeBySetupId = new Set(
    activeRecords.map((record) => record.sourceScannerResultId).filter(Boolean),
  );

  for (const scannerResult of data.scannerResults) {
    const asset = assetsBySymbol.get(scannerResult.symbol) ?? null;

    if (!asset) {
      continue;
    }

    const view = buildBotOpportunityView(
      scannerResult,
      asset,
      data.confirmationChecks,
      data.marketEvents,
      data.backtests,
      data.predictionHistory,
    );

    if (
      view.decision.label === "ENTER NOW" &&
      view.opportunityAction !== "WAIT" &&
      !activeBySetupId.has(scannerResult.id)
    ) {
      const record = createPredictionRecord({
        asset,
        events: getRelevantEvents(data.marketEvents, scannerResult.symbol),
        setup: scannerResult,
        syncedAt,
        view,
      });

      data.predictionHistory.unshift(record);
      activeBySetupId.add(scannerResult.id);
    }
  }

  const candleCache = new Map<
    string,
    Promise<{
      candles: LiveCandle[];
      interval: SupportedChartInterval;
    } | null>
  >();

  data.predictionHistory = await Promise.all(data.predictionHistory.map(async (record) => {
    if (record.monitoringStatus !== "Active") {
      return record;
    }

    const asset = assetsBySymbol.get(record.symbol);

    if (!asset) {
      return record;
    }

    const interval = resolveMonitoringInterval(record);
    const cacheKey = `${record.symbol}:${interval}`;

    if (!candleCache.has(cacheKey)) {
      candleCache.set(
        cacheKey,
        fetchLiveCandlesForSymbol(
          record.symbol,
          interval,
          resolveMonitoringOutputSize(interval, record),
        )
          .then((series) => ({
            candles: getMonitoringCandles(
              series.candles,
              record.calledAt,
              record.lastCandleCheckAt,
              interval,
            ),
            interval,
          }))
          .catch(() => null),
      );
    }

    const candleRangeInput = await candleCache.get(cacheKey);

    return resolvePredictionOutcome(
      record,
      asset.price,
      syncedAt,
      candleRangeInput && candleRangeInput.candles.length > 0 ? candleRangeInput : undefined,
    );
  }));

  return data;
}
