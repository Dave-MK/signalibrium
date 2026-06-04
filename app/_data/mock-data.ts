export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export type MarketRegime = "Risk-On" | "Balanced" | "Risk-Off";
export type SetupStatus = "TRADEABLE" | "WATCH" | "BLOCKED";

export type Asset = {
  symbol: string;
  name: string;
  assetClass: "Crypto" | "ETF" | "Equity" | "Forex" | "Commodity" | "Index";
  price: number;
  change24h: number;
  regime: MarketRegime;
  activeStrategy: string;
  score: number;
  tradeable: boolean;
  liquidity: "High" | "Moderate" | "Thin";
  volatility: "Contained" | "Elevated" | "Fast";
  atr: number;
  forecast: string;
  aiBias: string;
  sparkline: number[];
};

export type Setup = {
  id: string;
  symbol: string;
  strategy: string;
  timeframe: string;
  score: number;
  riskScore: number;
  regime: MarketRegime;
  entryZone: string;
  stopLoss: string;
  takeProfit: string;
  riskReward: number;
  liquidityStatus: "High" | "Moderate" | "Thin";
  tradeability: SetupStatus;
  assetClass: Asset["assetClass"];
};

export type StrategyCard = {
  id: string;
  name: string;
  thesis: string;
  supportedAssets: string[];
  supportedTimeframes: string[];
  bestRegimes: MarketRegime[];
  worstRegimes: MarketRegime[];
  backtest: {
    profitFactor: number;
    maxDrawdown: number;
    tradeCount: number;
    winRate: number;
  };
  rules: string[];
};

export type BacktestSnapshot = {
  id: string;
  asset: string;
  strategy: string;
  totalReturn: number;
  annualisedReturn: number;
  winRate: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpe: number;
  warnings: string[];
  equityCurve: number[];
  drawdownCurve: number[];
};

export type TradeTicket = {
  id: string;
  symbol: string;
  strategy: string;
  side: "Long" | "Short";
  orderType: "Limit" | "Market" | "Stop Entry";
  executionMode: "Paper" | "IBKR Demo" | "IBKR Live" | "IG Demo" | "IG Live";
  timeInForce: "DAY" | "GTC" | "IOC";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  estimatedValue: number;
  plannedLoss: number;
  potentialGain: number;
  riskReward: number;
  status:
    | "Draft"
    | "Ready"
    | "Submitted"
    | "Working"
    | "Filled"
    | "Partially Closed"
    | "Closed"
    | "Cancelled"
    | "Rejected";
  brokerStatus:
    | "Not Sent"
    | "Pending"
    | "Working"
    | "Filled"
    | "Partially Closed"
    | "Closed"
    | "Cancelled"
    | "Rejected";
  brokerReference: string | null;
  brokerDealId: string | null;
  submittedAt: string | null;
  filledAt: string | null;
  closedAt: string | null;
  executedEntry: number | null;
  executedQuantity: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  rationale: string;
  gateResults: {
    label: string;
    status: "PASS" | "WARN" | "FAIL";
    detail: string;
  }[];
};

export type JournalEntry = {
  id: string;
  date: string;
  asset: string;
  status:
    | "Planned"
    | "Simulated"
    | "Taken"
    | "Skipped"
    | "Closed"
    | "Stopped Out"
    | "Target Hit";
  pnl: number;
  notes: string;
  emotionTags: string[];
  aiReview: string;
};

export const marketSnapshot = {
  state: "Measured cross-market risk-on rotation",
  description:
    "Crypto leadership remains strong, index trends are constructive, and macro-sensitive commodities are still selective. Signalibrium is prioritising high-liquidity cross-market opportunities that can move cleanly over the next week.",
  breadthScore: 62,
  tradeableSetups: 13,
  blockedSetups: 3,
  watchlistMove: 5.4,
  simulatedEquity: 182450,
  openRisk: 2.1,
  lastRefresh: "31 May 2026 03:47 BST",
  journalReminder: "Review cross-market correlations before stacking new crypto and Nasdaq trend exposure.",
};

export const watchlist: Asset[] = [
  {
    symbol: "LINK",
    name: "Chainlink",
    assetClass: "Crypto",
    price: 18.42,
    change24h: 4.7,
    regime: "Risk-On",
    activeStrategy: "20-Day Breakout",
    score: 91,
    tradeable: true,
    liquidity: "High",
    volatility: "Contained",
    atr: 0.84,
    forecast: "Bullish continuation if 18.20 holds on pullbacks.",
    aiBias: "Institutional-quality structure with clean breakout follow-through.",
    sparkline: [20, 22, 21, 25, 27, 28, 31, 33, 35, 37, 39, 41],
  },
  {
    symbol: "ONDO",
    name: "Ondo",
    assetClass: "Crypto",
    price: 1.28,
    change24h: 2.1,
    regime: "Balanced",
    activeStrategy: "RSI Pullback",
    score: 84,
    tradeable: true,
    liquidity: "High",
    volatility: "Elevated",
    atr: 0.07,
    forecast: "Constructive retest as long as 1.21 remains protected.",
    aiBias: "Momentum cooled without invalidating the broader uptrend.",
    sparkline: [16, 18, 22, 19, 23, 21, 24, 28, 27, 29, 31, 34],
  },
  {
    symbol: "RENDER",
    name: "Render",
    assetClass: "Crypto",
    price: 10.86,
    change24h: 6.4,
    regime: "Risk-On",
    activeStrategy: "50/200 Trend",
    score: 94,
    tradeable: true,
    liquidity: "High",
    volatility: "Fast",
    atr: 0.63,
    forecast: "Leadership asset; break above 11.00 opens trend extension.",
    aiBias: "Trend strength is high, but size should respect elevated ATR.",
    sparkline: [18, 19, 21, 24, 26, 29, 33, 34, 36, 39, 41, 44],
  },
  {
    symbol: "AKT",
    name: "Akash Network",
    assetClass: "Crypto",
    price: 4.19,
    change24h: -0.8,
    regime: "Balanced",
    activeStrategy: "RSI Pullback",
    score: 72,
    tradeable: false,
    liquidity: "Moderate",
    volatility: "Elevated",
    atr: 0.29,
    forecast: "Needs cleaner reclaim before ticket creation.",
    aiBias: "Interesting structure, but not yet clean enough for protected sizing.",
    sparkline: [24, 26, 27, 25, 24, 23, 22, 23, 24, 23, 22, 21],
  },
  {
    symbol: "AINF",
    name: "AI Infrastructure Index",
    assetClass: "Equity",
    price: 42.38,
    change24h: 1.2,
    regime: "Balanced",
    activeStrategy: "50/200 Trend",
    score: 79,
    tradeable: true,
    liquidity: "Moderate",
    volatility: "Contained",
    atr: 1.78,
    forecast: "Slow-grind trend with lower urgency and cleaner execution.",
    aiBias: "Lower velocity, better fit for disciplined swing sizing.",
    sparkline: [18, 18, 19, 19, 20, 21, 22, 22, 23, 24, 25, 26],
  },
  {
    symbol: "NUKZ",
    name: "Nuclear Energy Index",
    assetClass: "Equity",
    price: 33.71,
    change24h: -1.1,
    regime: "Risk-Off",
    activeStrategy: "20-Day Breakout",
    score: 66,
    tradeable: false,
    liquidity: "Moderate",
    volatility: "Contained",
    atr: 1.12,
    forecast: "Capital is hesitating; wait for breadth improvement.",
    aiBias: "Watchlist candidate only until risk-on breadth returns.",
    sparkline: [28, 28, 27, 27, 26, 25, 25, 24, 24, 23, 22, 21],
  },
  {
    symbol: "URA",
    name: "Global X Uranium ETF",
    assetClass: "ETF",
    price: 37.94,
    change24h: 0.6,
    regime: "Balanced",
    activeStrategy: "20-Day Breakout",
    score: 76,
    tradeable: true,
    liquidity: "High",
    volatility: "Contained",
    atr: 1.22,
    forecast: "Compression setup with asymmetric upside if 38.40 clears.",
    aiBias: "Strong candidate if the macro tape stays orderly.",
    sparkline: [22, 22, 21, 22, 22, 23, 24, 24, 25, 26, 27, 28],
  },
  {
    symbol: "TKNX",
    name: "Tokenisation Leaders ETF",
    assetClass: "ETF",
    price: 28.14,
    change24h: 3.3,
    regime: "Risk-On",
    activeStrategy: "50/200 Trend",
    score: 88,
    tradeable: true,
    liquidity: "Moderate",
    volatility: "Contained",
    atr: 1.04,
    forecast: "Constructive trend continuation with moderate pullback risk.",
    aiBias: "Clean sector rotation candidate with less noise than single-name crypto.",
    sparkline: [17, 18, 18, 20, 22, 24, 23, 25, 27, 29, 31, 33],
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    assetClass: "Crypto",
    price: 108420,
    change24h: 2.6,
    regime: "Risk-On",
    activeStrategy: "50/200 Trend",
    score: 93,
    tradeable: true,
    liquidity: "High",
    volatility: "Elevated",
    atr: 3560,
    forecast: "Primary crypto trend remains constructive while weekly pullbacks keep holding demand.",
    aiBias: "The cleanest high-liquidity crypto benchmark when you want broad market confirmation.",
    sparkline: [22, 23, 24, 25, 27, 28, 30, 32, 33, 35, 37, 39],
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    assetClass: "Crypto",
    price: 5342,
    change24h: 3.1,
    regime: "Risk-On",
    activeStrategy: "20-Day Breakout",
    score: 90,
    tradeable: true,
    liquidity: "High",
    volatility: "Elevated",
    atr: 214,
    forecast: "Relative strength is improving and a clean reclaim opens trend continuation.",
    aiBias: "Stronger beta than BTC, but still liquid enough for protected swing execution.",
    sparkline: [20, 21, 22, 23, 24, 26, 27, 29, 31, 32, 34, 36],
  },
  {
    symbol: "SOL",
    name: "Solana",
    assetClass: "Crypto",
    price: 228.4,
    change24h: 4.8,
    regime: "Risk-On",
    activeStrategy: "RSI Pullback",
    score: 89,
    tradeable: true,
    liquidity: "High",
    volatility: "Fast",
    atr: 12.6,
    forecast: "Momentum remains strong, but the best entries should come from controlled resets instead of chasing extension.",
    aiBias: "Excellent relative strength, but the tape still demands disciplined pullback entries.",
    sparkline: [18, 19, 21, 22, 24, 27, 29, 31, 33, 36, 38, 41],
  },
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    assetClass: "Forex",
    price: 1.0864,
    change24h: 0.4,
    regime: "Balanced",
    activeStrategy: "RSI Pullback",
    score: 83,
    tradeable: true,
    liquidity: "High",
    volatility: "Contained",
    atr: 0.0062,
    forecast: "Compression under resistance keeps the pair interesting if buyers reclaim trend support.",
    aiBias: "Good candidate for measured FX swings when macro data is not due immediately.",
    sparkline: [21, 20, 19, 20, 21, 22, 22, 23, 24, 24, 25, 26],
  },
  {
    symbol: "GBPUSD",
    name: "British Pound / US Dollar",
    assetClass: "Forex",
    price: 1.2748,
    change24h: 0.2,
    regime: "Balanced",
    activeStrategy: "50/200 Trend",
    score: 80,
    tradeable: true,
    liquidity: "High",
    volatility: "Contained",
    atr: 0.0084,
    forecast: "Still trending upward, but conviction improves if pullbacks keep respecting higher lows.",
    aiBias: "Cleaner trend than many majors, though reward is smaller than the crypto leaders.",
    sparkline: [18, 18, 19, 19, 20, 21, 21, 22, 22, 23, 24, 25],
  },
  {
    symbol: "GOLD",
    name: "Spot Gold",
    assetClass: "Commodity",
    price: 2384.5,
    change24h: 0.9,
    regime: "Balanced",
    activeStrategy: "20-Day Breakout",
    score: 87,
    tradeable: true,
    liquidity: "High",
    volatility: "Contained",
    atr: 32.4,
    forecast: "Gold remains constructive if dip buyers keep defending the breakout shelf.",
    aiBias: "One of the cleaner macro expressions when the market wants defensiveness without full risk-off panic.",
    sparkline: [19, 20, 20, 21, 22, 22, 23, 24, 25, 25, 26, 27],
  },
  {
    symbol: "SILVER",
    name: "Spot Silver",
    assetClass: "Commodity",
    price: 31.84,
    change24h: 1.7,
    regime: "Risk-On",
    activeStrategy: "20-Day Breakout",
    score: 82,
    tradeable: true,
    liquidity: "High",
    volatility: "Elevated",
    atr: 0.96,
    forecast: "Silver has better upside torque than gold if the breakout shelf holds through volatility.",
    aiBias: "Attractive momentum expression, but it needs smaller sizing than gold because the tape is noisier.",
    sparkline: [18, 18, 19, 20, 21, 23, 24, 25, 27, 28, 30, 31],
  },
  {
    symbol: "BRENT",
    name: "Brent Crude",
    assetClass: "Commodity",
    price: 78.2,
    change24h: -0.6,
    regime: "Balanced",
    activeStrategy: "RSI Pullback",
    score: 74,
    tradeable: false,
    liquidity: "High",
    volatility: "Elevated",
    atr: 2.8,
    forecast: "Range structure is still noisy, so wait for a cleaner reclaim before treating it as tradeable.",
    aiBias: "Worth monitoring because macro headlines can accelerate it quickly once structure improves.",
    sparkline: [28, 27, 26, 25, 24, 24, 23, 24, 25, 25, 24, 23],
  },
  {
    symbol: "SPX",
    name: "S&P 500 Index",
    assetClass: "Index",
    price: 5340.18,
    change24h: 0.7,
    regime: "Risk-On",
    activeStrategy: "50/200 Trend",
    score: 85,
    tradeable: true,
    liquidity: "High",
    volatility: "Contained",
    atr: 76.4,
    forecast: "Trend remains intact and broad participation is improving on shallow pullbacks.",
    aiBias: "The clearest broad-risk barometer for deciding whether to press or reduce exposure elsewhere.",
    sparkline: [18, 19, 19, 20, 21, 22, 23, 24, 24, 25, 26, 27],
  },
  {
    symbol: "NDX",
    name: "Nasdaq 100 Index",
    assetClass: "Index",
    price: 19284.62,
    change24h: 1.1,
    regime: "Risk-On",
    activeStrategy: "50/200 Trend",
    score: 88,
    tradeable: true,
    liquidity: "High",
    volatility: "Contained",
    atr: 248.5,
    forecast: "Tech leadership is still carrying the index, but entries are better after controlled resets.",
    aiBias: "Useful when you want concentrated growth exposure without single-name event risk.",
    sparkline: [18, 19, 20, 21, 22, 23, 25, 26, 27, 29, 30, 32],
  },
  {
    symbol: "NVDA",
    name: "NVIDIA",
    assetClass: "Equity",
    price: 154.62,
    change24h: 2.9,
    regime: "Risk-On",
    activeStrategy: "20-Day Breakout",
    score: 92,
    tradeable: true,
    liquidity: "High",
    volatility: "Elevated",
    atr: 6.8,
    forecast: "Leadership remains intact and fresh highs keep the trend framework valid.",
    aiBias: "Still one of the strongest single-name momentum leaders, but position size should respect gap risk.",
    sparkline: [20, 21, 22, 24, 25, 27, 29, 31, 33, 34, 36, 38],
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    assetClass: "Equity",
    price: 512.48,
    change24h: 1.4,
    regime: "Risk-On",
    activeStrategy: "50/200 Trend",
    score: 86,
    tradeable: true,
    liquidity: "High",
    volatility: "Contained",
    atr: 9.4,
    forecast: "The trend remains orderly, making pullbacks more attractive than chasing momentum spikes.",
    aiBias: "Cleaner than most large-cap AI names when you want steady trend exposure instead of pure velocity.",
    sparkline: [18, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
  },
];

export const setups: Setup[] = [
  {
    id: "setup-render-breakout",
    symbol: "RENDER",
    strategy: "20-Day Breakout",
    timeframe: "4H",
    score: 94,
    riskScore: 34,
    regime: "Risk-On",
    entryZone: "$10.62 - $10.90",
    stopLoss: "$10.04",
    takeProfit: "$12.18",
    riskReward: 2.2,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Crypto",
  },
  {
    id: "setup-link-trend",
    symbol: "LINK",
    strategy: "50/200 Trend",
    timeframe: "1D",
    score: 91,
    riskScore: 29,
    regime: "Risk-On",
    entryZone: "$18.10 - $18.45",
    stopLoss: "$17.28",
    takeProfit: "$20.04",
    riskReward: 2.4,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Crypto",
  },
  {
    id: "setup-tknx-trend",
    symbol: "TKNX",
    strategy: "50/200 Trend",
    timeframe: "1D",
    score: 88,
    riskScore: 31,
    regime: "Risk-On",
    entryZone: "$27.80 - $28.20",
    stopLoss: "$26.62",
    takeProfit: "$30.92",
    riskReward: 2.3,
    liquidityStatus: "Moderate",
    tradeability: "TRADEABLE",
    assetClass: "ETF",
  },
  {
    id: "setup-ondo-pullback",
    symbol: "ONDO",
    strategy: "RSI Pullback",
    timeframe: "4H",
    score: 84,
    riskScore: 42,
    regime: "Balanced",
    entryZone: "$1.24 - $1.29",
    stopLoss: "$1.19",
    takeProfit: "$1.42",
    riskReward: 2.1,
    liquidityStatus: "High",
    tradeability: "WATCH",
    assetClass: "Crypto",
  },
  {
    id: "setup-ura-breakout",
    symbol: "URA",
    strategy: "20-Day Breakout",
    timeframe: "1D",
    score: 76,
    riskScore: 33,
    regime: "Balanced",
    entryZone: "$37.80 - $38.30",
    stopLoss: "$36.12",
    takeProfit: "$41.36",
    riskReward: 2.0,
    liquidityStatus: "High",
    tradeability: "WATCH",
    assetClass: "ETF",
  },
  {
    id: "setup-ainf-trend",
    symbol: "AINF",
    strategy: "50/200 Trend",
    timeframe: "1D",
    score: 79,
    riskScore: 26,
    regime: "Balanced",
    entryZone: "$41.80 - $42.40",
    stopLoss: "$40.10",
    takeProfit: "$45.90",
    riskReward: 2.4,
    liquidityStatus: "Moderate",
    tradeability: "TRADEABLE",
    assetClass: "Equity",
  },
  {
    id: "setup-akt-pullback",
    symbol: "AKT",
    strategy: "RSI Pullback",
    timeframe: "4H",
    score: 72,
    riskScore: 53,
    regime: "Balanced",
    entryZone: "$4.08 - $4.22",
    stopLoss: "$3.74",
    takeProfit: "$4.82",
    riskReward: 1.8,
    liquidityStatus: "Moderate",
    tradeability: "BLOCKED",
    assetClass: "Crypto",
  },
  {
    id: "setup-nukz-breakout",
    symbol: "NUKZ",
    strategy: "20-Day Breakout",
    timeframe: "1D",
    score: 66,
    riskScore: 48,
    regime: "Risk-Off",
    entryZone: "$33.40 - $33.90",
    stopLoss: "$31.98",
    takeProfit: "$36.20",
    riskReward: 1.7,
    liquidityStatus: "Moderate",
    tradeability: "BLOCKED",
    assetClass: "Equity",
  },
  {
    id: "setup-btc-trend",
    symbol: "BTC",
    strategy: "50/200 Trend",
    timeframe: "1D",
    score: 93,
    riskScore: 28,
    regime: "Risk-On",
    entryZone: "$106400 - $108800",
    stopLoss: "$102900",
    takeProfit: "$115800",
    riskReward: 2.2,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Crypto",
  },
  {
    id: "setup-eth-breakout",
    symbol: "ETH",
    strategy: "20-Day Breakout",
    timeframe: "1D",
    score: 90,
    riskScore: 33,
    regime: "Risk-On",
    entryZone: "$5280 - $5360",
    stopLoss: "$5120",
    takeProfit: "$5710",
    riskReward: 2.4,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Crypto",
  },
  {
    id: "setup-sol-pullback",
    symbol: "SOL",
    strategy: "RSI Pullback",
    timeframe: "4H",
    score: 89,
    riskScore: 39,
    regime: "Risk-On",
    entryZone: "$223.00 - $229.00",
    stopLoss: "$214.80",
    takeProfit: "$247.20",
    riskReward: 2.1,
    liquidityStatus: "High",
    tradeability: "WATCH",
    assetClass: "Crypto",
  },
  {
    id: "setup-eurusd-pullback",
    symbol: "EURUSD",
    strategy: "RSI Pullback",
    timeframe: "4H",
    score: 83,
    riskScore: 24,
    regime: "Balanced",
    entryZone: "1.0848 - 1.0874",
    stopLoss: "1.0809",
    takeProfit: "1.0948",
    riskReward: 2.0,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Forex",
  },
  {
    id: "setup-gbpusd-trend",
    symbol: "GBPUSD",
    strategy: "50/200 Trend",
    timeframe: "1D",
    score: 80,
    riskScore: 22,
    regime: "Balanced",
    entryZone: "1.2715 - 1.2765",
    stopLoss: "1.2664",
    takeProfit: "1.2878",
    riskReward: 2.1,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Forex",
  },
  {
    id: "setup-gold-breakout",
    symbol: "GOLD",
    strategy: "20-Day Breakout",
    timeframe: "1D",
    score: 87,
    riskScore: 27,
    regime: "Balanced",
    entryZone: "$2374 - $2391",
    stopLoss: "$2342",
    takeProfit: "$2458",
    riskReward: 2.2,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Commodity",
  },
  {
    id: "setup-silver-breakout",
    symbol: "SILVER",
    strategy: "20-Day Breakout",
    timeframe: "1D",
    score: 82,
    riskScore: 35,
    regime: "Risk-On",
    entryZone: "$31.40 - $31.95",
    stopLoss: "$30.62",
    takeProfit: "$33.48",
    riskReward: 2.1,
    liquidityStatus: "High",
    tradeability: "WATCH",
    assetClass: "Commodity",
  },
  {
    id: "setup-brent-pullback",
    symbol: "BRENT",
    strategy: "RSI Pullback",
    timeframe: "4H",
    score: 74,
    riskScore: 44,
    regime: "Balanced",
    entryZone: "$77.40 - $78.40",
    stopLoss: "$75.60",
    takeProfit: "$81.60",
    riskReward: 1.9,
    liquidityStatus: "High",
    tradeability: "BLOCKED",
    assetClass: "Commodity",
  },
  {
    id: "setup-spx-trend",
    symbol: "SPX",
    strategy: "50/200 Trend",
    timeframe: "1D",
    score: 85,
    riskScore: 21,
    regime: "Risk-On",
    entryZone: "$5302 - $5354",
    stopLoss: "$5238",
    takeProfit: "$5475",
    riskReward: 2.2,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Index",
  },
  {
    id: "setup-ndx-trend",
    symbol: "NDX",
    strategy: "50/200 Trend",
    timeframe: "1D",
    score: 88,
    riskScore: 24,
    regime: "Risk-On",
    entryZone: "$19120 - $19340",
    stopLoss: "$18810",
    takeProfit: "$19880",
    riskReward: 2.0,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Index",
  },
  {
    id: "setup-nvda-breakout",
    symbol: "NVDA",
    strategy: "20-Day Breakout",
    timeframe: "1D",
    score: 92,
    riskScore: 32,
    regime: "Risk-On",
    entryZone: "$151.80 - $155.10",
    stopLoss: "$146.20",
    takeProfit: "$166.40",
    riskReward: 2.1,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Equity",
  },
  {
    id: "setup-msft-trend",
    symbol: "MSFT",
    strategy: "50/200 Trend",
    timeframe: "1D",
    score: 86,
    riskScore: 23,
    regime: "Risk-On",
    entryZone: "$507.00 - $513.80",
    stopLoss: "$498.20",
    takeProfit: "$531.40",
    riskReward: 2.3,
    liquidityStatus: "High",
    tradeability: "TRADEABLE",
    assetClass: "Equity",
  },
];

export const strategies: StrategyCard[] = [
  {
    id: "trend-50-200",
    name: "50/200 Trend",
    thesis:
      "Stay aligned with broad directional structure and only act when the faster average confirms the dominant trend.",
    supportedAssets: ["Crypto", "ETF", "Equity", "Forex", "Commodity", "Index"],
    supportedTimeframes: ["4H", "1D"],
    bestRegimes: ["Risk-On", "Balanced"],
    worstRegimes: ["Risk-Off"],
    backtest: {
      profitFactor: 1.86,
      maxDrawdown: -11.4,
      tradeCount: 84,
      winRate: 52.1,
    },
    rules: [
      "50 SMA above 200 SMA for long bias.",
      "Enter only when momentum confirms after pullback or compression.",
      "Invalidate if price loses the higher-timeframe structure level.",
    ],
  },
  {
    id: "rsi-pullback",
    name: "RSI Pullback",
    thesis:
      "Exploit pullbacks inside healthy trends when price resets without losing the underlying market regime.",
    supportedAssets: ["Crypto", "ETF", "Forex", "Commodity"],
    supportedTimeframes: ["4H", "1D"],
    bestRegimes: ["Balanced", "Risk-On"],
    worstRegimes: ["Risk-Off"],
    backtest: {
      profitFactor: 1.64,
      maxDrawdown: -9.6,
      tradeCount: 102,
      winRate: 48.7,
    },
    rules: [
      "Require trend alignment before taking an RSI reset.",
      "Avoid entries when ATR is expanding sharply against the setup.",
      "Prefer pullbacks that reclaim prior support within two candles.",
    ],
  },
  {
    id: "breakout-20d",
    name: "20-Day Breakout",
    thesis:
      "Capture range expansion after sustained compression when liquidity is sufficient and the regime supports continuation.",
    supportedAssets: ["Crypto", "ETF", "Equity", "Commodity", "Index"],
    supportedTimeframes: ["1D"],
    bestRegimes: ["Risk-On"],
    worstRegimes: ["Risk-Off", "Balanced"],
    backtest: {
      profitFactor: 2.08,
      maxDrawdown: -13.2,
      tradeCount: 61,
      winRate: 44.9,
    },
    rules: [
      "Require clean breakout over a 20-day range high.",
      "Reject signals when liquidity is thin or reward compression is poor.",
      "Trail invalidation beneath the breakout shelf, not arbitrary percentages.",
    ],
  },
];

export const backtests: BacktestSnapshot[] = [
  {
    id: "bt-render-breakout",
    asset: "RENDER",
    strategy: "20-Day Breakout",
    totalReturn: 48.6,
    annualisedReturn: 32.4,
    winRate: 46.2,
    maxDrawdown: -12.1,
    profitFactor: 2.18,
    sharpe: 1.46,
    warnings: ["Expect clustered losses in rotational chop.", "Needs slippage checks when volatility spikes."],
    equityCurve: [100, 102, 105, 108, 107, 111, 116, 121, 125, 131, 139, 149],
    drawdownCurve: [0, -0.6, -0.3, -1.1, -2.4, -1.2, -3.2, -2.1, -1.7, -4.2, -2.6, -1.4],
  },
  {
    id: "bt-link-trend",
    asset: "LINK",
    strategy: "50/200 Trend",
    totalReturn: 36.8,
    annualisedReturn: 24.1,
    winRate: 54.8,
    maxDrawdown: -9.4,
    profitFactor: 1.92,
    sharpe: 1.31,
    warnings: ["Trend rules degrade when regime flips to defensive breadth."],
    equityCurve: [100, 101, 103, 104, 108, 111, 115, 118, 121, 127, 132, 137],
    drawdownCurve: [0, -0.3, -0.5, -1.2, -0.4, -1.4, -2.3, -1.7, -1.1, -2.2, -1.5, -1.0],
  },
  {
    id: "bt-ura-breakout",
    asset: "URA",
    strategy: "20-Day Breakout",
    totalReturn: 19.4,
    annualisedReturn: 11.8,
    winRate: 42.3,
    maxDrawdown: -7.8,
    profitFactor: 1.44,
    sharpe: 0.88,
    warnings: ["Lower throughput than crypto leadership names.", "Macro headlines can disrupt clean entries."],
    equityCurve: [100, 100, 101, 104, 102, 105, 106, 108, 109, 111, 117, 119],
    drawdownCurve: [0, -0.2, -0.1, -1.6, -3.1, -1.8, -2.2, -1.4, -0.8, -1.5, -0.6, -0.3],
  },
];

export const tradeTickets: TradeTicket[] = [
  {
    id: "ticket-render-001",
    symbol: "RENDER",
    strategy: "20-Day Breakout",
    side: "Long",
    orderType: "Limit",
    executionMode: "Paper",
    timeInForce: "DAY",
    entry: 10.84,
    stopLoss: 10.04,
    takeProfit: 12.18,
    quantity: 228,
    estimatedValue: 2471.52,
    plannedLoss: 182.4,
    potentialGain: 305.52,
    riskReward: 1.68,
    status: "Ready",
    brokerStatus: "Not Sent",
    brokerReference: null,
    brokerDealId: null,
    submittedAt: null,
    filledAt: null,
    closedAt: null,
    executedEntry: null,
    executedQuantity: null,
    realizedPnl: null,
    unrealizedPnl: null,
    rationale:
      "Momentum and ranking are strong, but the system is enforcing a measured size because ATR expansion is elevated.",
    gateResults: [
      {
        label: "Structure intact",
        status: "PASS",
        detail: "Breakout shelf remains defended on 4H closes.",
      },
      {
        label: "Liquidity",
        status: "PASS",
        detail: "Depth and spread remain acceptable for protected execution.",
      },
      {
        label: "Volatility",
        status: "WARN",
        detail: "ATR is rising, so size is capped below max theoretical allocation.",
      },
      {
        label: "Portfolio exposure",
        status: "PASS",
        detail: "Crypto exposure remains inside prototype limits.",
      },
    ],
  },
  {
    id: "ticket-link-002",
    symbol: "LINK",
    strategy: "50/200 Trend",
    side: "Long",
    orderType: "Market",
    executionMode: "Paper",
    timeInForce: "IOC",
    entry: 18.24,
    stopLoss: 17.28,
    takeProfit: 20.04,
    quantity: 190,
    estimatedValue: 3465.6,
    plannedLoss: 182.4,
    potentialGain: 342,
    riskReward: 1.88,
    status: "Filled",
    brokerStatus: "Filled",
    brokerReference: "paper-link-002",
    brokerDealId: null,
    submittedAt: "2026-05-31T08:10:00.000Z",
    filledAt: "2026-05-31T08:10:02.000Z",
    closedAt: null,
    executedEntry: 18.27,
    executedQuantity: 190,
    realizedPnl: null,
    unrealizedPnl: 104.5,
    rationale:
      "Trend quality is high and market regime confirms continuation, making this a cleaner protected ticket than most pullback signals.",
    gateResults: [
      {
        label: "Structure intact",
        status: "PASS",
        detail: "Daily trend remains above both moving averages.",
      },
      {
        label: "Liquidity",
        status: "PASS",
        detail: "Execution quality is suitable for one-click protected simulation.",
      },
      {
        label: "Volatility",
        status: "PASS",
        detail: "ATR is elevated but still within system tolerance.",
      },
      {
        label: "News risk",
        status: "WARN",
        detail: "Maintain alertness around sudden crypto beta rotation.",
      },
    ],
  },
];

export const journalEntries: JournalEntry[] = [
  {
    id: "journal-1",
    date: "2026-05-30",
    asset: "LINK",
    status: "Simulated",
    pnl: 2.4,
    notes:
      "Entry timing was disciplined. Size stayed within plan and no emotional override was needed.",
    emotionTags: ["Calm", "Patient"],
    aiReview:
      "Execution quality was strong. Future improvement: tighten the thesis statement before entry so the ticket rationale is easier to compare post-trade.",
  },
  {
    id: "journal-2",
    date: "2026-05-28",
    asset: "ONDO",
    status: "Stopped Out",
    pnl: -1.0,
    notes:
      "Chased a mid-range candle instead of waiting for the planned pullback zone. Stop was correct, entry was not.",
    emotionTags: ["Impatient", "Reactive"],
    aiReview:
      "Loss was acceptable because protection held, but the trade should be flagged in memory as a discipline error rather than a strategy failure.",
  },
  {
    id: "journal-3",
    date: "2026-05-24",
    asset: "URA",
    status: "Target Hit",
    pnl: 3.1,
    notes:
      "Breakout from compression behaved as expected. Position sizing felt conservative but appropriate.",
    emotionTags: ["Focused", "Confident"],
    aiReview:
      "This is a good reference trade for measured ETF execution in balanced regimes. Preserve the exact pre-trade checklist for reuse.",
  },
];

export const riskWarnings = [
  "AKT and NUKZ remain blocked until liquidity and regime improve.",
  "Crypto leadership is strong, but ATR expansion is forcing smaller protected sizing.",
  "Backtests on breakout systems degrade quickly when breadth slips under 55.",
];

export const journalReminders = [
  "Reclassify ONDO loss as execution error, not model weakness.",
  "Tag RENDER if breakout confirms before London open.",
  "Review stopped-out trades before accepting new pullback setups.",
];

export function getAssetBySymbol(symbol: string) {
  return watchlist.find((asset) => asset.symbol === symbol.toUpperCase());
}

export function getSetupsForSymbol(symbol: string) {
  return setups.filter((setup) => setup.symbol === symbol.toUpperCase());
}

export function getTradeTicketById(ticketId: string) {
  return tradeTickets.find((ticket) => ticket.id === ticketId);
}
