import { deriveChartAnalysis } from "@/app/_lib/chart-analysis";
import {
  getPriceFractionDigits,
  roundPriceValue,
} from "@/app/_lib/market-prices";
import { buildFallbackChart } from "./market-data/fallback-chart";
import type { LiveCandle, SupportedChartInterval } from "./market-data/provider-types";
import { fetchLiveCandlesForSymbol } from "./market-data/market-data";
import { getAssetBySymbol } from "./repositories/assets";
import type {
  OpportunityAnalysisSnapshot,
  PersistedScannerResult,
} from "./workspace-types";

function parseCurrencyLabel(label: string) {
  return Number(label.replaceAll("$", "").replaceAll(",", "").trim());
}

function parseEntryZone(entryZone: string) {
  const [rawLow, rawHigh] = entryZone.split("-").map((value) => parseCurrencyLabel(value));
  const low = Number.isFinite(rawLow) ? rawLow : 0;
  const high = Number.isFinite(rawHigh) ? rawHigh : low;

  return {
    low,
    high: Number.isFinite(high) ? high : low,
  };
}

function resolveChartInterval(timeframe: string): SupportedChartInterval {
  if (timeframe.toUpperCase().includes("1D")) {
    return "1day";
  }

  if (timeframe.toUpperCase().includes("4H")) {
    return "4h";
  }

  if (timeframe.toUpperCase().includes("15")) {
    return "15min";
  }

  return "1h";
}

function getMultiTimeframeIntervals(
  interval: SupportedChartInterval,
): Array<{
  label: string;
  timeframe: string;
  interval: SupportedChartInterval;
}> {
  if (interval === "15min") {
    return [
      { label: "Trigger", timeframe: "15m", interval: "15min" },
      { label: "Structure", timeframe: "1h", interval: "1h" },
      { label: "Trend", timeframe: "4h", interval: "4h" },
    ];
  }

  if (interval === "1h") {
    return [
      { label: "Trigger", timeframe: "1h", interval: "1h" },
      { label: "Structure", timeframe: "4h", interval: "4h" },
      { label: "Trend", timeframe: "1D", interval: "1day" },
    ];
  }

  if (interval === "4h") {
    return [
      { label: "Trigger", timeframe: "4h", interval: "4h" },
      { label: "Structure", timeframe: "1D", interval: "1day" },
      { label: "Trend", timeframe: "1D", interval: "1day" },
    ];
  }

  return [
    { label: "Trigger", timeframe: "1D", interval: "1day" },
    { label: "Structure", timeframe: "1D", interval: "1day" },
    { label: "Trend", timeframe: "1D", interval: "1day" },
  ];
}

function formatPrice(value: number) {
  const decimals = getPriceFractionDigits(value);
  return `$${value.toFixed(decimals)}`;
}

function scaleSparklineToAssetPrice(series: number[] | undefined, price: number | undefined) {
  if (!series?.length || !price || !Number.isFinite(price)) {
    return [price ?? 1, price ?? 1.01];
  }

  const last = series[series.length - 1];

  if (!Number.isFinite(last) || last <= 0) {
    return Array(series.length).fill(price);
  }

  return series.map((value) => roundPriceValue((value / last) * price));
}

async function fetchAnalysisChart(
  symbol: string,
  interval: SupportedChartInterval,
  assetName: string,
  sparkline: number[] | undefined,
  price: number | undefined,
  lastSyncedAt: string | undefined,
) {
  return fetchLiveCandlesForSymbol(symbol, interval, 72).catch(() =>
    buildFallbackChart(
      symbol,
      assetName,
      scaleSparklineToAssetPrice(sparkline, price),
      lastSyncedAt ?? new Date().toISOString(),
      interval,
    ),
  );
}

function resolveExecutionPlan(input: {
  atr: number;
  currentPrice: number;
  demandZone: { low: number; high: number };
  resistanceLevels: number[];
  scannerResult: PersistedScannerResult;
  supportLevels: number[];
}) {
  const configuredEntryZone = parseEntryZone(input.scannerResult.entryZone);
  const configuredStopLevel = parseCurrencyLabel(input.scannerResult.stopLoss);
  const configuredTargetLevel = parseCurrencyLabel(input.scannerResult.takeProfit);
  const configuredMidpoint = (configuredEntryZone.low + configuredEntryZone.high) / 2;
  const driftRatio =
    input.currentPrice > 0 ? Math.abs(configuredMidpoint - input.currentPrice) / input.currentPrice : 0;
  const hasStaleExecutionPlan = driftRatio >= 0.18;

  if (!hasStaleExecutionPlan) {
    return {
      entryZone: configuredEntryZone,
      executionAdjustmentNote: null,
      stopLevel: configuredStopLevel,
      targetLevel: configuredTargetLevel,
    };
  }

  const entryZone = {
    low: roundPriceValue(Math.max(input.demandZone.low, input.currentPrice - input.atr * 0.35)),
    high: roundPriceValue(Math.max(input.demandZone.high, input.currentPrice)),
  };
  const stopLevel = roundPriceValue(
    Math.max(
      0.0000000001,
      Math.min(input.demandZone.low, input.supportLevels[0] ?? input.currentPrice) - input.atr * 0.45,
    ),
  );
  const riskUnit = Math.max(entryZone.high - stopLevel, input.atr * 0.8, input.currentPrice * 0.01);
  const targetLevel = roundPriceValue(
    Math.max(
      input.resistanceLevels[0] ?? 0,
      entryZone.high + riskUnit * Math.max(1.6, input.scannerResult.riskReward),
    ),
  );

  return {
    entryZone,
    executionAdjustmentNote:
      "Stored ticket levels were materially out of sync with the live market, so the analysis re-anchored entry, stop, and target to the current structure before drawing the chart.",
    stopLevel,
    targetLevel,
  };
}

function averageTrueRange(candles: LiveCandle[], period = 14) {
  const ranges: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    ranges.push(trueRange);
  }

  if (ranges.length === 0) {
    return 0;
  }

  const recentRanges = ranges.slice(-period);
  return recentRanges.reduce((sum, value) => sum + value, 0) / recentRanges.length;
}

function collectPivotIndices(candles: LiveCandle[], kind: "high" | "low") {
  const indices: number[] = [];

  for (let index = 2; index < candles.length - 2; index += 1) {
    const value = kind === "high" ? candles[index].high : candles[index].low;
    const leftOne = kind === "high" ? candles[index - 1].high : candles[index - 1].low;
    const leftTwo = kind === "high" ? candles[index - 2].high : candles[index - 2].low;
    const rightOne = kind === "high" ? candles[index + 1].high : candles[index + 1].low;
    const rightTwo = kind === "high" ? candles[index + 2].high : candles[index + 2].low;

    if (kind === "high") {
      if (value >= leftOne && value >= leftTwo && value >= rightOne && value >= rightTwo) {
        indices.push(index);
      }
    } else if (value <= leftOne && value <= leftTwo && value <= rightOne && value <= rightTwo) {
      indices.push(index);
    }
  }

  return indices;
}

function dedupeNearbyLevels(levels: number[], threshold: number) {
  return levels.reduce<number[]>((unique, level) => {
    if (unique.some((value) => Math.abs(value - level) <= threshold)) {
      return unique;
    }

    unique.push(level);
    return unique;
  }, []);
}

function selectLevels(candles: LiveCandle[], kind: "high" | "low", atr: number) {
  const pivotIndices = collectPivotIndices(candles, kind);
  const candidateLevels = pivotIndices
    .slice(-6)
    .map((index) => (kind === "high" ? candles[index].high : candles[index].low));
  const fallbackLevels =
    kind === "high"
      ? candles.slice(-12).map((candle) => candle.high).sort((left, right) => right - left)
      : candles.slice(-12).map((candle) => candle.low).sort((left, right) => left - right);
  const threshold = Math.max(atr * 0.55, candles[candles.length - 1].close * 0.006);
  const rawLevels =
    candidateLevels.length > 0 ? candidateLevels : fallbackLevels.slice(0, 3);
  const sorted =
    kind === "high"
      ? [...rawLevels].sort((left, right) => right - left)
      : [...rawLevels].sort((left, right) => left - right);

  return dedupeNearbyLevels(sorted, threshold).slice(0, 2);
}

function buildTrendline(
  candles: LiveCandle[],
  bias: OpportunityAnalysisSnapshot["bias"],
) {
  const midpoint = Math.max(6, Math.floor(candles.length * 0.45));

  if (bias.toLowerCase().includes("bull")) {
    const earlyLow = candles
      .slice(0, midpoint)
      .reduce(
        (best, candle, index) =>
          candle.low < best.price ? { index, price: candle.low } : best,
        { index: 0, price: candles[0].low },
      );
    const lateLow = candles
      .slice(midpoint)
      .reduce(
        (best, candle, index) =>
          candle.low <= best.price ? { index: midpoint + index, price: candle.low } : best,
        { index: midpoint, price: candles[midpoint].low },
      );

    return {
      direction: "up" as const,
      endIndex: lateLow.index,
      endPrice: lateLow.price,
      startIndex: earlyLow.index,
      startPrice: earlyLow.price,
    };
  }

  const earlyHigh = candles
    .slice(0, midpoint)
    .reduce(
      (best, candle, index) =>
        candle.high > best.price ? { index, price: candle.high } : best,
      { index: 0, price: candles[0].high },
    );
  const lateHigh = candles
    .slice(midpoint)
    .reduce(
      (best, candle, index) =>
        candle.high >= best.price ? { index: midpoint + index, price: candle.high } : best,
      { index: midpoint, price: candles[midpoint].high },
    );

  return {
    direction: "down" as const,
    endIndex: lateHigh.index,
    endPrice: lateHigh.price,
    startIndex: earlyHigh.index,
    startPrice: earlyHigh.price,
  };
}

function buildConsolidationRange(candles: LiveCandle[], atr: number) {
  const recentWindow = candles.slice(-10);
  const high = Math.max(...recentWindow.map((candle) => candle.high));
  const low = Math.min(...recentWindow.map((candle) => candle.low));

  if (high - low <= Math.max(atr * 1.6, recentWindow[recentWindow.length - 1].close * 0.02)) {
    return { high, low };
  }

  return null;
}

function summarizeSignals(
  signalCards: ReturnType<typeof deriveChartAnalysis>["signalCards"],
) {
  const constructive = signalCards.filter((card) => card.tone === "Constructive").length;
  const soft = signalCards.filter((card) => card.tone === "Soft").length;

  if (constructive >= 3) {
    return "Most of the fast trend and momentum stack is supportive, so continuation is still the higher-probability path if price respects nearby support.";
  }

  if (soft >= 3) {
    return "The indicator stack is leaning defensive, so rallies are more likely to behave like resistance tests unless structure improves.";
  }

  return "The indicator stack is mixed, which usually means the next move depends on whether price resolves above resistance or loses support first.";
}

function buildIndicatorSweep(
  signalCards: ReturnType<typeof deriveChartAnalysis>["signalCards"],
) {
  return signalCards.map((card) => ({
    label: card.label,
    status:
      card.signal === "bullish"
        ? ("Bullish" as const)
        : card.signal === "bearish"
          ? ("Bearish" as const)
          : ("Neutral" as const),
    detail: card.explanation,
    value:
      typeof card.value === "number" && Number.isFinite(card.value)
        ? card.value.toFixed(2)
        : "N/A",
  }));
}

function buildStrategyChecks(input: {
  analysis: ReturnType<typeof deriveChartAnalysis>;
  consolidationRange: { low: number; high: number } | null;
  currentPrice: number;
  resistanceLevels: number[];
  scannerResult: PersistedScannerResult;
  supportLevels: number[];
}) {
  const latestSignals = input.analysis.signalCards;
  const bullishVotes = latestSignals.filter((card) => card.signal === "bullish").length;
  const bearishVotes = latestSignals.filter((card) => card.signal === "bearish").length;
  const mixedVotes = latestSignals.length - bullishVotes - bearishVotes;
  const firstResistance = input.resistanceLevels[0] ?? input.currentPrice;
  const firstSupport = input.supportLevels[0] ?? input.currentPrice;
  const breakoutStatus =
    input.currentPrice >= firstResistance * 0.992
      ? "Confirmed"
      : input.currentPrice >= firstSupport
        ? "Mixed"
        : "Rejected";
  const pullbackStatus =
    input.currentPrice <= firstSupport * 1.01
      ? "Confirmed"
      : input.currentPrice <= firstResistance
        ? "Mixed"
        : "Rejected";
  const trendStatus =
    bullishVotes >= 4 || bearishVotes >= 4
      ? "Confirmed"
      : mixedVotes >= 3
        ? "Mixed"
        : "Rejected";
  const meanReversionStatus =
    input.consolidationRange
      ? "Confirmed"
      : input.scannerResult.strategy === "RSI Pullback"
        ? "Mixed"
        : "Rejected";

  return [
    {
      label: "Trend Continuation",
      status: trendStatus as "Confirmed" | "Mixed" | "Rejected",
      detail:
        trendStatus === "Confirmed"
          ? "The broader indicator stack is aligned enough to support continuation."
          : trendStatus === "Mixed"
            ? "Trend structure is present but the stack still has mixed confirmation."
            : "Trend continuation is not strongly confirmed by the current stack.",
    },
    {
      label: "Breakout Validation",
      status: breakoutStatus as "Confirmed" | "Mixed" | "Rejected",
      detail:
        breakoutStatus === "Confirmed"
          ? "Price is close enough to active resistance that a breakout path is plausible."
          : breakoutStatus === "Mixed"
            ? "Breakout potential exists, but price still needs to prove itself at resistance."
            : "Breakout conditions are weak because price has slipped away from the pressure point.",
    },
    {
      label: "Pullback Validation",
      status: pullbackStatus as "Confirmed" | "Mixed" | "Rejected",
      detail:
        pullbackStatus === "Confirmed"
          ? "Price is close enough to support or demand to justify a disciplined pullback read."
          : pullbackStatus === "Mixed"
            ? "The pullback idea is still valid, but it is not yet in the cleanest part of the zone."
            : "The pullback is stretched away from support, so a better reset is preferable.",
    },
    {
      label: "Mean Reversion Check",
      status: meanReversionStatus as "Confirmed" | "Mixed" | "Rejected",
      detail:
        meanReversionStatus === "Confirmed"
          ? "Compression or range behavior gives a mean-reversion case some support."
          : meanReversionStatus === "Mixed"
            ? "The setup can still retrace, but this is not a pure mean-reversion environment."
            : "Mean-reversion conditions are weak compared with the trend-led read.",
    },
  ];
}

function buildValidationSummary(
  strategyChecks: ReturnType<typeof buildStrategyChecks>,
  indicatorSweep: ReturnType<typeof buildIndicatorSweep>,
) {
  const confirmedStrategies = strategyChecks.filter((item) => item.status === "Confirmed").length;
  const bullishIndicators = indicatorSweep.filter((item) => item.status === "Bullish").length;
  const bearishIndicators = indicatorSweep.filter((item) => item.status === "Bearish").length;

  if (confirmedStrategies >= 3 && bullishIndicators >= bearishIndicators + 2) {
    return "Multiple strategy paths and the broader indicator sweep are aligned, so Siggi can treat the setup as well cross-checked.";
  }

  if (confirmedStrategies >= 3 && bearishIndicators >= bullishIndicators + 2) {
    return "Multiple strategy paths and the indicator sweep both lean defensive, so Siggi can treat the short-side read as well cross-checked.";
  }

  return "Siggi is cycling through several strategy reads and indicators, but the stack is still mixed enough that timing discipline matters more than raw conviction.";
}

function buildMultiTimeframeChecks(input: {
  analysisByInterval: Map<SupportedChartInterval, ReturnType<typeof deriveChartAnalysis>>;
  baseInterval: SupportedChartInterval;
  primaryDirection: "bullish" | "bearish" | "neutral";
}) {
  const intervalDefinitions = getMultiTimeframeIntervals(input.baseInterval);

  return intervalDefinitions.map((definition) => {
    const analysis = input.analysisByInterval.get(definition.interval);
    const signal = analysis?.overall.signal ?? "neutral";
    const status =
      input.primaryDirection === "neutral" || signal === "neutral"
        ? ("Mixed" as const)
        : signal === input.primaryDirection
          ? ("Aligned" as const)
          : ("Contrary" as const);

    return {
      label: definition.label,
      timeframe: definition.timeframe,
      status,
      detail:
        analysis?.overall.summary ??
        `${definition.timeframe} confirmation is not available yet, so this layer is treated as mixed.`,
    };
  });
}

function buildMultiTimeframeSummary(
  checks: ReturnType<typeof buildMultiTimeframeChecks>,
) {
  const aligned = checks.filter((item) => item.status === "Aligned").length;
  const contrary = checks.filter((item) => item.status === "Contrary").length;

  if (aligned >= 3) {
    return "Trigger, structure, and trend timeframes are all aligned, so the setup has broad confirmation across the short-term stack.";
  }

  if (aligned >= 2 && contrary === 0) {
    return "Most of the active timeframes are aligned, which supports the setup as long as the trigger chart keeps holding its zone.";
  }

  if (contrary >= 2) {
    return "Higher and lower timeframes are materially conflicting, so Siggi should be slower to call a perfect entry here.";
  }

  return "The timeframe stack is mixed, so the setup needs cleaner trigger behaviour before Siggi should trust it aggressively.";
}

function buildTimeframeAgreementScore(
  checks: ReturnType<typeof buildMultiTimeframeChecks>,
) {
  const score = checks.reduce((total, item) => {
    if (item.status === "Aligned") {
      return total + 18;
    }

    if (item.status === "Mixed") {
      return total + 10;
    }

    return total - 8;
  }, 28);

  return Math.max(25, Math.min(95, score));
}

function buildRegimeSummary(input: {
  assetRegime: string | undefined;
  bias: string;
  strategy: string;
}) {
  const regime = (input.assetRegime ?? "Balanced").toLowerCase();
  const bias = input.bias.toLowerCase();
  const strategy = input.strategy.toLowerCase();

  if (regime.includes("risk-on") && bias.includes("bull")) {
    return strategy.includes("breakout")
      ? "The live regime is supportive for bullish breakout continuation, so the setup has a friendlier background than usual."
      : "The live regime is broadly supportive for long exposure, though timing still matters more than simply buying strength.";
  }

  if (regime.includes("risk-off") && bias.includes("bear")) {
    return "The live regime is defensive enough that short-side or fade logic has a stronger tailwind than usual.";
  }

  if (regime.includes("risk-off") && bias.includes("bull")) {
    return "The live regime is still defensive, so bullish setups need stronger trigger confirmation and tighter timing than they would in a healthier tape.";
  }

  if (regime.includes("balanced")) {
    return "The live regime is mixed, so structure and timing matter more than raw trend acceleration.";
  }

  return "Regime alignment is not fully decisive here, so the setup should be judged more by confirmation than by broad tape conditions.";
}

function buildWeeklyOutlook(input: {
  bias: string;
  supportLevels: number[];
  resistanceLevels: number[];
  consolidationRange: { low: number; high: number } | null;
  symbol: string;
}) {
  const firstSupport = input.supportLevels[0];
  const firstResistance = input.resistanceLevels[0];

  if (input.bias.toLowerCase().includes("bull")) {
    return `${input.symbol} still has a constructive weekly path while price holds above ${formatPrice(firstSupport ?? 0)}. A clean push through ${formatPrice(firstResistance ?? 0)} would keep continuation in play.`;
  }

  if (input.bias.toLowerCase().includes("bear")) {
    return `${input.symbol} stays fragile unless buyers can reclaim ${formatPrice(firstResistance ?? 0)}. Losing ${formatPrice(firstSupport ?? 0)} would keep pressure on through the week.`;
  }

  if (input.consolidationRange) {
    return `${input.symbol} is compressing between ${formatPrice(input.consolidationRange.low)} and ${formatPrice(input.consolidationRange.high)}. The weekly move is likely to follow whichever side of that range gives way first.`;
  }

  return `${input.symbol} is trading in a mixed weekly posture, so patience matters more than forcing early conviction.`;
}

export async function generateOpportunityAnalysis(
  scannerResult: PersistedScannerResult,
): Promise<OpportunityAnalysisSnapshot> {
  const interval = resolveChartInterval(scannerResult.timeframe);
  const asset = await getAssetBySymbol(scannerResult.symbol);
  const analysisCharts = await Promise.all(
    [...new Set(getMultiTimeframeIntervals(interval).map((item) => item.interval))]
      .map(async (analysisInterval) => [
        analysisInterval,
        await fetchAnalysisChart(
          scannerResult.symbol,
          analysisInterval,
          asset?.name ?? scannerResult.symbol,
          asset?.sparkline,
          asset?.price,
          asset?.lastSyncedAt,
        ),
      ] as const),
  );
  const chartsByInterval = new Map(analysisCharts);
  const chart = chartsByInterval.get(interval) ?? await fetchAnalysisChart(
    scannerResult.symbol,
    interval,
    asset?.name ?? scannerResult.symbol,
    asset?.sparkline,
    asset?.price,
    asset?.lastSyncedAt,
  );
  const candles = chart.candles;
  const analysis = deriveChartAnalysis(candles, scannerResult.symbol, asset?.name ?? scannerResult.symbol);
  const analysisByInterval = new Map<SupportedChartInterval, ReturnType<typeof deriveChartAnalysis>>(
    analysisCharts.map(([analysisInterval, intervalChart]) => [
      analysisInterval,
      deriveChartAnalysis(
        intervalChart.candles,
        scannerResult.symbol,
        asset?.name ?? scannerResult.symbol,
      ),
    ]),
  );
  const atr = averageTrueRange(candles);
  const supportLevels = selectLevels(candles, "low", atr);
  const resistanceLevels = selectLevels(candles, "high", atr);
  const demandAnchor = supportLevels[0] ?? Math.min(...candles.slice(-12).map((candle) => candle.low));
  const supplyAnchor = resistanceLevels[0] ?? Math.max(...candles.slice(-12).map((candle) => candle.high));
  const currentPrice = candles[candles.length - 1]?.close ?? asset?.price ?? 0;
  const demandZone = {
    high: demandAnchor + atr * 0.45,
    low: Math.max(0, demandAnchor - atr * 0.25),
  };
  const supplyZone = {
    high: supplyAnchor + atr * 0.25,
    low: Math.max(0, supplyAnchor - atr * 0.45),
  };
  const executionPlan = resolveExecutionPlan({
    atr,
    currentPrice,
    demandZone,
    resistanceLevels,
    scannerResult,
    supportLevels,
  });
  const consolidationRange = buildConsolidationRange(candles, atr);
  const trendline = buildTrendline(candles, analysis.overall.bias);
  const indicatorSweep = buildIndicatorSweep(analysis.signalCards);
  const multiTimeframeChecks = buildMultiTimeframeChecks({
    analysisByInterval,
    baseInterval: interval,
    primaryDirection: analysis.overall.signal,
  });
  const strategyChecks = buildStrategyChecks({
    analysis,
    consolidationRange,
    currentPrice,
    resistanceLevels,
    scannerResult,
    supportLevels,
  });
  const now = new Date().toISOString();
  const multiTimeframeSummary = buildMultiTimeframeSummary(multiTimeframeChecks);
  const timeframeAgreementScore = buildTimeframeAgreementScore(multiTimeframeChecks);

  return {
    bias: analysis.overall.bias,
    weeklyOutlook: buildWeeklyOutlook({
      bias: analysis.overall.bias,
      consolidationRange,
      resistanceLevels,
      supportLevels,
      symbol: scannerResult.symbol,
    }),
    regimeSummary: buildRegimeSummary({
      assetRegime: asset?.regime,
      bias: analysis.overall.bias,
      strategy: scannerResult.strategy,
    }),
    indicatorSummary: summarizeSignals(analysis.signalCards),
    indicatorSweep,
    multiTimeframeSummary,
    multiTimeframeChecks,
    timeframeAgreementScore,
    strategyChecks,
    validationSummary: buildValidationSummary(strategyChecks, indicatorSweep),
    trendPattern:
      analysis.overall.bias.toLowerCase().includes("bull")
        ? "Constructive trend with pullback-or-breakout bias."
        : analysis.overall.bias.toLowerCase().includes("bear")
          ? "Defensive trend with rally-fade or breakdown bias."
          : "Mixed structure where consolidation and reaction levels matter more than trend speed.",
    trendlineSummary:
      trendline?.direction === "up"
        ? `The active structure still respects an upward trendline from ${formatPrice(trendline.startPrice)} into ${formatPrice(trendline.endPrice)}.`
        : trendline
          ? `The dominant line is still leaning lower from ${formatPrice(trendline.startPrice)} into ${formatPrice(trendline.endPrice)}.`
          : "No clean trendline dominates the current structure.",
    supportLevels: supportLevels.map((level) => formatPrice(level)),
    resistanceLevels: resistanceLevels.map((level) => formatPrice(level)),
    demandZone: `${formatPrice(demandZone.low)} - ${formatPrice(demandZone.high)}`,
    supplyZone: `${formatPrice(supplyZone.low)} - ${formatPrice(supplyZone.high)}`,
    consolidation:
      consolidationRange
        ? `Price is compressing between ${formatPrice(consolidationRange.low)} and ${formatPrice(consolidationRange.high)}.`
        : "No tight consolidation box is dominating the current tape.",
    entryGuidance: `Preferred entry sits inside ${formatPrice(executionPlan.entryZone.low)} - ${formatPrice(executionPlan.entryZone.high)} and is strongest when price reacts constructively inside demand rather than chasing extension.`,
    stopGuidance: `Keep invalidation under ${formatPrice(executionPlan.stopLevel)} so the trade is wrong quickly if structure breaks.`,
    targetGuidance: `First upside objective remains ${formatPrice(executionPlan.targetLevel)} with resistance checks into ${formatPrice(resistanceLevels[0] ?? executionPlan.targetLevel)}.`,
    executionNotes: [
      `${scannerResult.tradeability === "TRADEABLE" ? "The setup is currently actionable" : "The setup still needs patience"} under the desk filters.`,
      `Liquidity is ${scannerResult.liquidityStatus.toLowerCase()} and risk/reward is currently ${scannerResult.riskReward.toFixed(2)}.`,
      analysis.overall.bias.toLowerCase().includes("bull")
        ? "Favour entries on controlled pullbacks or clean range breaks, not late vertical candles."
        : "Treat bounces with suspicion until momentum and structure improve together.",
      ...(executionPlan.executionAdjustmentNote ? [executionPlan.executionAdjustmentNote] : []),
    ],
    analyzedAt: now,
    timeframe: scannerResult.timeframe,
    chartAnnotations: {
      supportLevels,
      resistanceLevels,
      demandZone,
      supplyZone,
      consolidationRange,
      trendline,
      entryZone: executionPlan.entryZone,
      stopLevel: executionPlan.stopLevel,
      targetLevel: executionPlan.targetLevel,
    },
  };
}
