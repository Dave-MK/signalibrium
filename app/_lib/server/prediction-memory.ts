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

function buildResolutionEvidence(input: {
  ambiguousResolution?: boolean;
  outcome: PersistedPredictionHistoryRecord["outcome"];
  resolutionMethod?: PersistedPredictionHistoryRecord["resolutionMethod"];
  sequenceEvidenceNote?: string | null;
}) {
  if (input.outcome === "Monitoring") {
    return null;
  }

  if (input.outcome === "Ambiguous") {
    return "Stop and target both printed in the same candle, so order could not be confirmed.";
  }

  if (input.resolutionMethod === "pulse-tape") {
    return (
      input.sequenceEvidenceNote ??
      "Resolved from Siggi's pulse tape after the higher bars overlapped both levels."
    );
  }

  if (input.resolutionMethod === "lower-timeframe-drilldown") {
    return "Resolved from lower-timeframe drilldown before any fallback inference was needed.";
  }

  if (input.resolutionMethod === "sequence-inference") {
    return "Inferred from the final bar path because deeper drilldown still overlapped both levels.";
  }

  if (input.resolutionMethod === "candle-range") {
    return "Resolved from live candle highs and lows.";
  }

  return "Resolved from the latest synced price snapshot.";
}

function buildPredictionNarrative(input: {
  ambiguousResolution?: boolean;
  eventContext: string;
  outcome: PersistedPredictionHistoryRecord["outcome"];
  resolutionMethod?: PersistedPredictionHistoryRecord["resolutionMethod"];
  sequenceEvidenceNote?: string | null;
  symbol: string;
}) {
  const resolutionNote =
    input.resolutionMethod === "pulse-tape"
      ? " The outcome was resolved from Siggi's pulse tape after the higher and lower candles still overlapped both stop and target."
      : input.resolutionMethod === "sequence-inference"
      ? " The outcome was inferred from the candle path after deeper drilldown data still touched both stop and target inside the same final bar."
      : input.resolutionMethod === "lower-timeframe-drilldown"
      ? " The outcome was resolved from a lower-timeframe drilldown after the higher bar touched both stop and target."
      : input.resolutionMethod === "candle-range"
      ? input.ambiguousResolution
        ? " A single candle touched both stop and target, and the candle data could not confirm which level printed first."
        : " The outcome was resolved from live candle highs and lows."
      : " The outcome was resolved from the latest synced price snapshot.";

  const ambiguityTail =
    input.resolutionMethod === "lower-timeframe-drilldown" ||
    input.resolutionMethod === "pulse-tape"
      ? ""
      : input.resolutionMethod === "sequence-inference"
        ? " Siggi used a best-effort sequence inference rather than assuming the stop was hit first."
        : "";
  const evidenceTail = input.sequenceEvidenceNote ? ` ${input.sequenceEvidenceNote}` : "";

  if (input.outcome === "Hit Target") {
    return `${input.symbol} reached the planned target after Siggi locked the entry.${resolutionNote}${ambiguityTail}${evidenceTail} ${input.eventContext}`.trim();
  }

  if (input.outcome === "Stopped") {
    return `${input.symbol} invalidated the setup and hit the tracked stop after entry was locked.${resolutionNote}${ambiguityTail}${evidenceTail} ${input.eventContext}`.trim();
  }

  if (input.outcome === "Ambiguous") {
    return `${input.symbol} traded through both the tracked stop and target after entry was locked.${resolutionNote} Siggi logged this outcome as ambiguous rather than assuming the stop was hit first. ${input.eventContext}`.trim();
  }

  return `${input.symbol} is still being monitored live against the locked stop and target. ${input.eventContext}`.trim();
}

function resolveMonitoringInterval(
  record: Pick<PersistedPredictionHistoryRecord, "horizon" | "timeframe">,
): SupportedChartInterval {
  const timeframe = record.timeframe.toLowerCase();

  if (timeframe.includes("1m")) {
    return "1min";
  }

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
  if (interval === "1min") {
    return record.horizon === "Day" ? 180 : 240;
  }

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
  if (interval === "15min") {
    return "1min" as const;
  }

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
  if (interval === "1min") {
    return 60 * 1000;
  }

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

function getCandleTimestampMs(candle: LiveCandle) {
  const normalized = candle.datetime.includes("T")
    ? candle.datetime
    : `${candle.datetime.replace(" ", "T")}Z`;
  return Date.parse(normalized);
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
          outcome: "Ambiguous" as const,
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
        outcome: "Ambiguous" as const,
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

function getAmbiguousCandle(
  record: PersistedPredictionHistoryRecord,
  candles: LiveCandle[],
) {
  return candles.find((candle) => {
    if (record.actionAtCall === "SELL") {
      return (
        candle.low <= record.targetPriceAtCall &&
        candle.high >= record.stopPriceAtCall
      );
    }

    return (
      candle.high >= record.targetPriceAtCall &&
      candle.low <= record.stopPriceAtCall
    );
  }) ?? null;
}

function inferOutcomeFromCandleSequence(
  record: PersistedPredictionHistoryRecord,
  candle: LiveCandle,
) {
  const bullishOrFlat = candle.close >= candle.open;

  if (record.actionAtCall === "SELL") {
    return bullishOrFlat ? "Hit Target" : "Stopped";
  }

  return bullishOrFlat ? "Stopped" : "Hit Target";
}

function formatEvidenceTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    return timestamp;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/London",
    timeZoneName: "short",
  }).format(new Date(parsed));
}

function filterCandlesToParentWindow(
  candles: LiveCandle[],
  parentCandle: LiveCandle,
  parentInterval: SupportedChartInterval,
) {
  const parentStartMs = getCandleTimestampMs(parentCandle);

  if (!Number.isFinite(parentStartMs)) {
    return candles;
  }

  const parentEndMs = parentStartMs + getIntervalWindowMs(parentInterval);

  return candles.filter((candle) => {
    const candleTimeMs = getCandleTimestampMs(candle);

    return (
      Number.isFinite(candleTimeMs) &&
      candleTimeMs >= parentStartMs &&
      candleTimeMs < parentEndMs
    );
  });
}

function resolveOutcomeFromPulseTape(input: {
  pulseTape: Array<{ at: string; price: number }>;
  record: PersistedPredictionHistoryRecord;
}) {
  const relevantPoints = input.pulseTape.filter((point) => {
    const pointTime = Date.parse(point.at);
    const calledAtTime = Date.parse(input.record.calledAt);
    const lastCheckTime = input.record.lastCandleCheckAt
      ? Date.parse(input.record.lastCandleCheckAt)
      : Number.NaN;
    const cutoff = Number.isFinite(lastCheckTime)
      ? Math.max(calledAtTime, lastCheckTime)
      : calledAtTime;

    return Number.isFinite(pointTime) && pointTime >= cutoff;
  });

  let firstOutcome: "Hit Target" | "Stopped" | null = null;
  let targetTouchedAt: string | null = null;
  let stopTouchedAt: string | null = null;

  for (const point of relevantPoints) {
    if (input.record.actionAtCall === "SELL") {
      const targetHit = point.price <= input.record.targetPriceAtCall;
      const stopHit = point.price >= input.record.stopPriceAtCall;

      if (targetHit && !targetTouchedAt) {
        targetTouchedAt = point.at;
      }

      if (stopHit && !stopTouchedAt) {
        stopTouchedAt = point.at;
      }

      if (!firstOutcome) {
        if (targetHit) {
          firstOutcome = "Hit Target";
        } else if (stopHit) {
          firstOutcome = "Stopped";
        }
      }

      if (firstOutcome && targetTouchedAt && stopTouchedAt) {
        break;
      }

      continue;
    }

    const targetHit = point.price >= input.record.targetPriceAtCall;
    const stopHit = point.price <= input.record.stopPriceAtCall;

    if (targetHit && !targetTouchedAt) {
      targetTouchedAt = point.at;
    }

    if (stopHit && !stopTouchedAt) {
      stopTouchedAt = point.at;
    }

    if (!firstOutcome) {
      if (targetHit) {
        firstOutcome = "Hit Target";
      } else if (stopHit) {
        firstOutcome = "Stopped";
      }
    }

    if (firstOutcome && targetTouchedAt && stopTouchedAt) {
      break;
    }
  }

  if (!firstOutcome) {
    return null;
  }

  return {
    outcome: firstOutcome,
    sequenceEvidenceNote:
      targetTouchedAt && stopTouchedAt
        ? `The pulse tape first registered ${
            firstOutcome === "Hit Target" ? "target" : "stop"
          } at ${formatEvidenceTimestamp(
            firstOutcome === "Hit Target" ? targetTouchedAt : stopTouchedAt,
          )} and the other level at ${formatEvidenceTimestamp(
            firstOutcome === "Hit Target" ? stopTouchedAt : targetTouchedAt,
          )}.`
        : targetTouchedAt
          ? `The pulse tape first registered target at ${formatEvidenceTimestamp(targetTouchedAt)}.`
          : stopTouchedAt
            ? `The pulse tape first registered stop at ${formatEvidenceTimestamp(stopTouchedAt)}.`
            : null,
  };
}

async function resolveAmbiguousOutcomeWithDrilldown(input: {
  candles: LiveCandle[];
  interval: SupportedChartInterval;
  pulseTape: Array<{ at: string; price: number }>;
  record: PersistedPredictionHistoryRecord;
}) {
  let parentCandles = input.candles;
  let parentInterval = input.interval;
  let parentAmbiguousCandle = getAmbiguousCandle(input.record, input.candles);
  let drilldownInterval = resolveDrilldownInterval(parentInterval);

  while (drilldownInterval && parentAmbiguousCandle) {
    const drilldownSeries = await fetchLiveCandlesForSymbol(
      input.record.symbol,
      drilldownInterval,
      resolveMonitoringOutputSize(drilldownInterval, input.record),
    ).catch(() => null);

    if (!drilldownSeries) {
      return null;
    }

    const monitoringCandles = getMonitoringCandles(
      drilldownSeries.candles,
      input.record.calledAt,
      input.record.lastCandleCheckAt,
      drilldownInterval,
    );
    const drilldownCandles = filterCandlesToParentWindow(
      monitoringCandles,
      parentAmbiguousCandle,
      parentInterval,
    );

    if (drilldownCandles.length === 0) {
      return null;
    }

    const drilldownOutcome = resolveOutcomeFromCandles(input.record, drilldownCandles);

    if (drilldownOutcome && !drilldownOutcome.ambiguousResolution) {
      return {
        candles: drilldownCandles,
        interval: drilldownInterval,
        outcome: drilldownOutcome.outcome,
        resolutionMethod: "lower-timeframe-drilldown" as const,
      };
    }

    parentCandles = drilldownCandles;
    parentInterval = drilldownInterval;
    parentAmbiguousCandle = getAmbiguousCandle(input.record, drilldownCandles);
    drilldownInterval = resolveDrilldownInterval(drilldownInterval);
  }

  if (!parentAmbiguousCandle) {
    return null;
  }

  const pulseTapeOutcome = resolveOutcomeFromPulseTape({
    pulseTape: input.pulseTape,
    record: input.record,
  });

  if (pulseTapeOutcome) {
    return {
      candles: parentCandles,
      interval: parentInterval,
      outcome: pulseTapeOutcome.outcome,
      resolutionMethod: "pulse-tape" as const,
      sequenceEvidenceNote: pulseTapeOutcome.sequenceEvidenceNote,
    };
  }

  return {
    candles: parentCandles,
    interval: parentInterval,
    outcome: inferOutcomeFromCandleSequence(input.record, parentAmbiguousCandle),
    resolutionMethod: "sequence-inference" as const,
  };
}

function assertPriceScaleConsistency(
  label: string,
  zonePrice: number,
  assetPrice: number,
  symbol: string,
) {
  if (assetPrice <= 0 || zonePrice <= 0) return;
  const drift = Math.abs(zonePrice - assetPrice) / assetPrice;

  if (drift > 0.25) {
    console.warn(
      `[Currency mismatch] ${symbol} ${label}: zone=${zonePrice.toFixed(4)}, live=${assetPrice.toFixed(4)}, drift=${(drift * 100).toFixed(1)}% — likely USD vs GBP. Check FX normalisation.`,
    );
  }
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

  assertPriceScaleConsistency("entryZone", (entryLow + entryHigh) / 2, input.asset.price, input.setup.symbol);
  assertPriceScaleConsistency("stop", stopPrice, input.asset.price, input.setup.symbol);
  assertPriceScaleConsistency("target", targetPrice, input.asset.price, input.setup.symbol);
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
    discountedEntryAtCall: input.view.entry,
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
    resolutionEvidence: null,
    resolvedSource: null,
    tradedStatus: null,
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
  pulseTape: Array<{ at: string; price: number }> = [],
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
          candles: candleRangeInput.candles,
          interval: candleRangeInput.interval,
          pulseTape,
          record,
        })
      : null;
  const effectiveOutcome = drilldownResolution
    ? {
        ambiguousResolution: false,
        outcome: drilldownResolution.outcome,
        sequenceEvidenceNote: drilldownResolution.sequenceEvidenceNote ?? null,
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
    ? drilldownResolution.resolutionMethod
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
  const ambiguousHit = (effectiveOutcome?.outcome ?? candleOutcome?.outcome) === "Ambiguous";

  const priceResolvedSource = candleRangeInput ? "candle_range" : "price_snapshot";

  if (ambiguousHit) {
    const resolutionEvidence = buildResolutionEvidence({
      ambiguousResolution: true,
      outcome: "Ambiguous",
      resolutionMethod,
      sequenceEvidenceNote:
        effectiveOutcome && "sequenceEvidenceNote" in effectiveOutcome
          ? effectiveOutcome.sequenceEvidenceNote
          : null,
    });

    return {
      ...nextResolvedRecord,
      ambiguousResolution: true,
      monitoringStatus: "Resolved",
      resolvedAt: syncedAt,
      outcome: "Ambiguous",
      outcomeAccuracy: "Neutral",
      accuracyScore: 50,
      resolutionEvidence,
      resolvedSource: priceResolvedSource,
      narrative: buildPredictionNarrative({
        ambiguousResolution: true,
        eventContext: record.eventContextAtCall,
        outcome: "Ambiguous",
        resolutionMethod,
        sequenceEvidenceNote:
          effectiveOutcome && "sequenceEvidenceNote" in effectiveOutcome
            ? effectiveOutcome.sequenceEvidenceNote
            : null,
        symbol: record.symbol,
      }),
    } satisfies PersistedPredictionHistoryRecord;
  }

  if (targetHit || stopHit) {
    const outcome = targetHit ? "Hit Target" : "Stopped";
    const resolutionEvidence = buildResolutionEvidence({
      ambiguousResolution: effectiveOutcome?.ambiguousResolution ?? false,
      outcome,
      resolutionMethod,
      sequenceEvidenceNote:
        effectiveOutcome && "sequenceEvidenceNote" in effectiveOutcome
          ? effectiveOutcome.sequenceEvidenceNote
          : null,
    });

    return {
      ...nextResolvedRecord,
      ambiguousResolution: effectiveOutcome?.ambiguousResolution ?? false,
      monitoringStatus: "Resolved",
      resolvedAt: syncedAt,
      outcome,
      outcomeAccuracy: targetHit ? "Accurate" : "Inaccurate",
      accuracyScore: targetHit ? 100 : 0,
      resolutionEvidence,
      resolvedSource: priceResolvedSource,
      narrative: buildPredictionNarrative({
        ambiguousResolution: effectiveOutcome?.ambiguousResolution ?? false,
        eventContext: record.eventContextAtCall,
        outcome,
        resolutionMethod,
        sequenceEvidenceNote:
          effectiveOutcome && "sequenceEvidenceNote" in effectiveOutcome
            ? effectiveOutcome.sequenceEvidenceNote
            : null,
        symbol: record.symbol,
      }),
    } satisfies PersistedPredictionHistoryRecord;
  }

  return nextResolvedRecord;
}

export async function refreshPredictionMemory(
  data: PersistedWorkspaceData,
  syncedAt: string,
  options?: {
    createNewCalls?: boolean;
    refreshAnalyses?: boolean;
  },
) {
  const createNewCalls = options?.createNewCalls ?? true;
  const refreshAnalyses = options?.refreshAnalyses ?? true;
  const assetsBySymbol = new Map(data.assets.map((asset) => [asset.symbol, asset]));
  const scannerResults = [...data.scannerResults];
  let analysisRefreshBudget = refreshAnalyses ? 4 : 0;

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
      createNewCalls &&
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

  // Build set of prediction IDs that have an active live trade — those resolve via the trade only
  const activeTradeByPredictionId = new Set(
    data.siggiAccount.openTrades.map((trade) => trade.predictionId),
  );

  data.predictionHistory = await Promise.all(data.predictionHistory.map(async (record) => {
    if (record.monitoringStatus !== "Active") {
      return record;
    }

    // Siggi has an open trade on this signal — the trade outcome is the only valid resolution
    if (activeTradeByPredictionId.has(record.id)) {
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
      data.syncState.pricePulseTape[record.symbol] ?? [],
    );
  }));

  return data;
}
