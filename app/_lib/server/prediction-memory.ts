import { buildBotOpportunityView } from "@/app/_lib/bot-engine";
import { fetchLiveCandlesForSymbol } from "./market-data/market-data";
import { generateOpportunityAnalysis } from "./opportunity-analysis";
import { sendTelegramMessage, formatEnterNowMessage } from "./telegram";
import type {
  PersistedAssetRecord,
  PersistedMarketEvent,
  PersistedPredictionHistoryRecord,
  PersistedScannerResult,
  PersistedWorkspaceData,
} from "./workspace-types";
import type { LiveCandle, SupportedChartInterval } from "./market-data/provider-types";

/**
 * Fire a Telegram ENTER NOW notification for a newly created prediction.
 * Takes the fully-formed prediction record so all fields are already resolved.
 * Never throws — wrapped in try/catch so it can't break the sync pipeline.
 */
async function fireEnterNowAlert(record: PersistedPredictionHistoryRecord): Promise<void> {
  try {
    const msg = formatEnterNowMessage({
      symbol: record.symbol,
      instrumentName: record.instrumentName,
      action: record.actionAtCall === "SELL" ? "Sell" : "Buy",
      entryZone: record.entryAtCall,
      stopLoss: record.stopAtCall,
      takeProfit: record.targetAtCall,
      strategy: record.strategyAtCall,
      timeframe: record.timeframe,
      score: record.confidenceAtCall,
    });
    await sendTelegramMessage(msg);
  } catch {
    // Non-fatal — notification failure must never break the sync
  }
}

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
  record?: Pick<
    PersistedPredictionHistoryRecord,
    "actionAtCall" | "stopPriceAtCall" | "targetPriceAtCall" | "priceAtCall"
  >;
}) {
  if (input.outcome === "Monitoring") return null;

  const r = input.record;
  const dp = r
    ? (r.stopPriceAtCall < 10 ? 4 : r.stopPriceAtCall < 1000 ? 2 : 0)
    : 2;
  const stopFmt   = r ? r.stopPriceAtCall.toFixed(dp)   : "stop";
  const targetFmt = r ? r.targetPriceAtCall.toFixed(dp) : "target";
  const direction = r ? (r.actionAtCall === "SELL" ? "short" : "long") : "";

  if (input.outcome === "Hit Target") {
    const base = `Hit ${direction} target at ${targetFmt}`;
    if (input.sequenceEvidenceNote) return `${base}. ${input.sequenceEvidenceNote}`;
    if (input.ambiguousResolution)  return `${base} — both levels were inside the same candle; resolved by candle direction.`;
    return base + ".";
  }

  if (input.outcome === "Stopped") {
    const base = `Stopped out on ${direction} at ${stopFmt}`;
    if (input.sequenceEvidenceNote) return `${base}. ${input.sequenceEvidenceNote}`;
    if (input.ambiguousResolution)  return `${base} — both levels were inside the same candle; resolved by candle direction.`;
    return base + ".";
  }

  if (input.outcome === "Ambiguous") {
    return `Stop (${stopFmt}) and target (${targetFmt}) both printed in the same candle — sequence could not be confirmed.`;
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
  record?: Pick<
    PersistedPredictionHistoryRecord,
    "actionAtCall" | "stopPriceAtCall" | "targetPriceAtCall" | "priceAtCall"
  >;
}) {
  const r = input.record;
  const dp = r
    ? (r.stopPriceAtCall < 10 ? 4 : r.stopPriceAtCall < 1000 ? 2 : 0)
    : 2;
  const direction   = r ? (r.actionAtCall === "SELL" ? "short" : "long") : "";
  const stopFmt     = r ? r.stopPriceAtCall.toFixed(dp)   : "the stop";
  const targetFmt   = r ? r.targetPriceAtCall.toFixed(dp) : "the target";
  const entryFmt    = r ? r.priceAtCall.toFixed(dp)       : "entry";

  // Concise note appended when both levels were inside the same candle
  const sameBarNote = input.ambiguousResolution
    ? " Both stop and target were inside the same candle; resolved by candle close direction."
    : "";
  // Sequence evidence from pulse tape (already human-readable timestamps)
  const seqNote = input.sequenceEvidenceNote ? ` ${input.sequenceEvidenceNote}` : "";
  // Trim eventContext to a short clause — take first sentence or first 120 chars
  const evtSummary = input.eventContext
    ? ` ${input.eventContext.split(".")[0].slice(0, 120)}.`
    : "";

  if (input.outcome === "Hit Target") {
    const moveDesc = r
      ? r.actionAtCall === "SELL"
        ? `fell from ${entryFmt} to hit the ${targetFmt} target`
        : `rose from ${entryFmt} to hit the ${targetFmt} target`
      : "hit the target";
    return `${input.symbol} (${direction}) ${moveDesc}.${sameBarNote}${seqNote}${evtSummary}`.trim();
  }

  if (input.outcome === "Stopped") {
    const moveDesc = r
      ? r.actionAtCall === "SELL"
        ? `rose from ${entryFmt} and hit the ${stopFmt} stop`
        : `fell from ${entryFmt} and hit the ${stopFmt} stop`
      : "hit the stop";
    return `${input.symbol} (${direction}) ${moveDesc}.${sameBarNote}${seqNote}${evtSummary}`.trim();
  }

  if (input.outcome === "Ambiguous") {
    return `${input.symbol} (${direction}) traded through both stop (${stopFmt}) and target (${targetFmt}) — sequence could not be confirmed.${evtSummary}`.trim();
  }

  return `${input.symbol} is being monitored against stop ${stopFmt} and target ${targetFmt}.${evtSummary}`.trim();
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
      // For a SHORT: target is below entry (price falls = profit), stop is above entry (price rises = loss)
      const targetHit = candle.low  <= record.targetPriceAtCall;
      const stopHit   = candle.high >= record.stopPriceAtCall;

      if (targetHit && stopHit) {
        // Both levels inside the same candle — use the candle's close direction as tiebreaker:
        // a bearish close (close < open) means price mostly fell → target hit first.
        // a bullish close means price mostly rose → stop hit first.
        return {
          ambiguousResolution: true,
          outcome: inferOutcomeFromCandleSequence(record, candle),
        };
      }

      if (targetHit) return { ambiguousResolution: false, outcome: "Hit Target" as const };
      if (stopHit)   return { ambiguousResolution: false, outcome: "Stopped"    as const };

      continue;
    }

    // BUY: target is above entry (price rises = profit), stop is below entry (price falls = loss)
    const targetHit = candle.high >= record.targetPriceAtCall;
    const stopHit   = candle.low  <= record.stopPriceAtCall;

    if (targetHit && stopHit) {
      // Bullish close = price mostly rose → target hit first.
      // Bearish close = price mostly fell → stop hit first.
      return {
        ambiguousResolution: true,
        outcome: inferOutcomeFromCandleSequence(record, candle),
      };
    }

    if (targetHit) return { ambiguousResolution: false, outcome: "Hit Target" as const };
    if (stopHit)   return { ambiguousResolution: false, outcome: "Stopped"    as const };
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
    // Short: bullish candle = price went up = stop hit (bad); bearish = target hit (good)
    return bullishOrFlat ? "Stopped" : "Hit Target";
  }

  // Long: bullish candle = price went up = target hit (good); bearish = stop hit (bad)
  return bullishOrFlat ? "Hit Target" : "Stopped";
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
        // Pessimistic tiebreaker: when both fire on the same price point, stop wins.
        if (stopHit)   firstOutcome = "Stopped";
        else if (targetHit) firstOutcome = "Hit Target";
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
      // Pessimistic tiebreaker: stop wins when both fire simultaneously.
      if (stopHit)   firstOutcome = "Stopped";
      else if (targetHit) firstOutcome = "Hit Target";
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
  // The ambiguous candle is the one where both stop and target were inside the same bar.
  // We make one attempt to clarify using a lower-timeframe series.
  // If that still can't differentiate, we fall back to the pulse tape or candle direction.
  const ambiguousCandle = getAmbiguousCandle(input.record, input.candles);
  if (!ambiguousCandle) return null;

  const drilldownInterval = resolveDrilldownInterval(input.interval);

  if (drilldownInterval) {
    const drilldownSeries = await fetchLiveCandlesForSymbol(
      input.record.symbol,
      drilldownInterval,
      resolveMonitoringOutputSize(drilldownInterval, input.record),
    ).catch(() => null);

    if (drilldownSeries) {
      const monitoringCandles = getMonitoringCandles(
        drilldownSeries.candles,
        input.record.calledAt,
        input.record.lastCandleCheckAt,
        drilldownInterval,
      );
      const drilldownCandles = filterCandlesToParentWindow(
        monitoringCandles,
        ambiguousCandle,
        input.interval,
      );

      if (drilldownCandles.length > 0) {
        const drilldownOutcome = resolveOutcomeFromCandles(input.record, drilldownCandles);
        if (drilldownOutcome && !drilldownOutcome.ambiguousResolution) {
          return {
            candles: drilldownCandles,
            interval: drilldownInterval,
            outcome: drilldownOutcome.outcome,
            resolutionMethod: "lower-timeframe-drilldown" as const,
          };
        }
      }
    }
  }

  // One-level drilldown failed or was unavailable — try the pulse tape next.
  const pulseTapeOutcome = resolveOutcomeFromPulseTape({
    pulseTape: input.pulseTape,
    record: input.record,
  });

  if (pulseTapeOutcome) {
    return {
      candles: input.candles,
      interval: input.interval,
      outcome: pulseTapeOutcome.outcome,
      resolutionMethod: "pulse-tape" as const,
      sequenceEvidenceNote: pulseTapeOutcome.sequenceEvidenceNote,
    };
  }

  // Final fallback: use the candle close direction as tiebreaker (already computed in
  // resolveOutcomeFromCandles — return null here so the caller uses the ambiguousResolution
  // outcome it already has rather than running inferOutcomeFromCandleSequence twice).
  return null;
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
  const rawStopPrice =
    input.setup.analysis?.chartAnnotations.stopLevel ??
    (Number.isFinite(Number.parseFloat(input.view.stop))
      ? Number.parseFloat(input.view.stop)
      : input.asset.price);
  const rawTargetPrice =
    input.setup.analysis?.chartAnnotations.targetLevel ??
    (Number.isFinite(Number.parseFloat(input.view.target))
      ? Number.parseFloat(input.view.target)
      : input.asset.price);

  // Guard: if the AI returned stop/target in the wrong order for this direction, swap them.
  // For SELL: stop must be above entry (loss if price rises), target below (profit if price falls).
  // For BUY: stop must be below entry (loss if price falls), target above (profit if price rises).
  // When both are on the wrong sides we can safely swap; if only one is wrong we leave as-is
  // and the level-validity guard in resolvePredictionOutcome will skip resolution.
  const entryMidForValidation = (entryLow + entryHigh) / 2;
  const isSell = input.view.opportunityAction === "SELL";
  const bothInverted = isSell
    ? rawStopPrice < entryMidForValidation && rawTargetPrice > entryMidForValidation
    : rawStopPrice > entryMidForValidation && rawTargetPrice < entryMidForValidation;
  const stopPrice  = bothInverted ? rawTargetPrice : rawStopPrice;
  const targetPrice = bothInverted ? rawStopPrice   : rawTargetPrice;

  assertPriceScaleConsistency("entryZone", entryMidForValidation, input.asset.price, input.setup.symbol);
  assertPriceScaleConsistency("stop",      stopPrice,             input.asset.price, input.setup.symbol);
  assertPriceScaleConsistency("target",    targetPrice,           input.asset.price, input.setup.symbol);
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
    siggiSkipReason: null,
    narrative: buildPredictionNarrative({
      eventContext,
      outcome: "Monitoring",
      symbol: input.setup.symbol,
      record: {
        actionAtCall:    input.view.opportunityAction,
        stopPriceAtCall:  stopPrice,
        targetPriceAtCall: targetPrice,
        priceAtCall:      input.asset.price,
      },
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
  // ── Level validity guard ──────────────────────────────────────────────────
  // If stop/target are on the wrong sides of entry for the declared direction,
  // the candle/pulse checks below would trigger instantly (entry price already
  // satisfies both conditions), producing a meaningless instant "win".
  // Skip resolution and let the next sync re-check once real data is available.
  const isSell = record.actionAtCall === "SELL";
  const levelsValid = isSell
    ? record.stopPriceAtCall > record.targetPriceAtCall   // stop above target for short
    : record.stopPriceAtCall < record.targetPriceAtCall;  // stop below target for long
  if (!levelsValid) {
    return {
      ...record,
      updatedAt: syncedAt,
    };
  }

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
    const seqNote = effectiveOutcome && "sequenceEvidenceNote" in effectiveOutcome
      ? effectiveOutcome.sequenceEvidenceNote
      : null;
    const resolutionEvidence = buildResolutionEvidence({
      ambiguousResolution: true,
      outcome: "Ambiguous",
      resolutionMethod,
      sequenceEvidenceNote: seqNote,
      record,
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
        sequenceEvidenceNote: seqNote,
        symbol: record.symbol,
        record,
      }),
    } satisfies PersistedPredictionHistoryRecord;
  }

  if (targetHit || stopHit) {
    const outcome = targetHit ? "Hit Target" : "Stopped";
    const seqNote = effectiveOutcome && "sequenceEvidenceNote" in effectiveOutcome
      ? effectiveOutcome.sequenceEvidenceNote
      : null;
    const wasAmbiguous = effectiveOutcome?.ambiguousResolution ?? false;
    const resolutionEvidence = buildResolutionEvidence({
      ambiguousResolution: wasAmbiguous,
      outcome,
      resolutionMethod,
      sequenceEvidenceNote: seqNote,
      record,
    });

    return {
      ...nextResolvedRecord,
      ambiguousResolution: wasAmbiguous,
      monitoringStatus: "Resolved",
      resolvedAt: syncedAt,
      outcome,
      outcomeAccuracy: targetHit ? "Accurate" : "Inaccurate",
      accuracyScore: targetHit ? 100 : 0,
      resolutionEvidence,
      resolvedSource: priceResolvedSource,
      narrative: buildPredictionNarrative({
        ambiguousResolution: wasAmbiguous,
        eventContext: record.eventContextAtCall,
        outcome,
        resolutionMethod,
        sequenceEvidenceNote: seqNote,
        symbol: record.symbol,
        record,
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

  const nowMs = Date.now();
  // Analyses older than this are considered stale and queued for re-generation
  // so Siggi's per-horizon freshness gates (Day ≤3h, Week ≤12h) are always met.
  const ANALYSIS_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

  for (let index = 0; index < scannerResults.length; index += 1) {
    const scannerResult = scannerResults[index];
    const analysisAgeMs = (() => {
      const ts = scannerResult.analysisUpdatedAt ?? scannerResult.analysis?.analyzedAt ?? null;
      if (!ts) return Infinity;
      const parsed = Date.parse(ts);
      return Number.isFinite(parsed) ? nowMs - parsed : Infinity;
    })();
    const needsAnalysisRefresh =
      !scannerResult.analysis ||
      !scannerResult.analysis.multiTimeframeChecks?.length ||
      scannerResult.analysis.multiTimeframeSummary.includes("not available yet") ||
      scannerResult.analysis.regimeSummary.includes("not available yet") ||
      (scannerResult.tradeability === "TRADEABLE" && analysisAgeMs > ANALYSIS_STALE_MS);

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

      // Fire Telegram ENTER NOW alert — non-blocking, never throws
      fireEnterNowAlert(record).catch(() => undefined);
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
