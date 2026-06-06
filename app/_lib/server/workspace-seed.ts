import {
  buildInstrumentAiBias,
  buildInstrumentForecast,
  buildInstrumentSparkline,
  instrumentUniverse,
  type InstrumentUniverseEntry,
} from "@/app/_lib/instrument-universe";
import { getPriceFractionDigits } from "@/app/_lib/market-prices";
import {
  getStrategyTriggerTimeframe,
  selectStrategyProfile,
} from "@/app/_lib/strategy-profiles";
import type {
  PersistedPredictionHistoryRecord,
  PersistedWorkspaceData,
} from "./workspace-types";

const seededAt = "2026-06-04T06:00:00.000Z";

function inferRegime(entry: InstrumentUniverseEntry) {
  if (entry.change24h >= 2.5) {
    return "Risk-On" as const;
  }

  if (entry.change24h <= -2) {
    return "Risk-Off" as const;
  }

  return "Balanced" as const;
}

function formatPrice(entry: InstrumentUniverseEntry, value: number) {
  const decimals = getPriceFractionDigits(value, entry.assetClass);
  const formatted = value.toFixed(decimals);

  return entry.assetClass === "Forex" ? formatted : `$${formatted}`;
}

function getSeededStrategySelection(entry: InstrumentUniverseEntry) {
  const regime = inferRegime(entry);
  const profile = selectStrategyProfile({
    assetClass: entry.assetClass,
    liquidity: entry.liquidity,
    regime,
    score: entry.score,
    stance: entry.stance,
    tradeability: entry.tradeability,
    volatility: entry.volatility,
  });

  return {
    profile,
    regime,
    timeframe: getStrategyTriggerTimeframe(profile, entry.assetClass),
  };
}

function buildSetupId(entry: InstrumentUniverseEntry) {
  const { profile } = getSeededStrategySelection(entry);
  return `setup-${entry.symbol.toLowerCase()}-${profile.name.toLowerCase().replaceAll("/", "-").replaceAll(" ", "-")}`;
}

function buildEntryLevels(entry: InstrumentUniverseEntry) {
  const { timeframe } = getSeededStrategySelection(entry);
  const entryCompression =
    timeframe === "15M" ? 0.0028 : timeframe === "1H" ? 0.0042 : 0.0062;
  const breakoutAllowance =
    timeframe === "15M" ? 0.0018 : timeframe === "1H" ? 0.003 : 0.0046;
  const entryLow =
    entry.stance === "Long"
      ? entry.price * (1 - entryCompression)
      : entry.price * (1 - breakoutAllowance);
  const entryHigh =
    entry.stance === "Long"
      ? entry.price * (1 + breakoutAllowance)
      : entry.price * (1 + entryCompression);
  const stopAtrMultiple =
    timeframe === "15M" ? 0.75 : timeframe === "1H" ? 0.9 : 1.05;
  const minimumStopGap = Math.max(entry.atr * 0.35, entry.price * 0.0014);
  const rawStop =
    entry.stance === "Long"
      ? Math.max(entry.price - entry.atr * stopAtrMultiple, entry.price * 0.965)
      : entry.price + entry.atr * stopAtrMultiple;
  const stop =
    entry.stance === "Long"
      ? Math.max(Math.min(rawStop, entryLow - minimumStopGap), entry.price * 0.7)
      : Math.max(rawStop, entryHigh + minimumStopGap);
  const rewardMultiple = entry.score >= 86 ? 2.1 : entry.score >= 78 ? 1.9 : 1.7;
  const riskDistance = Math.abs(entry.price - stop);
  const rawTarget =
    entry.stance === "Long"
      ? entry.price + riskDistance * rewardMultiple
      : entry.price - riskDistance * rewardMultiple;
  const minimumTargetGap = Math.max(entry.atr * 0.5, entry.price * 0.0022);
  const target =
    entry.stance === "Long"
      ? Math.max(rawTarget, entryHigh + minimumTargetGap)
      : Math.max(rawTarget, entry.price * 0.6);

  return {
    entryHigh: Number(entryHigh.toFixed(6)),
    entryLow: Number(entryLow.toFixed(6)),
    riskReward: Number(rewardMultiple.toFixed(1)),
    stop: Number(stop.toFixed(6)),
    target: Number(target.toFixed(6)),
  };
}

function buildMarketEvents() {
  return [
    {
      id: "event-fed-path",
      title: "Federal Reserve tone remains the main short-term macro driver",
      summary:
        "Rate-path repricing is still steering risk appetite. Softer inflation language supports growth and crypto-beta continuation, while a hawkish surprise would likely pressure the highest-beta names first.",
      impact: "High" as const,
      bias: "Mixed" as const,
      scope: "Macro" as const,
      relatedSymbols: ["BTC", "ETH", "SOL", "NDX", "NVDA", "SPX"],
      startsAt: "2026-06-04T18:00:00.000Z",
      sourceLabel: "Macro Calendar",
      sourceType: "Calendar" as const,
      status: "Upcoming" as const,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "event-crypto-beta",
      title: "Crypto-beta rotation is still favoring leadership names",
      summary:
        "Short-term momentum and relative strength remain strongest in the higher-quality liquid crypto basket. Pullbacks are more actionable than early fade attempts while breadth stays healthy.",
      impact: "Medium" as const,
      bias: "Bullish" as const,
      scope: "Sector" as const,
      relatedSymbols: ["BTC", "ETH", "SOL", "LINK", "RENDER", "AVAX", "SUI", "JUP"],
      startsAt: "2026-06-04T09:00:00.000Z",
      sourceLabel: "Flow Monitor",
      sourceType: "Flow" as const,
      status: "Live" as const,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "event-usd-watch",
      title: "Dollar strength is the main headwind for FX and metals",
      summary:
        "A stronger dollar can slow follow-through in EURUSD, GBPUSD, gold, and silver. If the move fades, mean-reversion pressure can release quickly in the opposite direction.",
      impact: "Medium" as const,
      bias: "Bearish" as const,
      scope: "Macro" as const,
      relatedSymbols: ["EURUSD", "GBPUSD", "GOLD", "SILVER"],
      startsAt: "2026-06-04T07:30:00.000Z",
      sourceLabel: "FX Desk",
      sourceType: "Flow" as const,
      status: "Live" as const,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "event-ai-mega-cap",
      title: "AI mega-cap earnings revisions still support tech leadership",
      summary:
        "The AI-linked equity complex remains supported by estimate upgrades and demand resilience, which continues to favor names and indices already holding trend support.",
      impact: "Medium" as const,
      bias: "Bullish" as const,
      scope: "Sector" as const,
      relatedSymbols: ["NVDA", "MSFT", "NDX", "AINF"],
      startsAt: "2026-06-04T11:00:00.000Z",
      sourceLabel: "Equity Research",
      sourceType: "News" as const,
      status: "Recent" as const,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "event-energy-range",
      title: "Energy complex remains tactical rather than directional",
      summary:
        "Brent is still headline-sensitive and less orderly than the leading risk markets, so Siggi is less willing to force fresh exposure until structure improves.",
      impact: "Low" as const,
      bias: "Neutral" as const,
      scope: "Sector" as const,
      relatedSymbols: ["BRENT"],
      startsAt: "2026-06-04T06:45:00.000Z",
      sourceLabel: "Commodities Desk",
      sourceType: "News" as const,
      status: "Recent" as const,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ];
}

function resolveHistoryHorizon(entry: InstrumentUniverseEntry) {
  void entry;
  return "Day" as const;
}

const seededAssets = instrumentUniverse.map((entry) => ({
  ...(() => {
    const { profile, regime } = getSeededStrategySelection(entry);

    return {
      activeStrategy: profile.name,
      regime,
    };
  })(),
  symbol: entry.symbol,
  name: entry.name,
  assetClass: entry.assetClass,
  price: entry.price,
  change24h: entry.change24h,
  score: entry.score,
  tradeable: entry.tradeable,
  liquidity: entry.liquidity,
  volatility: entry.volatility,
  atr: entry.atr,
  forecast: buildInstrumentForecast(entry),
  aiBias: buildInstrumentAiBias(entry),
  sparkline: buildInstrumentSparkline(entry),
  source: "seed" as const,
  lastSyncedAt: seededAt,
  createdAt: seededAt,
  updatedAt: seededAt,
}));

const seededScannerResults = instrumentUniverse.map((entry) => {
  const { profile, regime, timeframe } = getSeededStrategySelection(entry);
  const levels = buildEntryLevels(entry);

  return {
    id: buildSetupId(entry),
    symbol: entry.symbol,
    strategy: profile.name,
    timeframe,
    score: entry.score,
    riskScore: entry.riskScore,
    regime,
    entryZone: `${formatPrice(entry, levels.entryLow)} - ${formatPrice(entry, levels.entryHigh)}`,
    stopLoss: formatPrice(entry, levels.stop),
    takeProfit: formatPrice(entry, levels.target),
    riskReward: levels.riskReward,
    liquidityStatus: entry.liquidity,
    tradeability: entry.tradeability,
    assetClass: entry.assetClass,
    thesis:
      entry.stance === "Short"
        ? `${entry.symbol} is weaker than the lead basket, so Siggi is watching for premium short entries instead of early dip-buying.`
        : `${entry.symbol} is being ranked around the ${profile.name} playbook so Siggi can focus on shorter intraday continuation or pullback quality rather than slower swing structures.`,
    linkedAssetSymbol: entry.symbol,
    linkedBacktestId: `bt-${entry.symbol.toLowerCase()}`,
    analysisStatus: "Ranked" as const,
    analysisUpdatedAt: null,
    analysis: null,
    createdAt: seededAt,
    updatedAt: seededAt,
  };
});

const seededBacktests = instrumentUniverse.map((entry) => {
  const { profile, timeframe } = getSeededStrategySelection(entry);
  const baseReturn = Math.max(8, entry.score * 0.42);
  const maxDrawdown = -Math.max(4.2, (100 - entry.score) * 0.22);
  const winRate = Math.min(0.68, Math.max(0.43, 0.44 + (entry.score - 70) / 200));
  const profitFactor = Math.min(2.4, Math.max(1.2, 1.25 + (entry.score - 68) / 40));

  return {
    id: `bt-${entry.symbol.toLowerCase()}`,
    asset: entry.symbol,
    strategy: profile.name,
    totalReturn: Number(baseReturn.toFixed(1)),
    annualisedReturn: Number((baseReturn * 0.68).toFixed(1)),
    winRate: Number(winRate.toFixed(3)),
    maxDrawdown: Number(maxDrawdown.toFixed(1)),
    profitFactor: Number(profitFactor.toFixed(2)),
    sharpe: Number((0.82 + (entry.score - 70) / 70).toFixed(2)),
    warnings:
      entry.volatility === "Fast"
        ? ["Expect wider intraday swings and stricter size discipline."]
        : ["Edge quality depends on waiting for the planned entry pocket."],
    equityCurve: [100, 102, 104, 103, 106, 109, 111, 114, 118, 121, 125, 129],
    drawdownCurve: [0, -0.4, -0.8, -1.5, -0.9, -1.8, -1.2, -2.4, -1.7, -1.1, -0.8, -0.4],
    timeframe,
    dateRange: "01 Jan 2025 - 31 May 2026",
    startingCapital: 100000,
    feesBps: 12,
    slippageBps: entry.volatility === "Fast" ? 20 : 14,
    aiRead:
      entry.stance === "Short" ? "Weakness still respected" : "Edge intact",
    status: "BACKTESTED" as const,
    linkedAssetSymbol: entry.symbol,
    linkedScannerResultId: buildSetupId(entry),
    createdAt: seededAt,
    updatedAt: seededAt,
  };
});

const seededConfirmationChecks = instrumentUniverse.map((entry) => ({
  id: `confirm-${entry.symbol.toLowerCase()}`,
  symbol: entry.symbol,
  stance: entry.stance === "Short" ? "Short" as const : "Long" as const,
  summary:
    entry.tradeability === "BLOCKED"
      ? `${entry.symbol} still fails at least one key confirmation layer, so Siggi is leaving it out of the top tier for now.`
      : `${entry.symbol} keeps enough structure, memory, and market-context confirmation to stay in the ranked short-term universe.`,
  score: Math.max(48, Math.min(89, entry.score - Math.round(entry.riskScore * 0.18))),
  overallStatus:
    entry.tradeability === "BLOCKED"
      ? "Rejected" as const
      : entry.tradeability === "WATCH"
        ? "Mixed" as const
        : "Confirmed" as const,
  linkedScannerResultId: buildSetupId(entry),
  checks: [
    {
      label: "Trend Structure",
      status:
        entry.tradeability === "BLOCKED"
          ? "Mixed" as const
          : "Confirmed" as const,
      detail:
        entry.stance === "Short"
          ? "Weak rallies are fading and lower highs are still respected."
          : "Higher lows remain intact on the active timeframe.",
    },
    {
      label: "Backtest Memory",
      status: entry.score >= 80 ? "Confirmed" as const : "Mixed" as const,
      detail: "Historical replay remains acceptable relative to the planned risk profile.",
    },
    {
      label: "Event Fit",
      status:
        entry.assetClass === "Forex" || entry.assetClass === "Commodity"
          ? "Mixed" as const
          : "Confirmed" as const,
      detail: "Macro pressure is being monitored so the timing call stays grounded.",
    },
  ],
  createdAt: seededAt,
  updatedAt: seededAt,
}));

const seededAiOpportunities = instrumentUniverse
  .slice()
  .sort((left, right) => right.score - left.score)
  .slice(0, 16)
  .map((entry) => {
    const { profile } = getSeededStrategySelection(entry);
    const levels = buildEntryLevels(entry);

    return {
      id: `opportunity-${entry.symbol.toLowerCase()}`,
      symbol: entry.symbol,
      side: entry.stance === "Short" ? "Short" as const : "Long" as const,
      title:
        entry.stance === "Short"
          ? "Short-term weakness worth stalking"
          : "Short-term continuation setup",
      summary:
        entry.stance === "Short"
          ? `${entry.symbol} is being monitored for a cleaner premium short entry rather than an immediate market chase.`
          : `${entry.symbol} is one of the stronger short-term instruments in the live universe and is being stalked through the ${profile.name} playbook.`,
      confidence: Math.max(58, Math.min(92, entry.score - Math.round(entry.riskScore * 0.12))),
      action:
        entry.tradeability === "BLOCKED"
          ? "Wait" as const
          : entry.stance === "Short"
            ? "Sell" as const
            : "Buy" as const,
      entryPlan: `${formatPrice(entry, levels.entryLow)} - ${formatPrice(entry, levels.entryHigh)}`,
      stopPlan: formatPrice(entry, levels.stop),
      targetPlan: formatPrice(entry, levels.target),
      expectedMove:
        entry.stance === "Short"
          ? "Favors downside follow-through if rallies keep failing."
          : "Favors upside continuation if pullbacks hold the planned zone.",
      invalidation:
        entry.stance === "Short"
          ? "Lose the lower-high pattern and reclaim the premium zone cleanly."
          : "Lose the pullback shelf and fail to reclaim the preferred entry pocket.",
      marketContext:
        entry.assetClass === "Crypto"
          ? "Crypto leadership remains the main short-term source of clean momentum."
          : "The setup is being scored in the context of current macro and cross-asset breadth.",
      newsContext:
        entry.assetClass === "Forex" || entry.assetClass === "Commodity"
          ? "Macro calendar pressure matters more here, so timing discipline is critical."
          : "No direct disqualifying catalyst, but the broader event tape still matters.",
      confirmationContext:
        entry.tradeability === "BLOCKED"
          ? "Evidence is incomplete, so Siggi is keeping it in watch mode."
          : "Trend, replay memory, and event context are aligned well enough to keep it ranked.",
      linkedScannerResultId: buildSetupId(entry),
      linkedBacktestId: `bt-${entry.symbol.toLowerCase()}`,
      createdAt: seededAt,
      updatedAt: seededAt,
    };
  });

const seededPredictionHistory: PersistedPredictionHistoryRecord[] = instrumentUniverse
  .slice()
  .sort((left, right) => right.score - left.score)
  .slice(0, 42)
  .map((entry, index) => {
    const { profile, timeframe } = getSeededStrategySelection(entry);
    const levels = buildEntryLevels(entry);
    const calledAt = new Date(Date.parse(seededAt) - index * 16 * 60 * 60 * 1000).toISOString();
    const horizon = resolveHistoryHorizon(entry);
    const resolvedAt = new Date(
      Date.parse(calledAt) +
        (timeframe === "15M" ? 6 : timeframe === "1H" ? 12 : 24) * 60 * 60 * 1000,
    ).toISOString();
    const direction: PersistedPredictionHistoryRecord["trendAtCall"] =
      entry.stance === "Short" ? "Bearish" : "Bullish";
    const actionAtCall: PersistedPredictionHistoryRecord["actionAtCall"] =
      entry.stance === "Short" ? "SELL" : "BUY";
    const decisionAtCall: PersistedPredictionHistoryRecord["decisionAtCall"] =
      entry.tradeability === "BLOCKED"
        ? "WAIT"
        : entry.score >= 82 || index % 4 !== 0
          ? "ENTER NOW"
          : "WAIT";
    const successfulCall = entry.score >= 79 || (entry.score >= 72 && index % 5 !== 0);
    const outcome: PersistedPredictionHistoryRecord["outcome"] =
      decisionAtCall === "WAIT"
        ? successfulCall
          ? "Skipped Correctly"
          : "Recovered Late"
        : successfulCall
          ? "Hit Target"
          : index % 2 === 0
            ? "Stopped"
            : "Stayed Flat";
    const outcomeAccuracy: PersistedPredictionHistoryRecord["outcomeAccuracy"] =
      outcome === "Hit Target" || outcome === "Skipped Correctly"
        ? "Accurate"
        : outcome === "Stopped"
          ? "Inaccurate"
          : "Neutral";
    const favorableMove =
      outcome === "Hit Target"
        ? Number((entry.change24h + entry.atr * 1.7).toFixed(1))
        : Number((Math.max(0.7, entry.change24h * 0.6 + entry.atr * 0.45)).toFixed(1));
    const adverseMove =
      outcome === "Stopped"
        ? Number((Math.max(1.1, entry.atr * 1.1)).toFixed(1))
        : Number((Math.max(0.3, entry.atr * 0.35)).toFixed(1));
    const moveFromCallPct =
      direction === "Bearish"
        ? Number((-favorableMove).toFixed(1))
        : Number(favorableMove.toFixed(1));
    const eventMoveAtCall: PersistedPredictionHistoryRecord["eventMoveAtCall"] =
      entry.assetClass === "Forex" || entry.assetClass === "Commodity"
        ? "Whipsaw"
        : direction === "Bearish"
          ? "Fall"
          : "Rise";
    const eventLikelihoodAtCall =
      entry.assetClass === "Forex" || entry.assetClass === "Commodity"
        ? 61
        : entry.score >= 86
          ? 78
          : entry.score >= 76
            ? 71
            : 64;

    return {
      id: `prediction-${entry.symbol.toLowerCase()}-${index + 1}`,
      symbol: entry.symbol,
      instrumentName: entry.name,
      assetClass: entry.assetClass,
      strategyAtCall: profile.name,
      timeframe,
      horizon,
      sourceScannerResultId: buildSetupId(entry),
      trendAtCall: direction,
      actionAtCall,
      decisionAtCall,
      confidenceAtCall: Math.max(54, Math.min(93, entry.score - Math.round(entry.riskScore * 0.14))),
      monitoringStatus: "Resolved",
      priceAtCall: entry.price,
      entryLowAtCall: levels.entryLow,
      entryHighAtCall: levels.entryHigh,
      stopPriceAtCall: levels.stop,
      targetPriceAtCall: levels.target,
      entryAtCall: `${formatPrice(entry, levels.entryLow)} - ${formatPrice(entry, levels.entryHigh)}`,
      discountedEntryAtCall:
        entry.stance === "Short"
          ? `${formatPrice(entry, levels.entryHigh * 0.996)} - ${formatPrice(entry, levels.entryHigh * 1.002)}`
          : `${formatPrice(entry, levels.entryLow * 0.998)} - ${formatPrice(entry, levels.entryLow * 1.004)}`,
      stopAtCall: formatPrice(entry, levels.stop),
      targetAtCall: formatPrice(entry, levels.target),
      eventMoveAtCall,
      eventLikelihoodAtCall,
      eventIdsAtCall:
        entry.assetClass === "Crypto"
          ? ["event-crypto-beta", "event-fed-path"]
          : entry.assetClass === "Forex" || entry.assetClass === "Commodity"
            ? ["event-usd-watch", "event-fed-path"]
            : ["event-ai-mega-cap", "event-fed-path"],
      eventTitlesAtCall:
        entry.assetClass === "Crypto"
          ? ["Crypto-beta rotation is still favoring leadership names", "Federal Reserve tone remains the main short-term macro driver"]
          : entry.assetClass === "Forex" || entry.assetClass === "Commodity"
            ? ["Dollar strength is the main headwind for FX and metals", "Federal Reserve tone remains the main short-term macro driver"]
            : ["AI mega-cap earnings revisions still support tech leadership", "Federal Reserve tone remains the main short-term macro driver"],
      eventContextAtCall:
        entry.assetClass === "Crypto"
          ? "Crypto sector flow and macro-liquidity repricing were the main live event drivers when the call was made."
          : entry.assetClass === "Forex" || entry.assetClass === "Commodity"
            ? "Dollar-flow and macro-rate expectations were the main event drivers when the call was made."
            : "Sector news and broad macro tone were both active at the time of the call.",
      patternSnapshotAtCall:
        entry.stance === "Short"
          ? "Weak rallies were failing inside a defensive structure."
          : "Trend structure was constructive with pullback-or-breakout support.",
      indicatorSnapshotAtCall: [
        entry.stance === "Short" ? "EMA stack: Bearish" : "EMA stack: Bullish",
        entry.stance === "Short" ? "RSI: Soft" : "RSI: Supportive",
        entry.stance === "Short" ? "MACD: Negative spread" : "MACD: Positive spread",
      ],
      strategySnapshotAtCall: [
        `${profile.name}: Primary setup`,
        entry.stance === "Short" ? "Pullback validation: premium short pocket" : "Pullback validation: discounted long pocket",
        "Breakout check: monitored before entry lock",
      ],
      validationSnapshotAtCall: [
        "Siggi cycled trend continuation, breakout, pullback, and mean-reversion checks before locking the call.",
        "The indicator sweep was used to validate the primary entry zone rather than relying on one signal alone.",
      ],
      calledAt,
      lastCandleCheckAt: resolvedAt,
      resolvedAt,
      resolutionMethod: "candle-range",
      ambiguousResolution: false,
      outcome,
      outcomeAccuracy,
      moveFromCallPct,
      maxFavorableExcursionPct: favorableMove,
      maxAdverseExcursionPct: adverseMove,
      accuracyScore:
        outcomeAccuracy === "Accurate"
          ? Math.max(68, Math.min(95, entry.score))
          : outcomeAccuracy === "Inaccurate"
            ? Math.max(24, 58 - Math.round(entry.riskScore * 0.4))
            : 50,
      resolutionEvidence:
        outcome === "Hit Target"
          ? "Resolved from the seeded candle-range replay."
          : outcome === "Stopped"
            ? "Resolved from the seeded candle-range replay."
            : "The seeded replay could not produce a decisive win/loss resolution.",
      resolvedSource: "seed_replay",
      tradedStatus: "not_traded",
      narrative:
        outcomeAccuracy === "Accurate"
          ? `${entry.symbol} respected the planned ${entry.timeframe} setup after the call, and the move developed in the forecast direction before invalidation was threatened.`
          : outcomeAccuracy === "Inaccurate"
            ? `${entry.symbol} broke the planned structure too early, so the original timing read was early or the event pressure was underestimated.`
            : `${entry.symbol} drifted without clean follow-through, so the call was not clearly wrong but it did not mature into a decisive move either.`,
      createdAt: calledAt,
      updatedAt: resolvedAt,
    };
  });

export const defaultWorkspaceData: PersistedWorkspaceData = {
  schemaVersion: 12,
  updatedAt: seededAt,
  workspace: {
    id: "workspace-signalibrium-mvp",
    name: "Signalibrium MVP Workspace",
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  syncState: {
    sparklineCursor: 0,
    intelligenceLastSyncedAt: seededAt,
    pricePulseLastSyncedAt: seededAt,
    pricePulseTape: {},
  },
  brokerConnections: [],
  watchlists: [
    {
      id: "watchlist-core",
      name: "Core Watchlist",
      description: `Siggi-ranked universe of ${instrumentUniverse.length} live instruments.`,
      itemSymbols: instrumentUniverse.map((entry) => entry.symbol),
      isDefault: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ],
  tradeTickets: [],
  journalEntries: [],
  assets: seededAssets,
  scannerResults: seededScannerResults,
  backtests: seededBacktests,
  marketSnapshot: {
    id: "market-snapshot-primary",
    state: "Short-term risk-on rotation",
    description:
      "Siggi is prioritizing liquid short-term opportunities where structure, memory, and event context align cleanly.",
    breadthScore: 64,
    tradeableSetups: seededScannerResults.filter((item) => item.tradeability === "TRADEABLE").length,
    blockedSetups: seededScannerResults.filter((item) => item.tradeability === "BLOCKED").length,
    watchlistMove: 2.8,
    simulatedEquity: 182450,
    openRisk: 1.9,
    lastRefresh: "04 Jun 2026 07:00 BST",
    journalReminder:
      "Review the highest-ranked short-term names after each sync and wait for discounted entry pockets instead of chasing extension.",
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  marketEvents: buildMarketEvents(),
  confirmationChecks: seededConfirmationChecks,
  aiOpportunities: seededAiOpportunities,
  predictionHistory: seededPredictionHistory,
  siggiAccount: {
    id: "siggi-paper-account",
    botName: "Siggi",
    baseCurrency: "GBP",
    startingBalanceGbp: 50,
    cashBalanceGbp: 50,
    highWatermarkGbp: 50,
    resetCount: 0,
    successfulTrades: 0,
    failedTrades: 0,
    openTrades: [],
    closedTrades: [],
    equityCurve: [
      {
        at: seededAt,
        cashBalanceGbp: 50,
        equityGbp: 50,
        openTrades: 0,
      },
    ],
    activityLog: [
      {
        id: "siggi-seed-log",
        at: seededAt,
        type: "Reset",
        symbol: null,
        detail: "Siggi paper account initialized with GBP 50 starting capital.",
      },
    ],
    lastEvaluatedAt: null,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
};
