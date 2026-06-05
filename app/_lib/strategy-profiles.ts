import type {
  InstrumentAssetClass,
  InstrumentLiquidity,
  InstrumentStance,
  InstrumentStrategy,
  InstrumentTradeability,
  InstrumentVolatility,
} from "@/app/_lib/instrument-universe";

type MarketRegime = "Risk-On" | "Balanced" | "Risk-Off";
type TriggerTimeframe = "15M" | "1H" | "4H";

export type StrategyProfile = {
  id: string;
  name: InstrumentStrategy;
  thesis: string;
  supportedAssets: InstrumentAssetClass[];
  supportedTimeframes: TriggerTimeframe[];
  bestRegimes: MarketRegime[];
  worstRegimes: MarketRegime[];
  typicalHoldHours: {
    minimum: number;
    maximum: number;
  };
  rules: string[];
  visualModel?: {
    pattern: string;
    entry: string;
    invalidation: string;
  };
  confluenceChecks?: string[];
};

export const strategyDecisionFramework = [
  {
    label: "Structure",
    detail: "Higher highs/lows, lower highs/lows, support/resistance role reversal, and M/W necklines define whether Siggi is reading continuation or reversal.",
  },
  {
    label: "Location",
    detail: "Entries are graded by proximity to demand, supply, VWAP, Fibonacci retracement clusters, and prior breakout shelves.",
  },
  {
    label: "Candle Behaviour",
    detail: "Engulfing, rejection wick, doji/indecision, strong displacement, and exhaustion candles help decide whether a level is being accepted or rejected.",
  },
  {
    label: "Inefficiency",
    detail: "Large displacement candles can leave an imbalance/fair-value-gap style pocket. Siggi treats fills as potential reaction zones, not automatic entries.",
  },
  {
    label: "Time And Events",
    detail: "Session handovers, market open/close, crypto weekend liquidity, and scheduled events decide whether a setup deserves execution, delay, or reduced conviction.",
  },
];

export const candlePatternGuide = [
  {
    label: "Engulfing Candle",
    meaning: "A stronger candle fully overwhelms the prior body; useful only when it appears at support, resistance, VWAP, Fibonacci, or a neckline.",
  },
  {
    label: "Rejection Wick",
    meaning: "Price probes a level and snaps back. Siggi treats this as evidence that liquidity was swept and defended.",
  },
  {
    label: "Doji / Compression",
    meaning: "Indecision. It is not a signal by itself; Siggi waits for the next candle or range break to confirm direction.",
  },
  {
    label: "Displacement Candle",
    meaning: "A large directional candle often marks urgency. The follow-up question is whether price continues, retests, or fills an inefficiency.",
  },
  {
    label: "Exhaustion Candle",
    meaning: "A long candle late in a move can be dangerous to chase unless it breaks and holds beyond structure with volume or momentum confirmation.",
  },
];

export const trendPatternGuide = [
  {
    label: "M Pattern / Double Top",
    meaning: "Two failed pushes into resistance. Siggi waits for neckline loss before treating it as confirmed bearish reversal evidence.",
  },
  {
    label: "W Pattern / Double Bottom",
    meaning: "Two defended pushes into support. Siggi waits for neckline reclaim before treating it as confirmed bullish reversal evidence.",
  },
  {
    label: "Flag / Pullback",
    meaning: "A controlled pause inside a trend. Best used when pullback candles are smaller than the impulse candles.",
  },
  {
    label: "Range Compression",
    meaning: "Tighter highs and lows. Siggi prepares for expansion but waits for direction instead of guessing.",
  },
  {
    label: "Break And Retest",
    meaning: "Old resistance becomes support or old support becomes resistance. This is one of the cleaner ways to reduce false breakouts.",
  },
];

export const strategyProfiles: StrategyProfile[] = [
  {
    id: "crypto-breakout-retest",
    name: "Crypto Breakout Retest",
    thesis:
      "Trade crypto strength only after price breaks a short-term level, then proves that old resistance can hold as support on the retest.",
    supportedAssets: ["Crypto"],
    supportedTimeframes: ["15M", "1H", "4H"],
    bestRegimes: ["Risk-On", "Balanced"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 3, maximum: 18 },
    rules: [
      "Require a clean break of active resistance before looking for the retest.",
      "Prefer entries where momentum stays constructive on the retest rather than fading immediately.",
      "If the retest fails quickly, invalidate instead of giving the trade extra room.",
    ],
  },
  {
    id: "crypto-momentum-pullback",
    name: "Crypto Momentum Pullback",
    thesis:
      "Use crypto volatility in Siggi's favor by buying controlled pullbacks inside an intact trend instead of chasing vertical candles.",
    supportedAssets: ["Crypto"],
    supportedTimeframes: ["15M", "1H", "4H"],
    bestRegimes: ["Balanced", "Risk-On"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 2, maximum: 12 },
    rules: [
      "Trend must still be constructive on the trigger and structure timeframes.",
      "The pullback should land near support, demand, or a reclaimed prior breakout shelf.",
      "Avoid entries when momentum is collapsing instead of simply cooling.",
    ],
  },
  {
    id: "forex-session-breakout",
    name: "Forex Session Breakout",
    thesis:
      "Focus on the cleanest breakouts around the main session handover windows, when FX liquidity and directional follow-through are most likely to matter.",
    supportedAssets: ["Forex"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Risk-On", "Risk-Off"],
    worstRegimes: ["Balanced"],
    typicalHoldHours: { minimum: 2, maximum: 10 },
    rules: [
      "Break the active session range with enough trend confirmation to avoid dead breaks.",
      "Treat upcoming macro releases as timing filters, not background noise.",
      "If price cannot hold beyond the session range, wait for a re-test or stand down.",
    ],
  },
  {
    id: "forex-range-reversion",
    name: "Forex Range Reversion",
    thesis:
      "When FX is balanced and liquidity is steady, lean on mean reversion around support, resistance, and session extremes instead of forcing trend trades.",
    supportedAssets: ["Forex"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Balanced"],
    worstRegimes: ["Risk-On", "Risk-Off"],
    typicalHoldHours: { minimum: 1, maximum: 8 },
    rules: [
      "Only fade extremes when the broader trend stack is mixed rather than strongly one-sided.",
      "Use nearby support and resistance instead of wide invalidation levels.",
      "Stand aside when macro event risk is close enough to break the range cleanly.",
    ],
  },
  {
    id: "index-opening-range-breakout",
    name: "Index Opening Range Breakout",
    thesis:
      "Treat index momentum seriously when price resolves the opening range cleanly and broad risk appetite supports a trend-day style move.",
    supportedAssets: ["Index"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Risk-On", "Risk-Off"],
    worstRegimes: ["Balanced"],
    typicalHoldHours: { minimum: 1, maximum: 8 },
    rules: [
      "Only trust the break when structure and momentum agree around the opening range edge.",
      "Use the broken range as the first decision point for re-tests and invalidation.",
      "If price falls back into the range immediately, treat it as failed and move on.",
    ],
  },
  {
    id: "index-vwap-pullback",
    name: "Index VWAP Pullback",
    thesis:
      "When indices are trending but not exploding, prefer patient pullbacks toward VWAP and nearby support rather than chasing the first leg.",
    supportedAssets: ["Index"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Balanced", "Risk-On"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 2, maximum: 10 },
    rules: [
      "Require the broader intraday trend to still be constructive above VWAP for longs.",
      "The best entries come from controlled pullbacks, not late extension.",
      "If VWAP fails decisively, the continuation read is no longer valid.",
    ],
  },
  {
    id: "equity-vwap-trend",
    name: "Equity VWAP Trend Continuation",
    thesis:
      "Use VWAP and short-term structure to stay with clean single-name trend continuation instead of guessing tops and bottoms intraday.",
    supportedAssets: ["Equity"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Risk-On", "Balanced"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 2, maximum: 12 },
    rules: [
      "Bias stays with the trade while price and momentum keep respecting VWAP and fast structure.",
      "Pullbacks are preferred over direct market chasing.",
      "If price loses VWAP and cannot reclaim it quickly, reduce confidence fast.",
    ],
  },
  {
    id: "equity-breakout-retest",
    name: "Equity Breakout Retest",
    thesis:
      "For faster single-name stocks, Siggi prefers breakouts that re-test cleanly so the entry can be defined around structure rather than pure momentum.",
    supportedAssets: ["Equity"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Risk-On"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 1, maximum: 8 },
    rules: [
      "Use the first clean re-test after the break rather than buying the first spike.",
      "Look for confirmation from momentum and trend instead of price alone.",
      "If the breakout shelf fails, the trade thesis is wrong quickly.",
    ],
  },
  {
    id: "etf-vwap-trend",
    name: "ETF VWAP Trend Continuation",
    thesis:
      "Sector and index ETFs often reward steadier trend-follow execution, so Siggi leans on VWAP continuation rather than hyper-aggressive momentum chasing.",
    supportedAssets: ["ETF"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Risk-On", "Balanced"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 2, maximum: 12 },
    rules: [
      "Trend still needs to hold above VWAP and nearby support for longs.",
      "The cleanest entries come from pullback continuation, not flat overextension.",
      "Rotation is acceptable, but only if the broader market is not clearly hostile.",
    ],
  },
  {
    id: "etf-range-rotation",
    name: "ETF Range Rotation",
    thesis:
      "When sector ETFs are orderly and broad tape is mixed, range rotation around clear support and resistance can outperform breakout chasing.",
    supportedAssets: ["ETF"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Balanced"],
    worstRegimes: ["Risk-On", "Risk-Off"],
    typicalHoldHours: { minimum: 2, maximum: 10 },
    rules: [
      "Only fade range edges when the trend stack is mixed enough to support rotation.",
      "Use compact invalidation beyond the range edge, not wide percentage stops.",
      "If the range breaks with confirmation, stop fading it and switch to continuation logic.",
    ],
  },
  {
    id: "commodity-pivot-breakout",
    name: "Commodity Pivot Breakout",
    thesis:
      "Commodity intraday moves can accelerate once pivot and prior-session levels give way, so Siggi treats clean structure breaks as the main trigger.",
    supportedAssets: ["Commodity"],
    supportedTimeframes: ["15M", "1H", "4H"],
    bestRegimes: ["Risk-On", "Risk-Off"],
    worstRegimes: ["Balanced"],
    typicalHoldHours: { minimum: 2, maximum: 16 },
    rules: [
      "Use prior pivot and structure levels as the first breakout map.",
      "Commodity headlines can distort timing, so event discipline matters more here.",
      "Breakouts without follow-through should be treated skeptically.",
    ],
  },
  {
    id: "commodity-trend-pullback",
    name: "Commodity Trend Pullback",
    thesis:
      "When commodities are moving cleanly but not explosively, pullback continuation usually offers better risk control than straight breakout chasing.",
    supportedAssets: ["Commodity"],
    supportedTimeframes: ["1H", "4H"],
    bestRegimes: ["Balanced", "Risk-On"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 3, maximum: 18 },
    rules: [
      "Trend still needs to be intact on the structure timeframe.",
      "Favor support or demand reactions over open-air entries.",
      "Invalidate quickly when the pullback becomes a full structure break.",
    ],
  },
  {
    id: "fibonacci-pullback-confluence",
    name: "Fibonacci Pullback Confluence",
    thesis:
      "Use Fibonacci retracement as a location tool only when it overlaps with structure, VWAP, demand/supply, or candle confirmation.",
    supportedAssets: ["Crypto", "ETF", "Equity", "Forex", "Commodity", "Index"],
    supportedTimeframes: ["15M", "1H", "4H"],
    bestRegimes: ["Balanced", "Risk-On"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 2, maximum: 18 },
    rules: [
      "Anchor Fibonacci to the most recent clean swing rather than forcing it onto noisy chop.",
      "Prioritise 38.2%, 50%, and 61.8% zones only when they overlap with support, demand, VWAP, or a prior breakout shelf.",
      "Require a confirming candle before entry; Fibonacci alone is only a map, not permission.",
    ],
    visualModel: {
      pattern: "Impulse -> controlled pullback into 38.2/50/61.8 -> reaction candle.",
      entry: "Inside the retracement cluster after rejection or reclaim.",
      invalidation: "Beyond the swing low/high that defined the Fibonacci leg.",
    },
    confluenceChecks: [
      "Fib cluster overlaps support/resistance",
      "Pullback is orderly, not structural failure",
      "Confirmation candle prints before entry",
      "Upcoming event risk is not inside the trigger window",
    ],
  },
  {
    id: "mw-reversal-break",
    name: "M/W Reversal Break",
    thesis:
      "Treat double tops and double bottoms as reversal candidates only after the neckline breaks and the failed level is clearly defended.",
    supportedAssets: ["Crypto", "ETF", "Equity", "Forex", "Commodity", "Index"],
    supportedTimeframes: ["15M", "1H", "4H"],
    bestRegimes: ["Balanced", "Risk-Off"],
    worstRegimes: ["Risk-On"],
    typicalHoldHours: { minimum: 1, maximum: 12 },
    rules: [
      "A W only matters when two lows defend similar support and price reclaims the neckline.",
      "An M only matters when two highs reject similar resistance and price loses the neckline.",
      "False breakouts are common, so Siggi waits for neckline confirmation or a retest before leaning in.",
    ],
    visualModel: {
      pattern: "M = resistance failure, W = support defence, neckline = confirmation trigger.",
      entry: "On neckline break/retest, not on the second top or bottom alone.",
      invalidation: "Beyond the second peak for M shorts or second trough for W longs.",
    },
    confluenceChecks: [
      "Two clean touches at a comparable level",
      "Neckline break or reclaim confirms the pattern",
      "Momentum agrees with the reversal direction",
      "Market session has enough liquidity for follow-through",
    ],
  },
  {
    id: "inefficiency-fill-reversal",
    name: "Inefficiency Fill Reversal",
    thesis:
      "Use inefficient displacement candles as reaction zones when price returns to repair imbalance, but only with structure and candle confirmation.",
    supportedAssets: ["Crypto", "ETF", "Equity", "Forex", "Commodity", "Index"],
    supportedTimeframes: ["15M", "1H", "4H"],
    bestRegimes: ["Balanced", "Risk-On"],
    worstRegimes: ["Risk-Off"],
    typicalHoldHours: { minimum: 1, maximum: 10 },
    rules: [
      "Identify the three-candle imbalance created by a strong displacement candle.",
      "Do not assume every gap fills; wait for price to revisit the pocket and react.",
      "Avoid trading imbalance against the higher-timeframe trend unless the reversal pattern is confirmed.",
    ],
    visualModel: {
      pattern: "Candle 1 -> displacement candle -> Candle 3 leaves a pocket with little overlap.",
      entry: "On fill reaction, rejection, or reclaim from the imbalance zone.",
      invalidation: "Beyond the far side of the imbalance or the displacement origin.",
    },
    confluenceChecks: [
      "Displacement candle is meaningfully larger than recent candles",
      "Imbalance overlaps support, demand, supply, or Fibonacci",
      "Fill reaction candle confirms acceptance/rejection",
      "No major event is about to invalidate the pocket",
    ],
  },
  {
    id: "event-volatility-breakout",
    name: "Event Volatility Breakout",
    thesis:
      "Trade scheduled-event volatility only after the first reaction resolves, using market time and liquidity to avoid guessing the news candle.",
    supportedAssets: ["Forex", "Index", "Commodity", "ETF", "Equity", "Crypto"],
    supportedTimeframes: ["15M", "1H"],
    bestRegimes: ["Risk-On", "Risk-Off"],
    worstRegimes: ["Balanced"],
    typicalHoldHours: { minimum: 1, maximum: 8 },
    rules: [
      "Do not enter blindly into the event candle; let spread, liquidity, and first direction settle.",
      "Use the post-event range high/low as the decision map.",
      "If price whipsaws both sides of the range, downgrade the setup until structure repairs.",
    ],
    visualModel: {
      pattern: "Event range forms -> one side breaks and holds -> retest offers the cleaner entry.",
      entry: "After the post-event range break/retest, not before the release.",
      invalidation: "Back inside the event range or beyond the failed retest.",
    },
    confluenceChecks: [
      "Known event or market open/close is driving volatility",
      "Initial reaction has resolved into a tradable range",
      "Liquidity is high enough for execution",
      "Stop and target account for wider ATR",
    ],
  },
];

export function getStrategyProfileByName(name: string) {
  return strategyProfiles.find((profile) => profile.name === name) ?? null;
}

export function selectStrategyProfile(input: {
  assetClass: InstrumentAssetClass;
  liquidity: InstrumentLiquidity;
  regime: MarketRegime;
  score: number;
  stance: InstrumentStance;
  tradeability: InstrumentTradeability;
  volatility: InstrumentVolatility;
}) {
  if (input.score >= 90 && input.volatility === "Fast") {
    return getStrategyProfileByName("Event Volatility Breakout")!;
  }

  if (input.regime === "Balanced" && input.volatility === "Contained" && input.score >= 78) {
    return getStrategyProfileByName("Fibonacci Pullback Confluence")!;
  }

  if (input.stance === "Short" && input.regime !== "Risk-On" && input.score >= 82) {
    return getStrategyProfileByName("M/W Reversal Break")!;
  }

  if (input.volatility === "Fast" && input.score < 84) {
    return getStrategyProfileByName("Inefficiency Fill Reversal")!;
  }

  if (input.assetClass === "Crypto") {
    return input.regime === "Risk-On" || input.volatility === "Fast"
      ? getStrategyProfileByName("Crypto Breakout Retest")!
      : getStrategyProfileByName("Crypto Momentum Pullback")!;
  }

  if (input.assetClass === "Forex") {
    return input.regime === "Balanced" && input.volatility === "Contained"
      ? getStrategyProfileByName("Forex Range Reversion")!
      : getStrategyProfileByName("Forex Session Breakout")!;
  }

  if (input.assetClass === "Index") {
    return input.regime === "Balanced" && input.score < 84
      ? getStrategyProfileByName("Index VWAP Pullback")!
      : getStrategyProfileByName("Index Opening Range Breakout")!;
  }

  if (input.assetClass === "Equity") {
    return input.volatility === "Fast" || input.score >= 86 || input.tradeability === "TRADEABLE"
      ? getStrategyProfileByName("Equity Breakout Retest")!
      : getStrategyProfileByName("Equity VWAP Trend Continuation")!;
  }

  if (input.assetClass === "ETF") {
    return input.regime === "Balanced" && input.volatility === "Contained"
      ? getStrategyProfileByName("ETF Range Rotation")!
      : getStrategyProfileByName("ETF VWAP Trend Continuation")!;
  }

  if (input.assetClass === "Commodity") {
    return input.volatility === "Elevated" || input.volatility === "Fast" || input.regime !== "Balanced"
      ? getStrategyProfileByName("Commodity Pivot Breakout")!
      : getStrategyProfileByName("Commodity Trend Pullback")!;
  }

  return input.regime === "Balanced" || input.stance === "Short"
    ? getStrategyProfileByName("Index VWAP Pullback")!
    : getStrategyProfileByName("Index Opening Range Breakout")!;
}

export function getStrategyTriggerTimeframe(profile: StrategyProfile, assetClass: InstrumentAssetClass) {
  if (assetClass === "Forex" || assetClass === "Index") {
    return profile.supportedTimeframes.includes("15M") ? "15M" : profile.supportedTimeframes[0];
  }

  if (assetClass === "Crypto" || assetClass === "Commodity") {
    return profile.supportedTimeframes.includes("1H") ? "1H" : profile.supportedTimeframes[0];
  }

  return profile.supportedTimeframes.includes("15M") ? "15M" : "1H";
}
