import type {
  PersistedAssetRecord,
  PersistedBacktestRecord,
  PersistedConfirmationCheck,
  PersistedMarketEvent,
  PersistedPredictionHistoryRecord,
  PersistedScannerResult,
} from "@/app/_lib/server/workspace-types";
import { formatPipDistance, getPriceFractionDigits, roundPriceValue } from "@/app/_lib/market-prices";
import {
  getInstrumentUniverseEntry,
  type InstrumentBacktestStats,
} from "@/app/_lib/instrument-universe";

export type BotTradeWindow = "Day" | "Week" | "Month";

export type BotEntryDecision = {
  detail: string;
  label: "ENTER NOW" | "WAIT";
  tone: "text-emerald-300" | "text-amber-200";
};

export type BotScoreBreakdownItem = {
  detail: string;
  label: string;
  score: number;
};

function formatRawPriceLabel(value: number, assetClass?: PersistedAssetRecord["assetClass"]) {
  return value.toFixed(getPriceFractionDigits(value, assetClass));
}

export type BotOpportunityView = {
  backtestSummary: string;
  confidence: number;
  confidenceCalibrationSummary: string;
  confirmationSummary: string;
  currentPrice: number;
  decision: BotEntryDecision;
  direction: "Bullish" | "Bearish" | "Neutral";
  exactEntry: string;
  /** Raw numeric low edge of the entry zone — use this for pip distance, not the formatted string. */
  entryZoneLow: number;
  /** Raw numeric high edge of the entry zone — use this for pip distance, not the formatted string. */
  entryZoneHigh: number;
  liveRR: string;
  pipDistanceToEntry: string;
  signal: "BUY NOW" | "SELL NOW" | "WAIT";
  entry: string;
  eventEffect: string;
  eventEntryGuidance: string;
  eventLikelihood: number;
  eventMove: "Rise" | "Fall" | "Whipsaw";
  eventSchedule: string;
  eventTone: "Tailwind" | "Headwind" | "Caution" | "Clear";
  eventWindowSummary: string;
  horizon: BotTradeWindow;
  instrumentName: string;
  opportunityAction: "BUY" | "SELL" | "WAIT";
  priorityReason: string;
  rankScore: number;
  rationale: string;
  readiness: number;
  regimeSummary: string;
  scoreBreakdown: BotScoreBreakdownItem[];
  similarMemorySummary: string;
  stop: string;
  symbol: string;
  target: string;
  timeframe: string;
  timeframeConfirmationSummary: string;
  tradeSpan: string;
  tradeSpanDetail: string;
  timingWindow: string;
};

type EventRead = {
  confidenceDelta: number;
  entryGuidance: string;
  effect: string;
  forceWait: boolean;
  forceWaitReason: string | null;
  likelihood: number;
  move: BotOpportunityView["eventMove"];
  schedule: string;
  summary: string;
  timingPenalty: number;
  tone: BotOpportunityView["eventTone"];
  windowSummary: string;
};

export type PredictionAccuracySummary = {
  overallAccuracy: number;
  resolvedPredictions: number;
  accuratePredictions: number;
  recentAccuracy: number;
  liveAccuracy: number | null;
  liveResolved: number;
  liveAccurate: number;
  seedAccuracy: number;
  seedResolved: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWinRatePercent(value: number) {
  return value <= 1 ? value * 100 : value;
}

function parseCurrencyLabel(label: string) {
  return Number(label.replaceAll("$", "").replaceAll(",", "").trim());
}

function formatWindow(hours: number) {
  if (hours <= 0) {
    return "freshly updated";
  }

  if (hours < 1) {
    return "updated within the last hour";
  }

  if (hours < 24) {
    return `updated ${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `updated ${days}d ago`;
}

function getHoursSince(timestamp: string | null) {
  if (!timestamp) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.round((Date.now() - parsed) / 3_600_000));
}

function getFreshnessScore(hoursSince: number) {
  if (!Number.isFinite(hoursSince)) {
    return -4;
  }

  if (hoursSince <= 6) {
    return 10;
  }

  if (hoursSince <= 24) {
    return 7;
  }

  if (hoursSince <= 72) {
    return 4;
  }

  return 1;
}

function getTradeabilityScore(tradeability: PersistedScannerResult["tradeability"]) {
  if (tradeability === "TRADEABLE") {
    return 8;
  }

  if (tradeability === "WATCH") {
    return 1;
  }

  return -12;
}

function getRegimeScore(
  asset: PersistedAssetRecord | null,
  setup: PersistedScannerResult,
  direction: "Bullish" | "Bearish" | "Neutral",
) {
  const regime = asset?.regime ?? "Balanced";
  const strategy = setup.strategy.toLowerCase();
  let score = 56;
  let detail = `${regime} conditions are not materially distorting the setup one way or the other.`;

  if (regime === "Risk-On") {
    if (direction === "Bullish") {
      score = strategy.includes("breakout") || strategy.includes("trend") ? 84 : 74;
      detail = "The live regime is supportive for long continuation ideas, especially trend and breakout structures.";
    } else if (direction === "Bearish") {
      score = 40;
      detail = "The live regime is still supportive for risk, so short-side calls need extra confirmation.";
    }
  } else if (regime === "Risk-Off") {
    if (direction === "Bearish") {
      score = 82;
      detail = "The live regime is defensive enough that short-side or fade structures get a meaningful tailwind.";
    } else if (direction === "Bullish") {
      score = strategy.includes("pullback") ? 58 : 44;
      detail = "The live regime is defensive, so bullish entries need stronger timing and cleaner support reactions.";
    }
  } else if (regime === "Balanced") {
    score = direction === "Neutral" ? 60 : 66;
    detail = "The live regime is mixed, so structure and trigger quality matter more than broad-tape momentum.";
  }

  return { detail, score };
}

function formatEventSchedule(event: PersistedMarketEvent) {
  const time = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/London",
    timeZoneName: "short",
  }).format(new Date(event.startsAt));

  return `${event.status} / ${event.impact} impact / ${time}`;
}

function eventSortWeight(event: PersistedMarketEvent, symbol: string) {
  const symbolMatch = event.relatedSymbols.includes(symbol) ? 40 : event.scope === "Macro" ? 20 : 0;
  const statusWeight =
    event.status === "Live" ? 24 : event.status === "Upcoming" ? 18 : 10;
  const impactWeight =
    event.impact === "High" ? 18 : event.impact === "Medium" ? 10 : 4;

  return symbolMatch + statusWeight + impactWeight;
}

export function buildPreferredEntryZone(
  setup: PersistedScannerResult,
  direction: "Bullish" | "Bearish" | "Neutral",
) {
  if (!setup.analysis) {
    return null;
  }

  const { entryZone } = setup.analysis.chartAnnotations;
  const width = Math.max(0.000001, entryZone.high - entryZone.low);
  const outsideOffset = width * 0.18;
  const insideOffset = width * 0.16;
  const priceStep = 1 / 10 ** getPriceFractionDigits(entryZone.low, setup.assetClass);
  const minimumPositivePrice = Math.max(priceStep, entryZone.low * 0.35);

  if (direction === "Bearish") {
    const preferredLow = roundPriceValue(
      Math.max(minimumPositivePrice, entryZone.high - insideOffset),
      setup.assetClass,
    );
    const preferredHigh = roundPriceValue(
      Math.max(preferredLow, entryZone.high + outsideOffset),
      setup.assetClass,
    );

    return {
      high: preferredHigh,
      low: preferredLow,
      summary: `Siggi prefers a premium short pocket sitting just into and just above the top of the main entry zone, rather than forcing the first sell lower down.`,
    };
  }

  const preferredLow = roundPriceValue(
    Math.max(minimumPositivePrice, entryZone.low - outsideOffset),
    setup.assetClass,
  );
  const preferredHigh = roundPriceValue(
    Math.max(preferredLow, entryZone.low + insideOffset),
    setup.assetClass,
  );

  return {
    high: preferredHigh,
    low: preferredLow,
    summary: `Siggi prefers a discounted long pocket sitting just below and just into the lower edge of the main entry zone, so the stop has more room while the reward profile improves.`,
  };
}

function getRelevantEvents(events: PersistedMarketEvent[], symbol: string) {
  return [...events]
    .filter((event) => event.relatedSymbols.includes(symbol) || event.scope === "Macro")
    .sort((left, right) => eventSortWeight(right, symbol) - eventSortWeight(left, symbol))
    .slice(0, 4);
}

function getHoursUntil(timestamp: string) {
  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return (parsed - Date.now()) / 3_600_000;
}

export function resolveTradeWindow(timeframe: string): BotTradeWindow {
  const upper = timeframe.toUpperCase();

  if (upper.includes("1W") || upper.includes("1M")) {
    return "Month";
  }

  if (
    upper.includes("4H") ||
    upper.includes("1H") ||
    upper.includes("30M") ||
    upper.includes("15M")
  ) {
    return "Day";
  }

  if (upper.includes("1D")) {
    return "Week";
  }

  return "Week";
}

function getTradeSpanHours(timeframe: string, horizon: BotTradeWindow) {
  const upper = timeframe.toUpperCase();

  if (upper.includes("1M")) {
    return 480; // ~4 weeks for monthly setups
  }

  if (upper.includes("1W")) {
    return 120; // ~5 trading days for weekly setups
  }

  if (upper.includes("1D")) {
    return 24;
  }

  if (upper.includes("4H")) {
    return 18;
  }

  if (upper.includes("1H")) {
    return 8;
  }

  if (upper.includes("30M")) {
    return 4;
  }

  if (upper.includes("15M")) {
    return 3;
  }

  if (horizon === "Day") {
    return 12;
  }

  if (horizon === "Month") {
    return 24;
  }

  return 24;
}

function formatTradeSpan(hours: number) {
  if (hours < 2) {
    return `${Math.round(hours * 60)} min`;
  }

  if (hours < 48) {
    return `${Math.round(hours)} hours`;
  }

  return `${Math.round(hours / 24)} days`;
}

export function inferDirection(setup: PersistedScannerResult): "Bullish" | "Bearish" | "Neutral" {
  const analysisBias = setup.analysis?.bias.toLowerCase() ?? "";

  if (analysisBias.includes("bear")) {
    return "Bearish";
  }

  if (analysisBias.includes("bull")) {
    return "Bullish";
  }

  // Universe stance is the most reliable fallback when the AI hasn't produced a
  // clear directional bias — it encodes the instrument's designed trade direction.
  const universeEntry = getInstrumentUniverseEntry(setup.symbol);
  if (universeEntry?.stance === "Long") return "Bullish";
  if (universeEntry?.stance === "Short") return "Bearish";

  const entryMid =
    setup.analysis
      ? (setup.analysis.chartAnnotations.entryZone.low + setup.analysis.chartAnnotations.entryZone.high) / 2
      : parseCurrencyLabel(setup.entryZone.split("-")[0] ?? setup.entryZone);
  const stop = setup.analysis
    ? setup.analysis.chartAnnotations.stopLevel
    : parseCurrencyLabel(setup.stopLoss);
  const target = setup.analysis
    ? setup.analysis.chartAnnotations.targetLevel
    : parseCurrencyLabel(setup.takeProfit);

  if (target > entryMid && stop < entryMid) {
    return "Bullish";
  }

  if (target < entryMid && stop > entryMid) {
    return "Bearish";
  }

  return "Neutral";
}

/** Analysis older than 1 hour is considered stale — ENTER NOW is suppressed. */
const ANALYSIS_STALE_HOURS = 1;

export function isAnalysisStale(setup: PersistedScannerResult): boolean {
  if (!setup.analysis || !setup.analysisUpdatedAt) return true;
  return getHoursSince(setup.analysisUpdatedAt) >= ANALYSIS_STALE_HOURS;
}

export function getEntryDecision(
  currentPrice: number,
  setup: PersistedScannerResult,
): BotEntryDecision {
  if (!setup.analysis) {
    return {
      detail: `The ${setup.timeframe} setup still needs a fresh chart analysis before Siggi can call the entry with confidence.`,
      label: "WAIT",
      tone: "text-amber-200",
    };
  }

  // Stale analysis gate — never fire ENTER NOW on analysis older than 6h.
  const hoursOld = getHoursSince(setup.analysisUpdatedAt);
  if (hoursOld >= ANALYSIS_STALE_HOURS) {
    return {
      detail: `Analysis is ${hoursOld}h old — Siggi is waiting for a fresh chart read before calling entry. Re-analysis runs automatically every 6 minutes.`,
      label: "WAIT",
      tone: "text-amber-200",
    };
  }

  const { low, high } = setup.analysis.chartAnnotations.entryZone;
  const direction = inferDirection(setup);
  const preferredZone = buildPreferredEntryZone(setup, direction);

  if (
    preferredZone &&
    currentPrice >= preferredZone.low &&
    currentPrice <= preferredZone.high
  ) {
    return {
      detail:
        direction === "Bearish"
          ? `Live price is in the preferred premium ${setup.timeframe} short pocket now.`
          : `Live price is in the preferred discounted ${setup.timeframe} long pocket now.`,
      label: "ENTER NOW",
      tone: "text-emerald-300",
    };
  }

  if (currentPrice >= low && currentPrice <= high) {
    return {
      detail:
        direction === "Bearish"
          ? `Price is inside the main ${setup.timeframe} short zone now. The premium pocket would be better, but the setup is still live here.`
          : `Price is inside the main ${setup.timeframe} long zone now. The discounted pocket would be better, but the setup is still live here.`,
      label: "ENTER NOW",
      tone: "text-emerald-300",
    };
  }

  if (currentPrice > high) {
    return {
      detail:
        direction === "Bearish"
          ? `Price is above the ${setup.timeframe} short zone. Wait for a return into the entry band.`
          : `Price is extended above the ${setup.timeframe} entry zone. Wait for a pullback.`,
      label: "WAIT",
      tone: "text-amber-200",
    };
  }

  return {
    detail:
      direction === "Bearish"
        ? `Price is still below the ${setup.timeframe} short zone. Wait for price to trade back into the entry band.`
        : `Price has not reached the ${setup.timeframe} entry zone yet. Wait for price to move into the band.`,
    label: "WAIT",
    tone: "text-amber-200",
  };
}

function buildEventRead(
  events: PersistedMarketEvent[],
  symbol: string,
  direction: "Bullish" | "Bearish" | "Neutral",
): EventRead {
  const allRelevantEvents = getRelevantEvents(events, symbol);
  const [primaryEvent] = allRelevantEvents;

  if (!primaryEvent) {
    return {
      confidenceDelta: 0,
      entryGuidance: "No scheduled event is urgent enough to override the chart timing right now.",
      effect: "No high-priority macro or symbol-specific event is crowding this setup right now.",
      forceWait: false,
      forceWaitReason: null,
      likelihood: 51,
      move: "Whipsaw",
      schedule: "No immediate event pressure",
      summary: "The event calendar is relatively clear, so the chart structure can do more of the work.",
      timingPenalty: 0,
      tone: "Clear",
      windowSummary: "Event window is clear enough that Siggi can trust the technical trigger more directly.",
    };
  }

  const alignment =
    direction === "Neutral"
      ? "Caution"
      : primaryEvent.bias === "Mixed" || primaryEvent.bias === "Neutral"
        ? "Caution"
        : (primaryEvent.bias === "Bullish" && direction === "Bullish") ||
            (primaryEvent.bias === "Bearish" && direction === "Bearish")
          ? "Tailwind"
          : "Headwind";

  // Multi-event consensus: do secondary events reinforce or conflict with the trade direction?
  // Aligned pile-on boosts conviction; conflicting events add uncertainty and erode confidence.
  const secondaryEvents = allRelevantEvents.slice(1);
  const alignedSecondary = secondaryEvents.filter((ev) => {
    const evBias = ev.bias;
    return direction !== "Neutral" &&
      ((evBias === "Bullish" && direction === "Bullish") ||
       (evBias === "Bearish" && direction === "Bearish"));
  }).length;
  const conflictingSecondary = secondaryEvents.filter((ev) => {
    const evBias = ev.bias;
    return direction !== "Neutral" &&
      ((evBias === "Bullish" && direction === "Bearish") ||
       (evBias === "Bearish" && direction === "Bullish"));
  }).length;
  const consensusBonus = alignedSecondary > 0 && conflictingSecondary === 0 ? 2 : 0;
  const consensusPenalty = conflictingSecondary > 0 ? conflictingSecondary * 3 : 0;
  const consensusSummaryAppend =
    alignedSecondary > 0 && conflictingSecondary === 0
      ? " Multiple events are aligned with this trade direction."
      : conflictingSecondary > 0
        ? " Note: other scheduled events conflict with this direction."
        : "";

  const schedule = formatEventSchedule(primaryEvent);
  const hoursUntilEvent = getHoursUntil(primaryEvent.startsAt);
  const isUpcomingShockWindow =
    primaryEvent.status === "Upcoming" &&
    primaryEvent.impact === "High" &&
    hoursUntilEvent <= 10;
  const isPreEventWindow =
    primaryEvent.status === "Upcoming" &&
    primaryEvent.impact === "High" &&
    hoursUntilEvent > 0 &&
    hoursUntilEvent <= 4;
  const isDigestWindow =
    primaryEvent.status === "Live" &&
    primaryEvent.impact === "High";
  const isRecentShockAftermath =
    primaryEvent.status === "Recent" &&
    primaryEvent.impact === "High" &&
    hoursUntilEvent > -18;
  const move =
    primaryEvent.bias === "Bullish"
      ? "Rise"
      : primaryEvent.bias === "Bearish"
        ? "Fall"
        : "Whipsaw";
  const likelihood = clamp(
    (primaryEvent.impact === "High" ? 74 : primaryEvent.impact === "Medium" ? 66 : 58) +
      (primaryEvent.relatedSymbols.includes(symbol) ? 6 : primaryEvent.scope === "Macro" ? 2 : 0) +
      (primaryEvent.status === "Live" ? 4 : primaryEvent.status === "Upcoming" ? 6 : 0) -
      (primaryEvent.bias === "Mixed" || primaryEvent.bias === "Neutral" ? 10 : 0),
    42,
    92,
  );
  let confidenceDelta = 0;
  let timingPenalty = 0;
  let forceWait = false;
  let forceWaitReason: string | null = null;

  if (alignment === "Tailwind") {
    confidenceDelta += primaryEvent.status === "Live" ? 4 : 2;
    timingPenalty += isUpcomingShockWindow ? 8 : 0;
  } else if (alignment === "Headwind") {
    confidenceDelta -= primaryEvent.impact === "High" ? 8 : 5;
    timingPenalty += primaryEvent.status === "Upcoming" ? 16 : 8;
  } else {
    confidenceDelta -= primaryEvent.impact === "High" ? 4 : 2;
    timingPenalty += primaryEvent.status === "Upcoming" && primaryEvent.impact === "High" ? 12 : 5;
  }

  if (isPreEventWindow) {
    forceWait = true;
    forceWaitReason = "A high-impact event is too close to the trigger window.";
    timingPenalty += 18;
  } else if (isDigestWindow) {
    forceWait = true;
    forceWaitReason = "The event is live and the first market reaction still needs to settle.";
    timingPenalty += 16;
  } else if (isRecentShockAftermath) {
    timingPenalty += 9;
  }

  const entryGuidance =
    isPreEventWindow && primaryEvent.bias === "Bearish"
      ? "The event is close enough to hit before a clean entry can mature. Wait for the release and the first reaction instead of entering early."
      : isPreEventWindow && primaryEvent.bias === "Bullish"
        ? "Even though the event leans supportive, the timing risk is still high. Let the release print and watch whether the first move holds."
        : isDigestWindow
          ? "The headline is already moving markets. Let the first impulse settle before treating the move as a clean entry."
          : isRecentShockAftermath
            ? "The release has passed, but the market is still inside the early digestion window. A cleaner re-test is better than chasing the first recovery."
          : "The event risk is manageable enough that price structure can stay in charge, but the event still needs monitoring.";

  const directionalRead =
    alignment === "Tailwind"
      ? "This should help the setup if price structure keeps holding."
      : alignment === "Headwind"
        ? "This is a real headwind, so Siggi is more patient with entry timing."
        : "This raises uncertainty, so Siggi wants extra confirmation before leaning hard.";

  return {
    confidenceDelta: confidenceDelta + consensusBonus - consensusPenalty,
    entryGuidance,
    effect: `${primaryEvent.title} is ${schedule.toLowerCase()} and ${directionalRead}`,
    forceWait,
    forceWaitReason,
    likelihood,
    move,
    schedule,
    summary: (`${primaryEvent.summary} ${directionalRead}`.trim() + consensusSummaryAppend).trim(),
    timingPenalty,
    tone: alignment,
    windowSummary:
      isPreEventWindow
        ? "Pre-event window: the release is close enough that Siggi should wait rather than front-run the move."
        : isDigestWindow
          ? "Live release window: the market is reacting now, so Siggi should wait for the first move to stabilize."
          : isRecentShockAftermath
            ? "Post-event digestion window: the release is fresh enough that retracement and whipsaw risk are still elevated."
            : isUpcomingShockWindow
              ? "Event risk is approaching, so timing discipline matters more than usual."
              : "Event timing is not the primary reason to delay the setup right now.",
  };
}

function buildConfirmationSummary(confirmation: PersistedConfirmationCheck | null) {
  if (!confirmation) {
    return {
      detail: "No fresh cross-check has been attached to this setup yet.",
      score: 46,
    };
  }

  const score = clamp(
    confirmation.score +
      (confirmation.overallStatus === "Confirmed"
        ? 6
        : confirmation.overallStatus === "Rejected"
          ? -10
          : 0),
    25,
    95,
  );

  return {
    detail: confirmation.summary,
    score,
  };
}

function buildBacktestSummary(
  backtest: PersistedBacktestRecord | null,
  universeStat: InstrumentBacktestStats | null,
) {
  // Prefer a linked workspace backtest; fall back to the static 5-year universe stats.
  if (backtest) {
    const normalizedWinRatePercent = normalizeWinRatePercent(backtest.winRate);
    const winRateScore = clamp(Math.round(normalizedWinRatePercent), 0, 100);
    const profitFactorScore = clamp(Math.round((backtest.profitFactor - 1) * 25) + 50, 0, 100);
    const drawdownScore = clamp(100 - Math.round(Math.abs(backtest.maxDrawdown) * 3.5), 20, 100);
    const compositeScore = clamp(
      Math.round(winRateScore * 0.45 + profitFactorScore * 0.35 + drawdownScore * 0.2),
      35,
      95,
    );
    return {
      detail: `${backtest.strategy} memory shows ${Math.round(normalizedWinRatePercent)}% wins with ${backtest.profitFactor.toFixed(2)} profit factor.`,
      score: compositeScore,
    };
  }

  if (universeStat) {
    // Build score from the 5-year static backtest baked into the instrument universe.
    const winRateScore = clamp(Math.round(universeStat.winRatePct * 1.6 - 20), 20, 90);
    const profitFactorScore = clamp(Math.round((universeStat.profitFactor - 1) * 25) + 50, 0, 100);
    const drawdownScore = clamp(100 - Math.round(Math.abs(universeStat.maxDrawdownPct) * 2.5), 20, 100);
    const sharpeBonus = universeStat.sharpe >= 1.5 ? 4 : universeStat.sharpe >= 1.0 ? 2 : 0;
    const compositeScore = clamp(
      Math.round(winRateScore * 0.40 + profitFactorScore * 0.35 + drawdownScore * 0.20) + sharpeBonus,
      35,
      92,
    );
    return {
      detail: `5-year back-test (${universeStat.period}): ${universeStat.winRatePct}% win rate · ${universeStat.profitFactor.toFixed(2)}× profit factor · ${universeStat.annualisedReturnPct}% CAGR · Sharpe ${universeStat.sharpe.toFixed(2)}.`,
      score: compositeScore,
    };
  }

  return {
    detail: "No back-test memory is currently attached to this setup.",
    score: 48,
  };
}

function buildPredictionMemorySummary(
  predictionHistory: PersistedPredictionHistoryRecord[],
  setup: PersistedScannerResult,
  asset: PersistedAssetRecord | null,
  direction: "Bullish" | "Bearish" | "Neutral",
) {
  const relevant = predictionHistory.filter((record) => {
    const sameSymbol = record.symbol === setup.symbol;
    const sameAssetClass = asset ? record.assetClass === asset.assetClass : false;
    const sameDirection = record.trendAtCall === direction;
    const resolvedForAccuracy =
      record.outcome === "Hit Target" || record.outcome === "Stopped";

    return resolvedForAccuracy && (sameSymbol || (sameAssetClass && sameDirection));
  });

  if (relevant.length === 0) {
    return {
      detail: "No resolved enter-now memory is attached to this market pattern yet.",
      score: 50,
    };
  }

  const successes = relevant.filter((record) => record.outcome === "Hit Target").length;
  const accuracy = Math.round((successes / relevant.length) * 100);
  const recent = relevant.slice(-5);
  const recentSuccesses = recent.filter((record) => record.outcome === "Hit Target").length;
  const recentAccuracy = recent.length > 0 ? Math.round((recentSuccesses / recent.length) * 100) : accuracy;

  return {
    detail: `${relevant.length} resolved live calls in similar conditions show ${accuracy}% target-hit accuracy, with the most recent subset at ${recentAccuracy}%.`,
    score: clamp(Math.round(accuracy * 0.7 + recentAccuracy * 0.3), 30, 95),
  };
}

function buildValidationScore(setup: PersistedScannerResult) {
  if (!setup.analysis?.strategyChecks?.length && !setup.analysis?.indicatorSweep?.length) {
    return {
      detail: "Validation will strengthen once Siggi finishes the full strategy and indicator sweep.",
      score: 48,
    };
  }

  const confirmedStrategies =
    setup.analysis?.strategyChecks?.filter((item) => item.status === "Confirmed").length ?? 0;
  const mixedStrategies =
    setup.analysis?.strategyChecks?.filter((item) => item.status === "Mixed").length ?? 0;
  const bullishIndicators =
    setup.analysis?.indicatorSweep?.filter((item) => item.status === "Bullish").length ?? 0;
  const bearishIndicators =
    setup.analysis?.indicatorSweep?.filter((item) => item.status === "Bearish").length ?? 0;

  const score = clamp(
    42 +
      confirmedStrategies * 11 +
      mixedStrategies * 4 +
      Math.max(bullishIndicators, bearishIndicators) * 3 -
      Math.min(bullishIndicators, bearishIndicators) * 2,
    35,
    95,
  );

  return {
    detail:
      setup.analysis?.validationSummary ??
      "Validation is being drawn from the full indicator and strategy sweep.",
    score,
  };
}

function buildTimeframeConfirmationRead(setup: PersistedScannerResult) {
  const score = clamp(setup.analysis?.timeframeAgreementScore ?? 50, 25, 95);

  return {
    detail:
      setup.analysis?.multiTimeframeSummary ??
      "Multi-timeframe confirmation will improve once the trigger, structure, and trend windows are all analysed together.",
    score,
  };
}

function buildConfidenceCalibrationRead(input: {
  asset: PersistedAssetRecord | null;
  baseConfidence: number;
  direction: "Bullish" | "Bearish" | "Neutral";
  horizon: BotTradeWindow;
  predictionHistory: PersistedPredictionHistoryRecord[];
  setup: PersistedScannerResult;
}) {
  const relevant = input.predictionHistory.filter((record) => {
    if (!(record.outcome === "Hit Target" || record.outcome === "Stopped")) {
      return false;
    }

    const sameSymbol = record.symbol === input.setup.symbol;
    const sameHorizon = record.horizon === input.horizon;
    const sameAssetClass = input.asset ? record.assetClass === input.asset.assetClass : false;
    const sameDirection =
      (input.direction === "Bullish" && record.actionAtCall === "BUY") ||
      (input.direction === "Bearish" && record.actionAtCall === "SELL");
    const bucketMatch = Math.abs(record.confidenceAtCall - input.baseConfidence) <= 12;

    return bucketMatch && sameDirection && (sameSymbol || (sameHorizon && sameAssetClass));
  });

  if (relevant.length < 2) {
    return {
      adjustedConfidence: input.baseConfidence,
      detail: "Confidence is still mostly model-driven here because there is not enough resolved history in this confidence bucket yet.",
      score: 52,
    };
  }

  // Weight the 5 most recent calls at 2× so the calibration tracks fresh performance faster
  const recentCutoff = 5;
  const recentCalls = relevant.slice(0, recentCutoff);
  const olderCalls = relevant.slice(recentCutoff);
  const weightedSuccesses =
    recentCalls.filter((r) => r.outcome === "Hit Target").length * 2 +
    olderCalls.filter((r) => r.outcome === "Hit Target").length;
  const weightedTotal = recentCalls.length * 2 + olderCalls.length;
  const observedAccuracy = Math.round((weightedSuccesses / weightedTotal) * 100);
  const weight = Math.min(0.45, relevant.length / 20);
  const adjustedConfidence = clamp(
    Math.round(input.baseConfidence * (1 - weight) + observedAccuracy * weight),
    35,
    95,
  );

  return {
    adjustedConfidence,
    detail: `${relevant.length} resolved calls in a similar confidence bucket show ${observedAccuracy}% target-hit accuracy (recent calls weighted 2×), so confidence is calibrated toward that live result.`,
    score: clamp(observedAccuracy, 30, 95),
  };
}

function buildReadinessScore(
  currentPrice: number,
  setup: PersistedScannerResult,
  decision: BotEntryDecision,
  eventRead: EventRead,
  freshnessScore: number,
) {
  if (!setup.analysis) {
    return 34;
  }

  const { low, high } = setup.analysis.chartAnnotations.entryZone;
  const midpoint = (low + high) / 2;
  const outsideDistance =
    currentPrice < low ? (low - currentPrice) / midpoint : currentPrice > high ? (currentPrice - high) / midpoint : 0;
  let readiness = decision.label === "ENTER NOW" ? 84 : 72 - Math.round(outsideDistance * 1000);

  readiness += freshnessScore >= 7 ? 5 : freshnessScore >= 4 ? 2 : -2;
  readiness += getTradeabilityScore(setup.tradeability);
  readiness -= eventRead.timingPenalty;

  if (decision.label === "WAIT") {
    readiness = Math.min(readiness, 74);
  }

  return clamp(readiness, 18, 94);
}

function getTimingWindow(
  horizon: BotTradeWindow,
  readiness: number,
  decision: BotEntryDecision,
  eventTone: EventRead["tone"],
  eventRead: EventRead,
) {
  if (eventRead.forceWait) {
    return "Wait for the event print and the first reaction before trusting the next entry.";
  }

  if (decision.label === "ENTER NOW" && readiness >= 78 && eventTone !== "Headwind") {
    return horizon === "Day"
      ? "Best within the current session."
      : "Best inside the current swing window.";
  }

  if (eventTone === "Headwind" || eventTone === "Caution") {
    return "Wait for the event risk to pass or for price to reclaim the zone cleanly.";
  }

  return "Wait for price to move back into the planned entry band.";
}

export function buildBotOpportunityView(
  setup: PersistedScannerResult,
  asset: PersistedAssetRecord | null,
  confirmationChecks: PersistedConfirmationCheck[],
  marketEvents: PersistedMarketEvent[],
  backtests: PersistedBacktestRecord[],
  predictionHistory: PersistedPredictionHistoryRecord[] = [],
): BotOpportunityView {
  const direction = inferDirection(setup);
  const currentPrice = asset?.price ?? 0;
  const baseDecision = getEntryDecision(currentPrice, setup);
  const freshnessHours = getHoursSince(setup.analysisUpdatedAt ?? setup.analysis?.analyzedAt ?? null);
  const freshnessScore = getFreshnessScore(freshnessHours);
  const confirmation =
    confirmationChecks.find((check) => check.linkedScannerResultId === setup.id) ??
    confirmationChecks.find((check) => check.symbol === setup.symbol) ??
    null;
  const backtest =
    backtests.find((item) => item.linkedScannerResultId === setup.id) ??
    backtests.find((item) => item.linkedAssetSymbol === setup.symbol) ??
    null;
  const universeEntry = getInstrumentUniverseEntry(setup.symbol);
  const eventRead = buildEventRead(marketEvents, setup.symbol, direction);
  const confirmationRead = buildConfirmationSummary(confirmation);
  const backtestRead = buildBacktestSummary(backtest, universeEntry?.backtestStats ?? null);
  const memoryRead = buildPredictionMemorySummary(predictionHistory, setup, asset, direction);
  const validationRead = buildValidationScore(setup);
  const timeframeRead = buildTimeframeConfirmationRead(setup);
  const regimeRead = getRegimeScore(asset, setup, direction);
  const horizon = resolveTradeWindow(setup.timeframe);
  const tradeSpanHours = getTradeSpanHours(setup.timeframe, horizon);
  const decision =
    eventRead.forceWait && baseDecision.label === "ENTER NOW"
      ? {
          detail: eventRead.forceWaitReason
            ? `${eventRead.entryGuidance} ${eventRead.forceWaitReason}`
            : eventRead.entryGuidance,
          label: "WAIT" as const,
          tone: "text-amber-200" as const,
        }
      : timeframeRead.score <= 38 && baseDecision.label === "ENTER NOW"
        ? {
            detail: "The trigger chart is live, but the higher timeframe stack is too conflicted right now. Wait for alignment before treating this as a perfect entry.",
            label: "WAIT" as const,
            tone: "text-amber-200" as const,
          }
      : baseDecision;

  const structureScore = clamp(Math.round(setup.score * 0.88), 40, 95);
  const riskDisciplineScore = clamp(100 - Math.round(setup.riskScore * 1.15), 22, 96);
  const readiness = buildReadinessScore(currentPrice, setup, decision, eventRead, freshnessScore);

  // Stop quality penalty — a stop placed in open air (not anchored near a confirmed
  // support or resistance level) is structurally weak. ATR is estimated from the entry
  // zone width since the raw ATR value isn't stored on the analysis snapshot.
  const stopQualityPenalty = (() => {
    if (!setup.analysis) return 0;
    const { stopLevel, supportLevels, resistanceLevels, entryZone } = setup.analysis.chartAnnotations;
    if (!Number.isFinite(stopLevel)) return 0;
    const estimatedAtr = Math.max((entryZone.high - entryZone.low) * 2.5, stopLevel * 0.008);
    const halfAtr = estimatedAtr * 0.5;
    const anchors = direction === "Bearish" ? resistanceLevels : supportLevels;
    if (anchors.length === 0) return -3; // no structural levels at all
    const nearestAnchorDistance = Math.min(...anchors.map((level) => Math.abs(level - stopLevel)));
    return nearestAnchorDistance > halfAtr ? -6 : 0;
  })();

  const preCalibrationConfidence =
    14 +
    Math.round(structureScore * 0.28) +
    Math.round(riskDisciplineScore * 0.12) +
    Math.round(confirmationRead.score * 0.15) +
    Math.round(backtestRead.score * 0.12) +
    Math.round(memoryRead.score * 0.1) +
    Math.round(timeframeRead.score * 0.08) +
    Math.round(regimeRead.score * 0.07) +
    Math.round(validationRead.score * 0.08) +
    freshnessScore +
    getTradeabilityScore(setup.tradeability) +
    eventRead.confidenceDelta +
    stopQualityPenalty;

  const calibrationRead = buildConfidenceCalibrationRead({
    asset,
    baseConfidence: clamp(preCalibrationConfidence, 35, 95),
    direction,
    horizon,
    predictionHistory,
    setup,
  });
  const confidence = calibrationRead.adjustedConfidence;

  const horizonBonus = horizon === "Day" ? 8 : horizon === "Week" ? 5 : 2;

  // Instruments with a back-tested edge above 2.0× profit factor earn a small
  // ranking bonus so that well-proven setups surface higher in the scanner.
  const bt = universeEntry?.backtestStats ?? null;
  const backtestRankBonus = bt
    ? bt.profitFactor >= 2.2
      ? 4
      : bt.profitFactor >= 1.9
        ? 2
        : bt.profitFactor < 1.5
          ? -2
          : 0
    : 0;

  const rankScore = clamp(
    Math.round(confidence * 0.68 + readiness * 0.32 + horizonBonus + backtestRankBonus),
    30,
    99,
  );

  const priorityReason =
    readiness >= 78
      ? `The setup already sits in the planned ${setup.timeframe} entry zone and the supporting evidence is aligned.`
      : eventRead.forceWait || eventRead.tone === "Headwind" || eventRead.tone === "Caution"
        ? `The setup quality is respectable, but event pressure means Siggi is waiting for cleaner timing.`
        : timeframeRead.score <= 38
          ? `The trigger is close, but the higher timeframe stack is too mixed for Siggi to call this a perfect entry yet.`
        : `The structure is good, but price still needs to move into the preferred ${setup.timeframe} entry zone.`;

  const scoreBreakdown: BotScoreBreakdownItem[] = [
    {
      detail: setup.analysis
        ? `${setup.strategy} structure looks ${setup.analysis.bias.toLowerCase()} and ${formatWindow(freshnessHours)}.${stopQualityPenalty < 0 ? " Stop placement is in open air without nearby structural support — confidence trimmed." : ""}`
        : `Base ranking comes from the ${setup.strategy} setup score while fresh chart analysis is still pending.`,
      label: "Structure",
      score: structureScore,
    },
    {
      detail: confirmationRead.detail,
      label: "Checks",
      score: confirmationRead.score,
    },
    {
      detail: backtestRead.detail,
      label: "Memory",
      score: backtestRead.score,
    },
    {
      detail: memoryRead.detail,
      label: "Live Replay",
      score: memoryRead.score,
    },
    {
      detail: timeframeRead.detail,
      label: "Timeframes",
      score: timeframeRead.score,
    },
    {
      detail: regimeRead.detail,
      label: "Regime",
      score: regimeRead.score,
    },
    {
      detail: validationRead.detail,
      label: "Validation",
      score: validationRead.score,
    },
    {
      detail: calibrationRead.detail,
      label: "Calibration",
      score: calibrationRead.score,
    },
    {
      detail: `${eventRead.summary} ${eventRead.windowSummary}`.trim(),
      label: "Events",
      score:
        eventRead.tone === "Tailwind"
          ? 78
          : eventRead.tone === "Clear"
            ? 66
            : eventRead.tone === "Caution"
              ? 52
              : 38,
    },
  ];

  // Compute pip distance from current price to the entry zone for display.
  const entryLow = setup.analysis?.chartAnnotations.entryZone.low
    ?? parseCurrencyLabel(setup.entryZone.split("-")[0] ?? setup.entryZone);
  const entryHigh = setup.analysis?.chartAnnotations.entryZone.high
    ?? parseCurrencyLabel(setup.entryZone.split("-")[1] ?? setup.entryZone);
  const pipDistanceToEntry = currentPrice > 0
    ? formatPipDistance(currentPrice, entryLow, entryHigh, asset?.assetClass)
    : "";

  // Exact ideal limit-order price: bottom of zone for longs (buy cheap),
  // top of zone for shorts (sell premium), midpoint when neutral.
  const exactEntryPrice =
    direction === "Bullish" ? entryLow
    : direction === "Bearish" ? entryHigh
    : (entryLow + entryHigh) / 2;
  const exactEntry = Number.isFinite(exactEntryPrice)
    ? formatRawPriceLabel(exactEntryPrice, asset?.assetClass)
    : setup.entryZone;

  // Siggi's strategic signal — direction alone drives this; no instrument-stance
  // filter is applied so Siggi can surface both long and short opportunities freely
  // and build a complete win/loss memory across all markets.
  const opportunityAction: "BUY" | "SELL" | "WAIT" =
    direction === "Bullish" ? "BUY"
    : direction === "Bearish" ? "SELL"
    : "WAIT";

  // When the strategic signal is WAIT (neutral direction), the entry decision
  // must also be WAIT — "ENTER NOW" with no directional signal is contradictory.
  const resolvedDecision: BotEntryDecision =
    opportunityAction === "WAIT" && decision.label === "ENTER NOW"
      ? {
          detail: "Siggi's directional read is not clear enough yet — waiting for a decisive move before committing.",
          label: "WAIT",
          tone: "text-amber-200",
        }
      : decision;

  // Combined single-word signal shown in the scanner action column.
  // Only fires "BUY NOW" / "SELL NOW" when price is actually in the entry zone.
  const signal: "BUY NOW" | "SELL NOW" | "WAIT" =
    opportunityAction === "BUY" && resolvedDecision.label === "ENTER NOW" ? "BUY NOW"
    : opportunityAction === "SELL" && resolvedDecision.label === "ENTER NOW" ? "SELL NOW"
    : "WAIT";

  // Live R:R — computes reward vs risk from the CURRENT price (not the original entry).
  // This updates every time the view is rebuilt from live prices, so traders can see
  // whether the R:R has improved (price closer to entry) or deteriorated (price extended).
  const stopLevel = setup.analysis?.chartAnnotations.stopLevel
    ?? parseCurrencyLabel(setup.stopLoss);
  const targetLevel = setup.analysis?.chartAnnotations.targetLevel
    ?? parseCurrencyLabel(setup.takeProfit);
  const liveRR = (() => {
    if (currentPrice <= 0 || !Number.isFinite(stopLevel) || !Number.isFinite(targetLevel)) {
      return "";
    }
    const liveRisk = Math.abs(currentPrice - stopLevel);
    const liveReward = Math.abs(targetLevel - currentPrice);
    if (liveRisk <= 0) return "";
    const ratio = liveReward / liveRisk;
    return `${ratio.toFixed(2)}R`;
  })();

  return {
    backtestSummary: backtestRead.detail,
    confidence,
    confidenceCalibrationSummary: calibrationRead.detail,
    confirmationSummary: confirmationRead.detail,
    currentPrice,
    decision: resolvedDecision,
    direction,
    exactEntry,
    entryZoneLow: entryLow,
    entryZoneHigh: entryHigh,
    liveRR,
    pipDistanceToEntry,
    signal,
    entry: setup.analysis
      ? `${formatRawPriceLabel(setup.analysis.chartAnnotations.entryZone.low, asset?.assetClass)} - ${formatRawPriceLabel(setup.analysis.chartAnnotations.entryZone.high, asset?.assetClass)}`
      : setup.entryZone,
    eventEffect: eventRead.effect,
    eventEntryGuidance: eventRead.entryGuidance,
    eventLikelihood: eventRead.likelihood,
    eventMove: eventRead.move,
    eventSchedule: eventRead.schedule,
    eventTone: eventRead.tone,
    eventWindowSummary: eventRead.windowSummary,
    horizon,
    instrumentName: asset?.name ?? setup.symbol,
    opportunityAction,
    priorityReason,
    rankScore,
    rationale: setup.analysis?.weeklyOutlook ?? setup.thesis,
    readiness,
    regimeSummary: regimeRead.detail,
    scoreBreakdown,
    similarMemorySummary: memoryRead.detail,
    stop: setup.analysis
      ? formatRawPriceLabel(setup.analysis.chartAnnotations.stopLevel, asset?.assetClass)
      : setup.stopLoss,
    symbol: setup.symbol,
    target: setup.analysis
      ? formatRawPriceLabel(setup.analysis.chartAnnotations.targetLevel, asset?.assetClass)
      : setup.takeProfit,
    timeframe: setup.timeframe,
    timeframeConfirmationSummary: timeframeRead.detail,
    tradeSpan: formatTradeSpan(tradeSpanHours),
    tradeSpanDetail:
      "Maximum planned hold before Siggi should re-check or flatten if TP/SL has not resolved it, or if the market turns uncertain mid-entry.",
    timingWindow: getTimingWindow(horizon, readiness, decision, eventRead.tone, eventRead),
  };
}

export function summarizePredictionAccuracy(
  predictionHistory: PersistedPredictionHistoryRecord[],
): PredictionAccuracySummary {
  const resolved = predictionHistory.filter(
    (item) => item.outcome === "Hit Target" || item.outcome === "Stopped",
  );
  const recent = resolved.slice(0, 12);
  const accurate = resolved.filter((item) => item.outcome === "Hit Target");
  const recentAccurate = recent.filter((item) => item.outcome === "Hit Target");

  // Live accuracy: only signals resolved by an actual paper trade
  const liveResolved = resolved.filter((item) => item.resolvedSource === "live_trade");
  const liveAccurate = liveResolved.filter((item) => item.outcome === "Hit Target");
  const liveAccuracy =
    liveResolved.length >= 20
      ? Math.round((liveAccurate.length / liveResolved.length) * 1000) / 10
      : null;

  // Seed/backtest accuracy: everything that wasn't resolved by a live trade
  const seedResolved = resolved.filter(
    (item) => !item.resolvedSource || item.resolvedSource !== "live_trade",
  );
  const seedAccurate = seedResolved.filter((item) => item.outcome === "Hit Target");

  return {
    overallAccuracy:
      resolved.length > 0
        ? Math.round((accurate.length / resolved.length) * 1000) / 10
        : 0,
    resolvedPredictions: resolved.length,
    accuratePredictions: accurate.length,
    recentAccuracy:
      recent.length > 0
        ? Math.round((recentAccurate.length / recent.length) * 1000) / 10
        : 0,
    liveAccuracy,
    liveResolved: liveResolved.length,
    liveAccurate: liveAccurate.length,
    seedAccuracy:
      seedResolved.length > 0
        ? Math.round((seedAccurate.length / seedResolved.length) * 1000) / 10
        : 0,
    seedResolved: seedResolved.length,
  };
}
