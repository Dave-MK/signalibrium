import { buildCurrencyRates } from "@/app/_lib/currency";
import { buildBotOpportunityView } from "@/app/_lib/bot-engine";
import { getMarketSession, isApproachingMarketClose } from "@/app/_lib/market-hours";
import { DEFAULT_RISK_CONTROLS } from "./workspace-types";
import type {
  PersistedAssetRecord,
  PersistedPredictionHistoryRecord,
  PersistedRiskControls,
  PersistedSiggiAccount,
  PersistedSiggiActivity,
  PersistedSiggiTrade,
  PersistedWorkspaceData,
} from "./workspace-types";

/** Runtime risk context — merged from workspace `riskControls` + module defaults. */
type RiskCtx = PersistedRiskControls;

// Siggi operates with full capital — no artificial limits on concurrent trades.
// Risk discipline is preserved (2% per trade, 5% reserve) but the old penny-ante
// caps that prevented him from acting on good signals have been removed.
const maximumConcurrentTrades = 20;   // was 5 — Siggi can now run as many as he qualifies for

// Cross-asset correlation groups — instruments within a group tend to move together.
// Opening multiple highly-correlated positions concentrates portfolio risk without
// adding genuine diversification. Siggi caps each group at 2 open trades.
const CORRELATION_GROUPS: Record<string, string[]> = {
  "crypto-btc": ["BTC/USD", "BTCUSD", "BTC/USDT", "BTCUSDT", "XBTUSD"],
  "crypto-major": ["ETH/USD", "ETHUSD", "SOL/USD", "SOLUSD", "BNB/USD", "BNBUSD", "ETH/USDT", "SOL/USDT"],
  "us-big-tech": ["AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META"],
  "us-indices": ["SPX500", "US500", "SP500", "NASDAQ100", "NDX", "QQQ", "SPY", "NAS100", "US100"],
  "precious-metals": ["GOLD", "XAU/USD", "XAUUSD", "SILVER", "XAG/USD", "XAGUSD"],
  "energy": ["WTI", "USOIL", "BRENT", "UKOIL", "OIL", "CL=F"],
  "gbp-pairs": ["GBP/USD", "GBPUSD", "GBP/EUR", "GBPEUR", "GBP/JPY", "GBPJPY"],
  "eur-pairs": ["EUR/USD", "EURUSD", "EUR/JPY", "EURJPY", "EUR/GBP", "EURGBP"],
};
const maxTradesPerCorrelationGroup = 2;
const maxRiskPerTrade = 0.02;          // 2% per trade — unchanged (this is sensible risk management)
const minCashReserveRatio = 0.05;      // was 0.20 — only 5% buffer needed; 95% can be deployed
const maxPortfolioHeatRatio = 0.40;    // was 0.06 — up to 40% of equity at open risk at once
const maxTradesPerAssetClass = 6;      // was 2 — more diversity per asset class allowed
const bustThresholdGbp = 50;           // scale with £10k starting balance (was £1 for £50 account)

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export function convertGbpToUsd(valueGbp: number, usdToGbpRate: number) {
  if (!Number.isFinite(usdToGbpRate) || usdToGbpRate <= 0) {
    return valueGbp;
  }

  return valueGbp / usdToGbpRate;
}

export function computeUnrealizedPnlUsd(trade: PersistedSiggiTrade, currentPriceUsd: number) {
  return trade.side === "SELL"
    ? (trade.entryPrice - currentPriceUsd) * trade.quantity
    : (currentPriceUsd - trade.entryPrice) * trade.quantity;
}

function appendActivity(
  account: PersistedSiggiAccount,
  activity: PersistedSiggiActivity,
) {
  return {
    ...account,
    activityLog: [activity, ...account.activityLog].slice(0, 180),
  };
}

function buildActivity(input: {
  at: string;
  detail: string;
  symbol: string | null;
  type: PersistedSiggiActivity["type"];
}) {
  return {
    id: `siggi-activity-${input.type.toLowerCase().replaceAll(" ", "-")}-${input.symbol ?? "system"}-${Date.parse(input.at)}`,
    at: input.at,
    type: input.type,
    symbol: input.symbol,
    detail: input.detail,
  } satisfies PersistedSiggiActivity;
}

/**
 * Classify a closed trade's result purely from its realised P&L.
 * "Hit Target"  = closed in profit  (P&L > 0) — any method: TP, trailing stop, manual close
 * "Stopped"     = closed at a loss  (P&L < 0)
 * "Breakeven"   = closed at entry   (P&L = 0, within a £0.01 rounding tolerance)
 */
export function pnlToTradeStatus(
  realizedPnlGbp: number,
): "Hit Target" | "Stopped" | "Breakeven" {
  if (realizedPnlGbp > 0.01)  return "Hit Target";
  if (realizedPnlGbp < -0.01) return "Stopped";
  return "Breakeven";
}

/**
 * Counts how many of the most-recent closed trades ended as a loss
 * (Stopped), stopping as soon as a win (Hit Target) or Breakeven is hit.
 * closedTrades is newest-first so this naturally counts the current streak.
 */
export function computeConsecutiveLosses(account: PersistedSiggiAccount): number {
  let count = 0;
  for (const trade of account.closedTrades) {
    if (trade.status === "Stopped") {
      count++;
    } else if (trade.status === "Hit Target" || trade.status === "Breakeven") {
      break;
    }
  }
  return count;
}

/**
 * Generates a trader-voice narrative for the trade card on Siggi's page.
 * Sounds like a real person describing their thinking, not a log entry.
 */
function buildTradeNarrative(
  record: PersistedPredictionHistoryRecord,
  view: ReturnType<typeof buildBotOpportunityView>,
  rr: number,
  effectiveMaxRisk: number,
): string {
  // Deterministic word choice so the same trade always reads the same
  const seed = record.id.charCodeAt(record.id.length - 1) % 4;
  const openPhrase =
    record.actionAtCall === "SELL"
      ? (["Fading", "Shorting", "Taking the short on", "Selling"][seed])
      : (["Stepping into", "Going long on", "Buying", "Entering long on"][seed]);

  const convictionLine =
    view.confidence >= 88
      ? "High conviction here."
      : view.confidence >= 78
        ? "Good edge, worth the risk."
        : "Setup passes the bar — taking it.";

  const patternNote = record.patternSnapshotAtCall
    ? ` ${record.patternSnapshotAtCall}.`
    : "";

  const eventNote =
    record.eventContextAtCall && view.eventTone !== "Clear"
      ? ` Event lean: ${record.eventContextAtCall}.`
      : "";

  const priceDP = record.stopPriceAtCall < 10 ? 4 : record.stopPriceAtCall < 1000 ? 2 : 0;
  const levelsLine = ` Stop at ${record.stopPriceAtCall.toFixed(priceDP)}, target ${record.targetPriceAtCall.toFixed(priceDP)} — ${rr.toFixed(1)}R. Risking ${(effectiveMaxRisk * 100).toFixed(1)}% of equity.`;

  return `${openPhrase} ${record.symbol} ${record.actionAtCall === "SELL" ? "short" : "long"} on the ${record.timeframe}. ${convictionLine}${patternNote}${eventNote}${levelsLine}`.trim();
}

export function computeTotalEquityGbp(account: PersistedSiggiAccount) {
  return roundMoney(
    account.cashBalanceGbp +
      account.openTrades.reduce(
        (total, trade) => total + trade.stakeGbp + (trade.unrealizedPnlGbp ?? 0),
        0,
      ),
  );
}

export function computeTotalOpenRiskGbp(account: PersistedSiggiAccount, usdToGbpRate: number) {
  return account.openTrades.reduce((total, trade) => {
    const riskPerUnit = Math.abs(trade.entryPrice - trade.stopPrice);
    return total + riskPerUnit * trade.quantity * usdToGbpRate;
  }, 0);
}

function recordEquitySnapshot(account: PersistedSiggiAccount, syncedAt: string) {
  const snapshot = {
    at: syncedAt,
    cashBalanceGbp: roundMoney(account.cashBalanceGbp),
    equityGbp: computeTotalEquityGbp(account),
    openTrades: account.openTrades.length,
  };

  return {
    ...account,
    equityCurve: [snapshot, ...account.equityCurve].slice(0, 160),
    updatedAt: syncedAt,
  };
}

function collapseDuplicateOpenTrades(account: PersistedSiggiAccount, syncedAt: string) {
  const seenSymbols = new Set<string>();
  const keptTrades: PersistedSiggiTrade[] = [];
  const removedTrades: PersistedSiggiTrade[] = [];

  for (const trade of account.openTrades) {
    if (seenSymbols.has(trade.symbol)) {
      removedTrades.push(trade);
      continue;
    }

    seenSymbols.add(trade.symbol);
    keptTrades.push(trade);
  }

  if (removedTrades.length === 0) {
    return account;
  }

  const restoredCash = removedTrades.reduce(
    (total, trade) => total + trade.stakeGbp + (trade.unrealizedPnlGbp ?? 0),
    0,
  );
  const nextAccount = {
    ...account,
    cashBalanceGbp: roundMoney(account.cashBalanceGbp + restoredCash),
    openTrades: keptTrades,
    updatedAt: syncedAt,
  };

  return appendActivity(
    nextAccount,
    buildActivity({
      at: syncedAt,
      detail: `Siggi cleaned up ${removedTrades.length} duplicate open trade slot${removedTrades.length === 1 ? "" : "s"} so only one live position remains per instrument.`,
      symbol: removedTrades[0]?.symbol ?? null,
      type: "Skipped",
    }),
  );
}

/**
 * Returns the correlation group key for a given symbol, or null if none.
 * Used to prevent Siggi from doubling up on highly-correlated positions.
 */
export function getCorrelationGroup(symbol: string): string | null {
  const upper = symbol.toUpperCase().replace(/\s/g, "");
  for (const [group, members] of Object.entries(CORRELATION_GROUPS)) {
    if (members.some((m) => m.toUpperCase().replace(/\s/g, "") === upper)) {
      return group;
    }
  }
  return null;
}

const minConfidence = 68;
const minReadiness = 65;
const minRiskReward = 1.5;

const signalMaxAgeHours: Record<string, number> = {
  Day: 8,    // Day signals valid for the full trading session; re-analysis refreshes quality
  Week: 48,
  Month: 96,
};

export function computeRiskReward(record: PersistedPredictionHistoryRecord) {
  const entryPrice =
    record.actionAtCall === "SELL" ? record.entryHighAtCall : record.entryLowAtCall;
  const riskDistance = Math.abs(entryPrice - record.stopPriceAtCall);
  const rewardDistance = Math.abs(record.targetPriceAtCall - entryPrice);

  if (riskDistance <= 0) return 0;
  return rewardDistance / riskDistance;
}

export function isSignalFresh(record: PersistedPredictionHistoryRecord, nowMs: number) {
  const maxAgeHours = signalMaxAgeHours[record.horizon] ?? 24;
  const calledAtMs = Date.parse(record.calledAt);
  return Number.isFinite(calledAtMs) && nowMs - calledAtMs <= maxAgeHours * 60 * 60 * 1000;
}

// Analysis must be fresh — Siggi won't enter a trade on stale chart data.
// Max 1h for Day setups, 4h for Week setups, 12h for Monthly setups.
// Day analysis refreshes automatically every 2 h during full syncs, so 3 h here
// gives a comfortable buffer.  Week/Month setups change slowly; 12 h / 24 h is fine.
const maxAnalysisAgeHours: Record<string, number> = { Day: 3, Week: 12, Month: 24 };

// Maximum time a trade can stay on its initial stop before Siggi calls time — 3× the signal window
const maxTradeHoldHours: Record<string, number> = { Day: 36, Week: 96, Month: 192 };

function shouldOpenTrade(input: {
  account: PersistedSiggiAccount;
  analysisAgeHours: number;
  asset: PersistedAssetRecord | null;
  assetRegime: string | null;
  nowMs: number;
  record: PersistedPredictionHistoryRecord;
  usdToGbpRate: number;
  view: ReturnType<typeof buildBotOpportunityView>;
  riskCtx?: RiskCtx;
}) {
  const riskCtx = input.riskCtx ?? DEFAULT_RISK_CONTROLS;
  if (input.view.decision.label !== "ENTER NOW" || input.view.opportunityAction === "WAIT") {
    return {
      allow: false,
      reason:
        input.view.timingWindow ||
        `${input.record.symbol} is not enter-now yet — Siggi is watching rather than forcing the trade.`,
    };
  }

  // ── Real-price gate ──────────────────────────────────────────────────────
  // Siggi only trades when all price levels are valid real market prices.
  // This prevents opening a position on stale, zeroed, or synthetically-derived
  // data — all three levels must be positive, finite, and directionally correct.
  const { entryLowAtCall, entryHighAtCall, stopPriceAtCall, targetPriceAtCall } = input.record;
  const entryMid = (entryLowAtCall + entryHighAtCall) / 2;
  const isBuy  = input.record.actionAtCall === "BUY";
  const isSell = input.record.actionAtCall === "SELL";
  const levelsOk =
    Number.isFinite(entryMid)   && entryMid   > 0 &&
    Number.isFinite(stopPriceAtCall)   && stopPriceAtCall   > 0 &&
    Number.isFinite(targetPriceAtCall) && targetPriceAtCall > 0;
  const directionOk =
    !levelsOk ? false :
    isBuy  ? (stopPriceAtCall < entryMid && targetPriceAtCall > entryMid) :
    isSell ? (stopPriceAtCall > entryMid && targetPriceAtCall < entryMid) :
    false;
  if (!levelsOk || !directionOk) {
    return {
      allow: false,
      reason: `${input.record.symbol} price levels are not valid — entry ${entryMid.toFixed(4)}, stop ${stopPriceAtCall.toFixed(4)}, target ${targetPriceAtCall.toFixed(4)}. Siggi will not trade until real levels are confirmed.`,
    };
  }

  // Asset price must be live and in the right ballpark of the entry zone
  if (input.asset) {
    const livePrice = input.asset.price;
    const zoneRange = entryHighAtCall - entryLowAtCall;
    const tolerance = Math.max(zoneRange * 4, entryMid * 0.04); // 4% of price or 4× zone width
    if (Math.abs(livePrice - entryMid) > tolerance) {
      return {
        allow: false,
        reason: `${input.record.symbol} live price ${livePrice.toFixed(4)} has moved too far from the entry zone ${entryLowAtCall.toFixed(4)}–${entryHighAtCall.toFixed(4)} — Siggi will wait for a fresh signal.`,
      };
    }
  }

  if (input.view.confidence < minConfidence) {
    return {
      allow: false,
      reason: `${input.record.symbol} confidence is ${input.view.confidence}% — Siggi needs at least ${minConfidence}% before committing capital.`,
    };
  }

  if (input.view.readiness < minReadiness) {
    return {
      allow: false,
      reason: `${input.record.symbol} readiness is ${input.view.readiness}% — price is not sitting cleanly in the entry zone yet.`,
    };
  }

  if (input.view.eventTone === "Headwind") {
    return {
      allow: false,
      reason: `${input.record.symbol} has an active event headwind — Siggi is waiting for the event to clear before opening.`,
    };
  }

  const rr = computeRiskReward(input.record);

  if (rr < minRiskReward) {
    return {
      allow: false,
      reason: `${input.record.symbol} R:R is ${rr.toFixed(2)}:1 — Siggi only opens trades with at least ${minRiskReward}:1 reward-to-risk.`,
    };
  }

  if (!isSignalFresh(input.record, input.nowMs)) {
    return {
      allow: false,
      reason: `${input.record.symbol} signal is older than the ${input.record.horizon.toLowerCase()} trade window — Siggi will wait for a fresh call rather than chasing a stale one.`,
    };
  }

  // Tier 2 — timeframe alignment gate
  const timeframeScore =
    input.view.scoreBreakdown.find((item) => item.label === "Timeframes")?.score ?? 50;

  if (timeframeScore < 45) {
    return {
      allow: false,
      reason: `${input.record.symbol} timeframe stack score is ${timeframeScore} — the trigger is live but higher timeframes are too conflicted for Siggi to commit.`,
    };
  }

  // Tier 2 — analysis staleness gate
  const maxAnalysisAge = maxAnalysisAgeHours[input.record.horizon] ?? 36;

  if (input.analysisAgeHours > maxAnalysisAge) {
    return {
      allow: false,
      reason: `${input.record.symbol} analysis is ${Math.round(input.analysisAgeHours)}h old — Siggi wants a fresh read before entering a ${input.record.horizon.toLowerCase()} trade.`,
    };
  }

  // Tier 1 — market regime hard filter
  const regime = input.assetRegime;
  const action = input.view.opportunityAction;

  if (regime === "Risk-Off" && action === "BUY" && input.view.confidence < 82) {
    return {
      allow: false,
      reason: `${input.record.symbol} is a BUY in a Risk-Off regime — Siggi needs at least 82% confidence to take the countertrend long (currently ${input.view.confidence}%).`,
    };
  }

  if (regime === "Risk-On" && action === "SELL" && input.view.confidence < 82) {
    return {
      allow: false,
      reason: `${input.record.symbol} is a SELL in a Risk-On regime — Siggi needs at least 82% confidence to take the countertrend short (currently ${input.view.confidence}%).`,
    };
  }

  // Market-open gate: never open a new trade on a currently closed market.
  // This covers weekend FX, after-hours equities, and any other session gap.
  // An already-open trade is unaffected — only entry is blocked here.
  if (input.asset) {
    const session = getMarketSession(input.asset);
    if (session.state === "Closed" || session.state === "Weekend") {
      return {
        allow: false,
        reason: `${input.record.symbol} market is ${session.state.toLowerCase()} right now — Siggi will not open a new position until the session reopens.`,
      };
    }
  }

  // Session-close gate: don't open Day trades when the market is about to close
  if (input.record.horizon === "Day" && input.asset) {
    if (isApproachingMarketClose(input.asset, 45)) {
      return {
        allow: false,
        reason: `${input.record.symbol} market closes in under 45 minutes — not enough runway left in the session for a Day trade to play out properly.`,
      };
    }
  }

  // Anti-tilt gate: after 3 consecutive losses Siggi gets more selective; after 5 he pauses
  const consecutiveLosses = computeConsecutiveLosses(input.account);
  if (consecutiveLosses >= 5 && input.view.confidence < 88) {
    return {
      allow: false,
      reason: `${input.record.symbol} skipped — ${consecutiveLosses} losses in a row is a tilt signal. Siggi is sitting on his hands until confidence clears 88% (currently ${input.view.confidence}%).`,
    };
  }
  if (consecutiveLosses >= 3 && input.view.confidence < 80) {
    return {
      allow: false,
      reason: `${input.record.symbol} skipped — ${consecutiveLosses} consecutive stops. Raising the confidence floor to 80% while the streak is live (currently ${input.view.confidence}%).`,
    };
  }

  // Minimum free cash = 0.5% of total equity (scales with account size)
  const minimumFreeCashToTradeGbp = Math.max(10, computeTotalEquityGbp(input.account) * 0.005);
  if (input.account.cashBalanceGbp < minimumFreeCashToTradeGbp) {
    return {
      allow: false,
      reason: "Free cash is too low — Siggi is preserving the remaining balance.",
    };
  }

  const totalEquityGbp = computeTotalEquityGbp(input.account);
  const deployable = input.account.cashBalanceGbp - totalEquityGbp * riskCtx.minCashReserveRatio;

  if (deployable <= 0) {
    return {
      allow: false,
      reason: `Cash reserve (${(riskCtx.minCashReserveRatio * 100).toFixed(0)}% of equity) is fully committed — Siggi is protecting the floor before opening more.`,
    };
  }

  // Tier 1 — portfolio heat cap
  const currentOpenRiskGbp = computeTotalOpenRiskGbp(input.account, input.usdToGbpRate);
  const projectedNewRiskGbp = totalEquityGbp * riskCtx.maxRiskPerTrade;
  const projectedHeatRatio = (currentOpenRiskGbp + projectedNewRiskGbp) / Math.max(totalEquityGbp, 1);

  if (projectedHeatRatio > maxPortfolioHeatRatio) {
    return {
      allow: false,
      reason: `Portfolio heat is already at ${((currentOpenRiskGbp / totalEquityGbp) * 100).toFixed(1)}% — adding this trade would breach the ${(maxPortfolioHeatRatio * 100).toFixed(0)}% risk cap.`,
    };
  }

  return { allow: true, reason: null };
}

function openSiggiTrade(input: {
  account: PersistedSiggiAccount;
  asset: PersistedAssetRecord | null;
  record: PersistedPredictionHistoryRecord;
  syncedAt: string;
  usdToGbpRate: number;
  view: ReturnType<typeof buildBotOpportunityView>;
  riskCtx?: RiskCtx;
}) {
  const riskCtx = input.riskCtx ?? DEFAULT_RISK_CONTROLS;
  const direction = input.record.actionAtCall === "SELL" ? "SELL" : "BUY";
  const entryPrice =
    direction === "SELL" ? input.record.entryHighAtCall : input.record.entryLowAtCall;
  const riskDistanceUsd = Math.abs(entryPrice - input.record.stopPriceAtCall);

  if (!Number.isFinite(riskDistanceUsd) || riskDistanceUsd <= 0) {
    return input.account;
  }

  const totalEquityGbp = computeTotalEquityGbp(input.account);
  const freeCash = input.account.cashBalanceGbp;
  const cashReserve = totalEquityGbp * riskCtx.minCashReserveRatio;
  const minimumFreeCashToTradeGbp = Math.max(10, totalEquityGbp * 0.005);
  const deployable = freeCash - cashReserve;

  if (deployable <= minimumFreeCashToTradeGbp) {
    return input.account;
  }

  // Tier 3 — volatility-adjusted, drawdown-throttled, confidence-weighted, anti-tilt risk sizing
  const volatilityMultiplier =
    input.asset?.volatility === "Fast" ? 0.75
    : input.asset?.volatility === "Elevated" ? 0.875
    : 1.0;
  const highWatermark = Math.max(input.account.highWatermarkGbp, totalEquityGbp);
  const drawdownFromPeak = highWatermark > 0 ? (highWatermark - totalEquityGbp) / highWatermark : 0;
  const drawdownMultiplier = drawdownFromPeak > 0.08 ? 0.5 : 1.0;
  // Scale between 0.85× (min confidence) and 1.20× (95%+ confidence)
  const confidenceRange = Math.max(0, Math.min(1, (input.view.confidence - minConfidence) / (95 - minConfidence)));
  const confidenceMultiplier = 0.85 + confidenceRange * 0.35;
  // Anti-tilt: halve risk after 3 consecutive losses, cap at 40% after 5+
  const consecutiveLosses = computeConsecutiveLosses(input.account);
  const antiTiltMultiplier = consecutiveLosses >= 5 ? 0.4 : consecutiveLosses >= 3 ? 0.6 : 1.0;
  const effectiveMaxRisk = riskCtx.maxRiskPerTrade * volatilityMultiplier * drawdownMultiplier * confidenceMultiplier * antiTiltMultiplier;

  // Risk-based sizing: stake = riskAmount / stopDistance
  const riskAmount = totalEquityGbp * effectiveMaxRisk;
  const stopDistanceRatio = riskDistanceUsd / Math.max(entryPrice, 0.000001);
  const stakeGbpCap = riskCtx.maxPositionSizeGbp != null
    ? Math.min(deployable, riskCtx.maxPositionSizeGbp)
    : deployable;
  const stakeGbp = clamp(riskAmount / Math.max(stopDistanceRatio, 0.001), Math.max(10, totalEquityGbp * 0.005), stakeGbpCap);
  const riskBudgetGbp = stakeGbp * stopDistanceRatio;
  const stakeUsd = convertGbpToUsd(stakeGbp, input.usdToGbpRate);
  const riskBudgetUsd = convertGbpToUsd(riskBudgetGbp, input.usdToGbpRate);
  const quantity = Math.min(stakeUsd / Math.max(entryPrice, 0.000001), riskBudgetUsd / riskDistanceUsd);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return input.account;
  }

  const openingMarkPrice =
    Number.isFinite(input.view.currentPrice) && input.view.currentPrice > 0
      ? input.view.currentPrice
      : entryPrice;
  const openingUnrealizedPnlUsd =
    direction === "SELL"
      ? (entryPrice - openingMarkPrice) * quantity
      : (openingMarkPrice - entryPrice) * quantity;
  const openingUnrealizedPnlGbp = openingUnrealizedPnlUsd * input.usdToGbpRate;
  const rr = computeRiskReward(input.record);
  const riskNote =
    volatilityMultiplier < 1 || drawdownMultiplier < 1 || antiTiltMultiplier < 1
      ? ` [Size reduced: vol×${volatilityMultiplier} dd×${drawdownMultiplier} tilt×${antiTiltMultiplier}]`
      : "";
  const trade: PersistedSiggiTrade = {
    id: `siggi-trade-${input.record.id}`,
    predictionId: input.record.id,
    sourceScannerResultId: input.record.sourceScannerResultId,
    symbol: input.record.symbol,
    instrumentName: input.record.instrumentName,
    side: direction,
    status: "Open",
    confidenceAtOpen: input.record.confidenceAtCall,
    openedAt: input.syncedAt,
    closedAt: null,
    entryPrice,
    stopPrice: input.record.stopPriceAtCall,
    targetPrice: input.record.targetPriceAtCall,
    stopMode: "Initial",
    initialStopPrice: input.record.stopPriceAtCall,
    partialExitDone: false,
    stakeGbp: roundMoney(stakeGbp),
    stakeUsd: roundMoney(stakeUsd),
    quantity: Number(quantity.toFixed(6)),
    currentPriceUsd: openingMarkPrice,
    unrealizedPnlGbp: roundMoney(openingUnrealizedPnlGbp),
    unrealizedPnlUsd: roundMoney(openingUnrealizedPnlUsd),
    peakUnrealizedPnlGbp: Math.max(0, roundMoney(openingUnrealizedPnlGbp)),
    realizedPnlGbp: null,
    realizedPnlUsd: null,
    lastMarkedAt: input.syncedAt,
    narrative: `${buildTradeNarrative(input.record, input.view, rr, effectiveMaxRisk)}${riskNote} [Stake £${roundMoney(stakeGbp).toFixed(2)} / equity £${totalEquityGbp.toFixed(2)}]`.trim(),
    createdAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };

  const nextAccount = {
    ...input.account,
    cashBalanceGbp: roundMoney(input.account.cashBalanceGbp - trade.stakeGbp),
    openTrades: [trade, ...input.account.openTrades],
    lastEvaluatedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };

  const rrLabel = rr.toFixed(1);
  const tiltNote = consecutiveLosses >= 3 ? ` (${consecutiveLosses}-loss streak — sizing down to ${(antiTiltMultiplier * 100).toFixed(0)}%)` : "";
  return appendActivity(
    nextAccount,
    buildActivity({
      at: input.syncedAt,
      detail: `${trade.side === "SELL" ? "Short" : "Long"} ${trade.symbol} — ${input.view.confidence}% confidence, ${rrLabel}R setup, £${roundMoney(stakeGbp).toFixed(2)} stake. ${input.view.priorityReason}${tiltNote}`,
      symbol: trade.symbol,
      type: "Opened",
    }),
  );
}

function closeSiggiTrade(input: {
  account: PersistedSiggiAccount;
  closeReason: "Hit Target" | "Stopped";
  syncedAt: string;
  trade: PersistedSiggiTrade;
  usdToGbpRate: number;
}) {
  const exitPrice =
    input.closeReason === "Hit Target" ? input.trade.targetPrice : input.trade.stopPrice;
  const finalLegPnlUsd = computeUnrealizedPnlUsd(input.trade, exitPrice);
  const finalLegPnlGbp = finalLegPnlUsd * input.usdToGbpRate;
  // Accumulate any partial-exit P&L already banked so the closed record shows the full picture
  const totalRealizedPnlUsd = roundMoney((input.trade.realizedPnlUsd ?? 0) + finalLegPnlUsd);
  const totalRealizedPnlGbp = roundMoney((input.trade.realizedPnlGbp ?? 0) + finalLegPnlGbp);
  // Classify purely from realised P&L — not from which level price touched.
  // A trade stopped out by a trailing stop in profit is a Win, not a Loss.
  const closeStatus = pnlToTradeStatus(totalRealizedPnlGbp);
  const closedTrade: PersistedSiggiTrade = {
    ...input.trade,
    status: closeStatus,
    closedAt: input.syncedAt,
    currentPriceUsd: exitPrice,
    unrealizedPnlUsd: 0,
    unrealizedPnlGbp: 0,
    realizedPnlUsd: totalRealizedPnlUsd,
    realizedPnlGbp: totalRealizedPnlGbp,
    lastMarkedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };
  const remainingOpenTrades = input.account.openTrades.filter(
    (trade) => trade.id !== input.trade.id,
  );
  const closedTrades = [closedTrade, ...input.account.closedTrades].slice(0, 180);
  const nextAccount = {
    ...input.account,
    cashBalanceGbp: roundMoney(
      input.account.cashBalanceGbp + input.trade.stakeGbp + roundMoney(finalLegPnlGbp),
    ),
    successfulTrades:
      input.account.successfulTrades +
      (closeStatus === "Hit Target" || closeStatus === "Breakeven" ? 1 : 0),
    failedTrades:
      input.account.failedTrades + (closeStatus === "Stopped" ? 1 : 0),
    openTrades: remainingOpenTrades,
    closedTrades,
    lastEvaluatedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };

  const pnlStr = `${totalRealizedPnlGbp >= 0 ? "+" : ""}£${Math.abs(totalRealizedPnlGbp).toFixed(2)}`;
  const partialNote = closedTrade.partialExitDone ? " (half already locked at 1:1)" : "";
  const closeDetail =
    closeStatus === "Hit Target"
      ? `${closedTrade.symbol} closed in profit — ${pnlStr}${partialNote}. Thesis played out.`
      : closeStatus === "Breakeven"
        ? `${closedTrade.symbol} closed at breakeven — ${pnlStr}${partialNote}. Thesis neutralised, no loss taken.`
        : `${closedTrade.symbol} closed at a loss — ${pnlStr}${partialNote}. Thesis invalidated, moving on.`;
  return appendActivity(
    nextAccount,
    buildActivity({
      at: input.syncedAt,
      detail: closeDetail,
      symbol: closedTrade.symbol,
      type: "Closed",
    }),
  );
}

/**
 * Void a trade that was erroneously opened while the market was closed.
 * Returns the full stake with zero P&L — the position never should have existed.
 */
function voidBadTrade(input: {
  account: PersistedSiggiAccount;
  trade: PersistedSiggiTrade;
  syncedAt: string;
}): PersistedSiggiAccount {
  const closedTrade: PersistedSiggiTrade = {
    ...input.trade,
    status: "Breakeven",
    closedAt: input.syncedAt,
    currentPriceUsd: input.trade.entryPrice,
    unrealizedPnlUsd: 0,
    unrealizedPnlGbp: 0,
    realizedPnlUsd: 0,
    realizedPnlGbp: 0,
    lastMarkedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };
  const nextAccount: PersistedSiggiAccount = {
    ...input.account,
    // Stake returned in full — no gain, no loss
    cashBalanceGbp: roundMoney(input.account.cashBalanceGbp + input.trade.stakeGbp),
    openTrades: input.account.openTrades.filter((t) => t.id !== input.trade.id),
    closedTrades: [closedTrade, ...input.account.closedTrades].slice(0, 180),
    lastEvaluatedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };
  return appendActivity(
    nextAccount,
    buildActivity({
      at: input.syncedAt,
      detail: `${input.trade.symbol} was opened while the market was closed — trade voided and full stake returned. No P&L impact.`,
      symbol: input.trade.symbol,
      type: "Closed",
    }),
  );
}

function updateLiveMark(trade: PersistedSiggiTrade, asset: PersistedAssetRecord, usdToGbpRate: number, syncedAt: string) {
  const unrealizedPnlUsd = computeUnrealizedPnlUsd(trade, asset.price);
  const unrealizedPnlGbp = unrealizedPnlUsd * usdToGbpRate;

  return {
    ...trade,
    currentPriceUsd: asset.price,
    unrealizedPnlUsd: roundMoney(unrealizedPnlUsd),
    unrealizedPnlGbp: roundMoney(unrealizedPnlGbp),
    peakUnrealizedPnlGbp: Math.max(trade.peakUnrealizedPnlGbp, roundMoney(unrealizedPnlGbp)),
    lastMarkedAt: syncedAt,
    updatedAt: syncedAt,
  };
}

function maybeTrailStop(input: {
  account: PersistedSiggiAccount;
  asset: PersistedAssetRecord;
  syncedAt: string;
  trade: PersistedSiggiTrade;
}) {
  // Use the original stop distance (not the current one) so trailing remains correct after partial exit
  const initialRisk = Math.abs(input.trade.entryPrice - input.trade.initialStopPrice);

  if (!Number.isFinite(initialRisk) || initialRisk <= 0) {
    return input.account;
  }

  const favorableMove =
    input.trade.side === "SELL"
      ? input.trade.entryPrice - input.asset.price
      : input.asset.price - input.trade.entryPrice;
  let nextStopPrice = input.trade.stopPrice;
  let nextStopMode = input.trade.stopMode;

  if (favorableMove >= initialRisk * 1.25) {
    // Lock in gains — trail stop tightly behind the move
    nextStopMode = "Trailing";
    const trailBuffer = initialRisk * 0.25;
    nextStopPrice =
      input.trade.side === "SELL"
        ? Math.min(input.trade.stopPrice, input.asset.price + trailBuffer)
        : Math.max(input.trade.stopPrice, input.asset.price - trailBuffer);
  } else if (favorableMove >= initialRisk * 0.8 && input.trade.stopMode === "Initial") {
    // Move to breakeven sooner — protect capital faster
    nextStopMode = "Breakeven";
    nextStopPrice = input.trade.entryPrice;
  }

  if (Math.abs(nextStopPrice - input.trade.stopPrice) < 0.000001) {
    return input.account;
  }

  const updatedTrade = {
    ...input.trade,
    stopPrice: Number(nextStopPrice.toFixed(6)),
    stopMode: nextStopMode,
    updatedAt: input.syncedAt,
  };

  const nextAccount = {
    ...input.account,
    openTrades: input.account.openTrades.map((trade) =>
      trade.id === input.trade.id ? updatedTrade : trade,
    ),
    updatedAt: input.syncedAt,
  };

  return appendActivity(
    nextAccount,
    buildActivity({
      at: input.syncedAt,
      detail: `${updatedTrade.symbol} stop moved to ${nextStopMode.toLowerCase()} protection at ${updatedTrade.stopPrice.toFixed(4)}.`,
      symbol: updatedTrade.symbol,
      type: "Stop Moved",
    }),
  );
}

function maybePartialExit(input: {
  account: PersistedSiggiAccount;
  asset: PersistedAssetRecord;
  syncedAt: string;
  trade: PersistedSiggiTrade;
  usdToGbpRate: number;
}): PersistedSiggiAccount {
  if (input.trade.partialExitDone) return input.account;

  const initialRisk = Math.abs(input.trade.entryPrice - input.trade.initialStopPrice);

  if (!Number.isFinite(initialRisk) || initialRisk <= 0) return input.account;

  const favorableMove =
    input.trade.side === "SELL"
      ? input.trade.entryPrice - input.asset.price
      : input.asset.price - input.trade.entryPrice;

  if (favorableMove < initialRisk) return input.account;

  // Price has reached 1:1 — exit 50% at current market price, move stop to breakeven
  const exitQty = input.trade.quantity * 0.5;
  const exitPrice = input.asset.price;
  const partialPnlUsd =
    input.trade.side === "SELL"
      ? (input.trade.entryPrice - exitPrice) * exitQty
      : (exitPrice - input.trade.entryPrice) * exitQty;
  const partialPnlGbp = roundMoney(partialPnlUsd * input.usdToGbpRate);
  const halfStakeGbp = roundMoney(input.trade.stakeGbp * 0.5);

  const updatedTrade: PersistedSiggiTrade = {
    ...input.trade,
    quantity: Number(exitQty.toFixed(6)),
    stakeGbp: halfStakeGbp,
    stakeUsd: roundMoney(input.trade.stakeUsd * 0.5),
    stopPrice: input.trade.entryPrice,
    stopMode: "Breakeven",
    unrealizedPnlGbp: input.trade.unrealizedPnlGbp !== null ? roundMoney(input.trade.unrealizedPnlGbp * 0.5) : null,
    unrealizedPnlUsd: input.trade.unrealizedPnlUsd !== null ? roundMoney(input.trade.unrealizedPnlUsd * 0.5) : null,
    peakUnrealizedPnlGbp: roundMoney(input.trade.peakUnrealizedPnlGbp * 0.5),
    realizedPnlGbp: roundMoney((input.trade.realizedPnlGbp ?? 0) + partialPnlGbp),
    realizedPnlUsd: roundMoney((input.trade.realizedPnlUsd ?? 0) + partialPnlUsd),
    partialExitDone: true,
    updatedAt: input.syncedAt,
  };

  const nextAccount = {
    ...input.account,
    cashBalanceGbp: roundMoney(input.account.cashBalanceGbp + halfStakeGbp + partialPnlGbp),
    openTrades: input.account.openTrades.map((t) => (t.id === input.trade.id ? updatedTrade : t)),
    updatedAt: input.syncedAt,
  };

  return appendActivity(
    nextAccount,
    buildActivity({
      at: input.syncedAt,
      detail: `${input.trade.symbol} partial exit — locked 50% at 1:1 for ${partialPnlGbp >= 0 ? "+" : ""}GBP ${Math.abs(partialPnlGbp).toFixed(2)}. Remainder running to full target with breakeven stop.`,
      symbol: input.trade.symbol,
      type: "Partial Exit",
    }),
  );
}

function maybeTimeoutTrade(input: {
  account: PersistedSiggiAccount;
  asset: PersistedAssetRecord;
  horizon: string;
  nowMs: number;
  syncedAt: string;
  trade: PersistedSiggiTrade;
  usdToGbpRate: number;
}): PersistedSiggiAccount {
  // Only time out trades that have never validated themselves — once at BE or trailing, let them run
  if (input.trade.stopMode !== "Initial") return input.account;

  const openedAtMs = Date.parse(input.trade.openedAt);
  if (!Number.isFinite(openedAtMs)) return input.account;

  const tradeAgeHours = (input.nowMs - openedAtMs) / 3_600_000;
  const maxHoldHours = maxTradeHoldHours[input.horizon] ?? 36;

  if (tradeAgeHours <= maxHoldHours) return input.account;

  // Exit at current market price — the thesis expired without resolving
  const exitPrice = input.asset.price;
  const finalLegPnlUsd = computeUnrealizedPnlUsd(input.trade, exitPrice);
  const finalLegPnlGbp = finalLegPnlUsd * input.usdToGbpRate;
  const totalRealizedPnlUsd = roundMoney((input.trade.realizedPnlUsd ?? 0) + finalLegPnlUsd);
  const totalRealizedPnlGbp = roundMoney((input.trade.realizedPnlGbp ?? 0) + finalLegPnlGbp);

  const timeoutStatus = pnlToTradeStatus(totalRealizedPnlGbp);
  const closedTrade: PersistedSiggiTrade = {
    ...input.trade,
    status: timeoutStatus,
    closedAt: input.syncedAt,
    currentPriceUsd: exitPrice,
    unrealizedPnlUsd: 0,
    unrealizedPnlGbp: 0,
    realizedPnlUsd: totalRealizedPnlUsd,
    realizedPnlGbp: totalRealizedPnlGbp,
    lastMarkedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };

  const nextAccount = {
    ...input.account,
    cashBalanceGbp: roundMoney(input.account.cashBalanceGbp + input.trade.stakeGbp + roundMoney(finalLegPnlGbp)),
    successfulTrades: input.account.successfulTrades + (timeoutStatus === "Hit Target" || timeoutStatus === "Breakeven" ? 1 : 0),
    failedTrades: input.account.failedTrades + (timeoutStatus === "Stopped" ? 1 : 0),
    openTrades: input.account.openTrades.filter((t) => t.id !== input.trade.id),
    closedTrades: [closedTrade, ...input.account.closedTrades].slice(0, 180),
    lastEvaluatedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };

  return appendActivity(
    nextAccount,
    buildActivity({
      at: input.syncedAt,
      detail: `${input.trade.symbol} closed at market after ${Math.round(tradeAgeHours)}h — the ${input.horizon.toLowerCase()} thesis expired without the stop or target printing. Exit at ${exitPrice.toFixed(4)}, P&L ${totalRealizedPnlGbp >= 0 ? "+" : ""}GBP ${Math.abs(totalRealizedPnlGbp).toFixed(2)}.`,
      symbol: input.trade.symbol,
      type: "Closed",
    }),
  );
}

export function shouldCloseFromLivePrice(trade: PersistedSiggiTrade, currentPriceUsd: number) {
  if (trade.side === "SELL") {
    const targetHit = currentPriceUsd <= trade.targetPrice;
    const stopHit = currentPriceUsd >= trade.stopPrice;

    // Pessimistic: when both levels are breached simultaneously, stop wins
    if (stopHit) return "Stopped" as const;
    if (targetHit) return "Hit Target" as const;

    return null;
  }

  const targetHit = currentPriceUsd >= trade.targetPrice;
  const stopHit = currentPriceUsd <= trade.stopPrice;

  // Pessimistic: when both levels are breached simultaneously, stop wins
  if (stopHit) return "Stopped" as const;
  if (targetHit) return "Hit Target" as const;

  return null;
}

function maybeResetAccount(account: PersistedSiggiAccount, syncedAt: string) {
  if (account.openTrades.length > 0 || account.cashBalanceGbp > bustThresholdGbp) {
    return account;
  }

  const resetAccount = {
    ...account,
    cashBalanceGbp: account.startingBalanceGbp,
    resetCount: account.resetCount + 1,
    lastEvaluatedAt: syncedAt,
    updatedAt: syncedAt,
  };

  return appendActivity(
    resetAccount,
    buildActivity({
      at: syncedAt,
      detail: `Balance hit zero-equivalent, so Siggi reloaded the paper account back to GBP ${account.startingBalanceGbp.toFixed(2)} and started another cycle.`,
      symbol: null,
      type: "Reset",
    }),
  );
}

export function syncSiggiAccount(data: PersistedWorkspaceData, syncedAt: string) {
  return syncSiggiAccountWithOptions(data, syncedAt, { allowNewTrades: true });
}

export function syncSiggiAccountWithOptions(
  data: PersistedWorkspaceData,
  syncedAt: string,
  options?: {
    allowNewTrades?: boolean;
  },
) {
  const allowNewTrades = options?.allowNewTrades ?? true;
  // Merge workspace risk controls with module-level defaults
  const riskCtx: RiskCtx = { ...DEFAULT_RISK_CONTROLS, ...(data.riskControls ?? {}) };
  const nowMs = Date.parse(syncedAt);
  const rates = buildCurrencyRates(data.assets);
  const usdToGbpRate = rates.GBP;
  const assetsBySymbol = new Map(data.assets.map((asset) => [asset.symbol, asset] as const));
  let account = data.siggiAccount;
  account = collapseDuplicateOpenTrades(account, syncedAt);

  account = {
    ...account,
    openTrades: account.openTrades.map((trade) => {
      const asset = assetsBySymbol.get(trade.symbol);
      return asset ? updateLiveMark(trade, asset, usdToGbpRate, syncedAt) : trade;
    }),
    lastEvaluatedAt: syncedAt,
    updatedAt: syncedAt,
  };

  const recordsById = new Map(
    data.predictionHistory.map((record) => [record.id, record] as const),
  );

  for (const trade of [...account.openTrades]) {
    const asset = assetsBySymbol.get(trade.symbol);
    const record = recordsById.get(trade.predictionId);
    let closeReason: "Hit Target" | "Stopped" | null = null;

    // Void trades that were opened erroneously while the market was closed.
    // This cleans up any pre-fix stale positions — stake is returned at no P&L.
    if (asset) {
      const sessionAtOpen = getMarketSession(asset, new Date(trade.openedAt));
      if (sessionAtOpen.state === "Closed" || sessionAtOpen.state === "Weekend") {
        account = voidBadTrade({ account, trade, syncedAt });
        continue;
      }
    }

    if (asset) {
      account = maybePartialExit({
        account,
        asset,
        syncedAt,
        trade: account.openTrades.find((item) => item.id === trade.id) ?? trade,
        usdToGbpRate,
      });
      account = maybeTrailStop({
        account,
        asset,
        syncedAt,
        trade: account.openTrades.find((item) => item.id === trade.id) ?? trade,
      });
      const refreshedTrade =
        account.openTrades.find((item) => item.id === trade.id) ?? trade;
      const liveCloseReason = shouldCloseFromLivePrice(refreshedTrade, asset.price);

      if (liveCloseReason) {
        account = closeSiggiTrade({
          account,
          closeReason: liveCloseReason,
          syncedAt,
          trade: refreshedTrade,
          usdToGbpRate,
        });
        closeReason = liveCloseReason;
      } else if (record) {
        // Time-based exit: close trades that have been drifting on their initial stop beyond the horizon window
        const preTimeoutCount = account.openTrades.length;
        account = maybeTimeoutTrade({
          account,
          asset,
          horizon: record.horizon,
          nowMs,
          syncedAt,
          trade: refreshedTrade,
          usdToGbpRate,
        });
        if (account.openTrades.length < preTimeoutCount) {
          closeReason = "Stopped";
        }
      }
    }

    if (
      !closeReason &&
      record?.monitoringStatus === "Resolved" &&
      (record.outcome === "Hit Target" || record.outcome === "Stopped")
    ) {
      const refreshedTrade =
        account.openTrades.find((item) => item.id === trade.id) ?? trade;
      account = closeSiggiTrade({
        account,
        closeReason: record.outcome,
        syncedAt,
        trade: refreshedTrade,
        usdToGbpRate,
      });
      closeReason = record.outcome;
    }

    // Write trade outcome back to the originating signal record.
    // We look up the trade's final status (which is P&L-based) from closedTrades
    // so a stop-out in profit is recorded as "Hit Target", not "Stopped".
    if (closeReason) {
      const closedTrade = account.closedTrades.find((t) => t.id === trade.id);
      const tradeStatus = closedTrade?.status ?? (closeReason === "Hit Target" ? "Hit Target" : "Stopped");
      const resolvedOutcome: PersistedPredictionHistoryRecord["outcome"] =
        tradeStatus === "Hit Target" ? "Hit Target"
        : tradeStatus === "Breakeven" ? "Breakeven"
        : "Stopped";
      const resolvedAccuracy: PersistedPredictionHistoryRecord["outcomeAccuracy"] =
        tradeStatus === "Hit Target" || tradeStatus === "Breakeven" ? "Accurate"
        : "Inaccurate";
      const resolvedScore = tradeStatus === "Hit Target" || tradeStatus === "Breakeven" ? 100 : 0;

      data.predictionHistory = data.predictionHistory.map((item) => {
        if (item.id !== trade.predictionId) return item;
        return {
          ...item,
          resolvedSource: "live_trade",
          resolvedAt: item.resolvedAt ?? syncedAt,
          outcome: resolvedOutcome,
          outcomeAccuracy: resolvedAccuracy,
          accuracyScore: resolvedScore,
          tradedStatus: "traded",
          monitoringStatus: "Resolved",
          updatedAt: syncedAt,
        } as typeof item;
      });
    }
  }

  // ── Daily loss limit — halt new trades if equity dropped too far today ──────
  const allowNewTradesAfterDailyLimit = (() => {
    if (!allowNewTrades) return false;
    if (riskCtx.dailyLossLimitRatio == null) return true;
    // Compare current equity to the most recent snapshot from > 20h ago (approximate day-start)
    const dayStartMs = Date.parse(syncedAt) - 20 * 60 * 60 * 1000;
    const dayStartSnap = [...account.equityCurve]
      .reverse()
      .find((s) => Date.parse(s.at) <= dayStartMs);
    if (!dayStartSnap) return true;
    const currentEquity = computeTotalEquityGbp(account);
    const dropRatio = (dayStartSnap.equityGbp - currentEquity) / Math.max(dayStartSnap.equityGbp, 1);
    return dropRatio < riskCtx.dailyLossLimitRatio;
  })();

  if (allowNewTradesAfterDailyLimit) {
    const existingPredictionIds = new Set(
      [...account.openTrades, ...account.closedTrades].map((trade) => trade.predictionId),
    );
    const existingSymbols = new Set(account.openTrades.map((trade) => trade.symbol));

    // Tier 2 — asset class correlation cap (max 2 open positions per class)
    const openTradesByAssetClass = new Map<string, number>();
    for (const trade of account.openTrades) {
      const tradeAsset = assetsBySymbol.get(trade.symbol);
      if (tradeAsset?.assetClass) {
        openTradesByAssetClass.set(
          tradeAsset.assetClass,
          (openTradesByAssetClass.get(tradeAsset.assetClass) ?? 0) + 1,
        );
      }
    }
    const rankedCandidates = data.scannerResults
      .map((setup) => ({
        setup,
        asset: assetsBySymbol.get(setup.symbol) ?? null,
        view: buildBotOpportunityView(
          setup,
          assetsBySymbol.get(setup.symbol) ?? null,
          data.confirmationChecks,
          data.marketEvents,
          data.backtests,
          data.predictionHistory,
        ),
      }))
      .filter(({ asset, view }) => asset && view.opportunityAction !== "WAIT")
      .sort((left, right) => right.view.rankScore - left.view.rankScore);

    let skipLogsAdded = 0;

    for (const candidate of rankedCandidates) {
      if (account.openTrades.length >= riskCtx.maxConcurrentTrades) {
        const alreadyLoggedCapacity = account.activityLog.some(
          (activity) =>
            activity.type === "Skipped" &&
            activity.symbol === null &&
            activity.detail.includes("maximum active trade slots") &&
            Date.parse(syncedAt) - Date.parse(activity.at) < 6 * 60 * 60 * 1000,
        );

        if (!alreadyLoggedCapacity) {
          account = appendActivity(
            account,
            buildActivity({
              at: syncedAt,
              detail: `Siggi reached the maximum active trade slots (${riskCtx.maxConcurrentTrades}), so further enter-now calls will queue until a position closes or free capacity returns.`,
              symbol: null,
              type: "Skipped",
            }),
          );
        }
        break;
      }

      if (existingSymbols.has(candidate.setup.symbol)) {
        continue;
      }

      // Tier 2 — asset class correlation cap
      if (candidate.asset?.assetClass) {
        const classCount = openTradesByAssetClass.get(candidate.asset.assetClass) ?? 0;

        if (classCount >= maxTradesPerAssetClass) {
          continue;
        }
      }

      // Tier 3 — cross-asset correlation filter
      // If 2+ open trades already sit in the same correlation cluster, skip this
      // candidate. Adding a third correlated position doesn't diversify risk — it
      // concentrates it behind a single macro narrative.
      const candidateGroup = getCorrelationGroup(candidate.setup.symbol);
      if (candidateGroup !== null) {
        const groupCount = account.openTrades.filter(
          (t) => getCorrelationGroup(t.symbol) === candidateGroup,
        ).length;

        if (groupCount >= maxTradesPerCorrelationGroup) {
          continue;
        }
      }

      const record = data.predictionHistory.find(
        (item) =>
          item.sourceScannerResultId === candidate.setup.id &&
          item.monitoringStatus === "Active" &&
          item.decisionAtCall === "ENTER NOW",
      );

      if (!record || existingPredictionIds.has(record.id)) {
        continue;
      }

      const analysisAgeHours = (() => {
        const ts = candidate.setup.analysisUpdatedAt ?? candidate.setup.analysis?.analyzedAt ?? null;
        if (!ts) return Number.POSITIVE_INFINITY;
        const parsed = Date.parse(ts);
        return Number.isFinite(parsed) ? Math.max(0, (nowMs - parsed) / 3_600_000) : Number.POSITIVE_INFINITY;
      })();

      const tradeDecision = shouldOpenTrade({
        account,
        analysisAgeHours,
        asset: candidate.asset,
        assetRegime: candidate.asset?.regime ?? null,
        nowMs,
        record,
        usdToGbpRate,
        view: candidate.view,
        riskCtx,
      });

      if (!tradeDecision.allow) {
        const alreadyLoggedSkip = account.activityLog.some(
          (activity) =>
            activity.type === "Skipped" &&
            activity.symbol === candidate.setup.symbol &&
            Date.parse(syncedAt) - Date.parse(activity.at) < 6 * 60 * 60 * 1000,
        );

        if (skipLogsAdded < 2 && !alreadyLoggedSkip) {
          account = appendActivity(
            account,
            buildActivity({
              at: syncedAt,
              detail: `Skipped ${candidate.setup.symbol} even though it surfaced near the top: ${tradeDecision.reason}`,
              symbol: candidate.setup.symbol,
              type: "Skipped",
            }),
          );
          skipLogsAdded += 1;
        }

        // Mark the prediction record as skipped and store Siggi's reason
        if (record) {
          data.predictionHistory = data.predictionHistory.map((item) =>
            item.id === record.id
              ? { ...item, tradedStatus: "skipped", siggiSkipReason: tradeDecision.reason ?? null, updatedAt: syncedAt }
              : item,
          );
        }
        continue;
      }

      account = openSiggiTrade({
        account,
        asset: candidate.asset,
        record,
        syncedAt,
        usdToGbpRate,
        view: candidate.view,
        riskCtx,
      });
      existingPredictionIds.add(record.id);
      existingSymbols.add(candidate.setup.symbol);

      if (candidate.asset?.assetClass) {
        openTradesByAssetClass.set(
          candidate.asset.assetClass,
          (openTradesByAssetClass.get(candidate.asset.assetClass) ?? 0) + 1,
        );
      }

      // Mark the prediction record as traded
      data.predictionHistory = data.predictionHistory.map((item) =>
        item.id === record.id ? { ...item, tradedStatus: "traded", updatedAt: syncedAt } : item,
      );
    }
  } // end allowNewTradesAfterDailyLimit

  const equityAccount = recordEquitySnapshot(account, syncedAt);
  const totalEquityGbp = computeTotalEquityGbp(equityAccount);
  account = {
    ...equityAccount,
    highWatermarkGbp: Math.max(equityAccount.highWatermarkGbp, totalEquityGbp),
    updatedAt: syncedAt,
  };
  account = maybeResetAccount(account, syncedAt);
  data.siggiAccount = account;

  return data;
}
