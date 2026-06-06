import { buildCurrencyRates } from "@/app/_lib/currency";
import { buildBotOpportunityView } from "@/app/_lib/bot-engine";
import type {
  PersistedAssetRecord,
  PersistedPredictionHistoryRecord,
  PersistedSiggiAccount,
  PersistedSiggiActivity,
  PersistedSiggiTrade,
  PersistedWorkspaceData,
} from "./workspace-types";

// Siggi operates with full capital — no artificial limits on concurrent trades.
// Risk discipline is preserved (2% per trade, 5% reserve) but the old penny-ante
// caps that prevented him from acting on good signals have been removed.
const maximumConcurrentTrades = 20;   // was 5 — Siggi can now run as many as he qualifies for
const maxRiskPerTrade = 0.02;          // 2% per trade — unchanged (this is sensible risk management)
const minCashReserveRatio = 0.05;      // was 0.20 — only 5% buffer needed; 95% can be deployed
const maxPortfolioHeatRatio = 0.40;    // was 0.06 — up to 40% of equity at open risk at once
const maxTradesPerAssetClass = 6;      // was 2 — more diversity per asset class allowed
const bustThresholdGbp = 50;           // scale with £10k starting balance (was £1 for £50 account)

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function convertGbpToUsd(valueGbp: number, usdToGbpRate: number) {
  if (!Number.isFinite(usdToGbpRate) || usdToGbpRate <= 0) {
    return valueGbp;
  }

  return valueGbp / usdToGbpRate;
}

function computeUnrealizedPnlUsd(trade: PersistedSiggiTrade, currentPriceUsd: number) {
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

function buildTradeNarrative(record: PersistedPredictionHistoryRecord) {
  return [
    `${record.symbol} ${record.actionAtCall} call locked from ${record.timeframe} / ${record.horizon}.`,
    record.patternSnapshotAtCall,
    record.eventContextAtCall,
  ]
    .filter(Boolean)
    .join(" ");
}

function computeTotalEquityGbp(account: PersistedSiggiAccount) {
  return roundMoney(
    account.cashBalanceGbp +
      account.openTrades.reduce(
        (total, trade) => total + trade.stakeGbp + (trade.unrealizedPnlGbp ?? 0),
        0,
      ),
  );
}

function computeTotalOpenRiskGbp(account: PersistedSiggiAccount, usdToGbpRate: number) {
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

const minConfidence = 68;
const minReadiness = 72;
const minRiskReward = 1.5;

const signalMaxAgeHours: Record<string, number> = {
  Day: 2,    // Day signals expire quickly — re-analysis every hour keeps them current
  Week: 24,
  Month: 72,
};

function computeRiskReward(record: PersistedPredictionHistoryRecord) {
  const entryPrice =
    record.actionAtCall === "SELL" ? record.entryHighAtCall : record.entryLowAtCall;
  const riskDistance = Math.abs(entryPrice - record.stopPriceAtCall);
  const rewardDistance = Math.abs(record.targetPriceAtCall - entryPrice);

  if (riskDistance <= 0) return 0;
  return rewardDistance / riskDistance;
}

function isSignalFresh(record: PersistedPredictionHistoryRecord, nowMs: number) {
  const maxAgeHours = signalMaxAgeHours[record.horizon] ?? 24;
  const calledAtMs = Date.parse(record.calledAt);
  return Number.isFinite(calledAtMs) && nowMs - calledAtMs <= maxAgeHours * 60 * 60 * 1000;
}

// Analysis must be fresh — Siggi won't enter a trade on stale chart data.
// Max 1h for Day setups, 4h for Week setups, 12h for Monthly setups.
const maxAnalysisAgeHours: Record<string, number> = { Day: 1, Week: 4, Month: 12 };

// Maximum time a trade can stay on its initial stop before Siggi calls time — 3× the signal window
const maxTradeHoldHours: Record<string, number> = { Day: 36, Week: 96, Month: 192 };

function shouldOpenTrade(input: {
  account: PersistedSiggiAccount;
  analysisAgeHours: number;
  assetRegime: string | null;
  nowMs: number;
  record: PersistedPredictionHistoryRecord;
  usdToGbpRate: number;
  view: ReturnType<typeof buildBotOpportunityView>;
}) {
  if (input.view.decision.label !== "ENTER NOW" || input.view.opportunityAction === "WAIT") {
    return {
      allow: false,
      reason:
        input.view.timingWindow ||
        `${input.record.symbol} is not enter-now yet — Siggi is watching rather than forcing the trade.`,
    };
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

  // Minimum free cash = 0.5% of total equity (scales with account size)
  const minimumFreeCashToTradeGbp = Math.max(10, computeTotalEquityGbp(input.account) * 0.005);
  if (input.account.cashBalanceGbp < minimumFreeCashToTradeGbp) {
    return {
      allow: false,
      reason: "Free cash is too low — Siggi is preserving the remaining balance.",
    };
  }

  const totalEquityGbp = computeTotalEquityGbp(input.account);
  const deployable = input.account.cashBalanceGbp - totalEquityGbp * minCashReserveRatio;

  if (deployable <= 0) {
    return {
      allow: false,
      reason: `Cash reserve (${(minCashReserveRatio * 100).toFixed(0)}% of equity) is fully committed — Siggi is protecting the floor before opening more.`,
    };
  }

  // Tier 1 — portfolio heat cap
  const currentOpenRiskGbp = computeTotalOpenRiskGbp(input.account, input.usdToGbpRate);
  const projectedNewRiskGbp = totalEquityGbp * maxRiskPerTrade;
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
}) {
  const direction = input.record.actionAtCall === "SELL" ? "SELL" : "BUY";
  const entryPrice =
    direction === "SELL" ? input.record.entryHighAtCall : input.record.entryLowAtCall;
  const riskDistanceUsd = Math.abs(entryPrice - input.record.stopPriceAtCall);

  if (!Number.isFinite(riskDistanceUsd) || riskDistanceUsd <= 0) {
    return input.account;
  }

  const totalEquityGbp = computeTotalEquityGbp(input.account);
  const freeCash = input.account.cashBalanceGbp;
  const cashReserve = totalEquityGbp * minCashReserveRatio;
  const minimumFreeCashToTradeGbp = Math.max(10, totalEquityGbp * 0.005);
  const deployable = freeCash - cashReserve;

  if (deployable <= minimumFreeCashToTradeGbp) {
    return input.account;
  }

  // Tier 3 — volatility-adjusted and drawdown-throttled risk sizing
  const volatilityMultiplier =
    input.asset?.volatility === "Fast" ? 0.75
    : input.asset?.volatility === "Elevated" ? 0.875
    : 1.0;
  const highWatermark = Math.max(input.account.highWatermarkGbp, totalEquityGbp);
  const drawdownFromPeak = highWatermark > 0 ? (highWatermark - totalEquityGbp) / highWatermark : 0;
  const drawdownMultiplier = drawdownFromPeak > 0.08 ? 0.5 : 1.0;
  const effectiveMaxRisk = maxRiskPerTrade * volatilityMultiplier * drawdownMultiplier;

  // Risk-based sizing: stake = riskAmount / stopDistance
  const riskAmount = totalEquityGbp * effectiveMaxRisk;
  const stopDistanceRatio = riskDistanceUsd / Math.max(entryPrice, 0.000001);
  const stakeGbp = clamp(riskAmount / Math.max(stopDistanceRatio, 0.001), Math.max(10, totalEquityGbp * 0.005), deployable);
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
  const riskNote =
    volatilityMultiplier < 1 || drawdownMultiplier < 1
      ? ` [Reduced: volatility×${volatilityMultiplier}, drawdown×${drawdownMultiplier}]`
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
    narrative: `${buildTradeNarrative(input.record)} ${input.view.priorityReason} [Stake £${roundMoney(stakeGbp).toFixed(2)} = ${(effectiveMaxRisk * 100).toFixed(1)}% risk on £${totalEquityGbp.toFixed(2)} equity, stop distance ${(stopDistanceRatio * 100).toFixed(2)}%${riskNote}]`.trim(),
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

  return appendActivity(
    nextAccount,
    buildActivity({
      at: input.syncedAt,
      detail: `Opened ${trade.symbol} ${trade.side} from a ${input.view.confidence}% / ${input.view.readiness}% ranked enter-now setup.`,
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
  const closedTrade: PersistedSiggiTrade = {
    ...input.trade,
    status: input.closeReason,
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
      (closedTrade.status === "Hit Target" ? 1 : 0),
    failedTrades:
      input.account.failedTrades + (closedTrade.status === "Stopped" ? 1 : 0),
    openTrades: remainingOpenTrades,
    closedTrades,
    lastEvaluatedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };

  return appendActivity(
    nextAccount,
    buildActivity({
      at: input.syncedAt,
      detail:
        input.closeReason === "Hit Target"
          ? `${closedTrade.symbol} hit target for ${totalRealizedPnlGbp >= 0 ? "+" : ""}GBP ${Math.abs(totalRealizedPnlGbp).toFixed(2)}${closedTrade.partialExitDone ? " (includes partial exit)" : ""}.`
          : `${closedTrade.symbol} stopped out for ${totalRealizedPnlGbp >= 0 ? "+" : ""}GBP ${Math.abs(totalRealizedPnlGbp).toFixed(2)}${closedTrade.partialExitDone ? " (partial exit already banked)" : ""}.`,
      symbol: closedTrade.symbol,
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

  const closedTrade: PersistedSiggiTrade = {
    ...input.trade,
    status: "Stopped",
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
    failedTrades: input.account.failedTrades + 1,
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

function shouldCloseFromLivePrice(trade: PersistedSiggiTrade, currentPriceUsd: number) {
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

    // Bug Fix 1: write trade outcome back to the originating signal record
    if (closeReason) {
      data.predictionHistory = data.predictionHistory.map((item) => {
        if (item.id !== trade.predictionId) return item;
        return {
          ...item,
          tradeOutcome: closeReason,
          resolvedSource: "live_trade",
          resolvedAt: item.resolvedAt ?? syncedAt,
          outcome: closeReason === "Hit Target" ? "Hit Target" : "Stopped",
          outcomeAccuracy: closeReason === "Hit Target" ? "Accurate" : "Inaccurate",
          accuracyScore: closeReason === "Hit Target" ? 100 : 0,
          tradedStatus: "traded",
          monitoringStatus: "Resolved",
          updatedAt: syncedAt,
        } as typeof item;
      });
    }
  }

  if (allowNewTrades) {
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
      if (account.openTrades.length >= maximumConcurrentTrades) {
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
              detail: `Siggi reached the maximum active trade slots (${maximumConcurrentTrades}), so further enter-now calls will queue until a position closes or free capacity returns.`,
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
        assetRegime: candidate.asset?.regime ?? null,
        nowMs,
        record,
        usdToGbpRate,
        view: candidate.view,
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

        // Mark the prediction record as skipped so it's excluded from live accuracy
        if (record) {
          data.predictionHistory = data.predictionHistory.map((item) =>
            item.id === record.id ? { ...item, tradedStatus: "skipped", updatedAt: syncedAt } : item,
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
  }

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
