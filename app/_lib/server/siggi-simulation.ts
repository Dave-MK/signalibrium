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

const minimumFreeCashToTradeGbp = 5;
const maximumConcurrentTrades = 8;
const bustThresholdGbp = 1;

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

function shouldOpenTrade(input: {
  account: PersistedSiggiAccount;
  record: PersistedPredictionHistoryRecord;
  view: ReturnType<typeof buildBotOpportunityView>;
}) {
  if (input.view.decision.label !== "ENTER NOW" || input.view.opportunityAction === "WAIT") {
    return {
      allow: false,
      reason:
        input.view.timingWindow ||
        `${input.record.symbol} is not an enter-now setup, so Siggy is waiting instead of forcing a trade.`,
    };
  }

  if (input.account.cashBalanceGbp < minimumFreeCashToTradeGbp) {
    return {
      allow: false,
      reason: "Free cash is too low, so Siggi is preserving the remaining paper balance.",
    };
  }

  return { allow: true, reason: null };
}

function openSiggiTrade(input: {
  account: PersistedSiggiAccount;
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

  const freeCash = input.account.cashBalanceGbp;
  const stakeGbp = clamp(freeCash * 0.34, 6, freeCash);
  const riskBudgetGbp = clamp(freeCash * 0.18, 4, freeCash * 0.32);
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
    narrative: `${buildTradeNarrative(input.record)} ${input.view.priorityReason}`.trim(),
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
  const realizedPnlUsd = computeUnrealizedPnlUsd(input.trade, exitPrice);
  const realizedPnlUsdRounded = roundMoney(realizedPnlUsd);
  const realizedPnlGbpRounded = roundMoney(realizedPnlUsd * input.usdToGbpRate);
  const closedTrade: PersistedSiggiTrade = {
    ...input.trade,
    status: input.closeReason,
    closedAt: input.syncedAt,
    currentPriceUsd: exitPrice,
    unrealizedPnlUsd: 0,
    unrealizedPnlGbp: 0,
    realizedPnlUsd: realizedPnlUsdRounded,
    realizedPnlGbp: realizedPnlGbpRounded,
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
      input.account.cashBalanceGbp + input.trade.stakeGbp + realizedPnlGbpRounded,
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
          ? `${closedTrade.symbol} hit target for ${realizedPnlGbpRounded >= 0 ? "+" : ""}GBP ${Math.abs(realizedPnlGbpRounded).toFixed(2)}.`
          : `${closedTrade.symbol} stopped out for ${realizedPnlGbpRounded >= 0 ? "+" : ""}GBP ${Math.abs(realizedPnlGbpRounded).toFixed(2)}.`,
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
  const initialRisk = Math.abs(input.trade.entryPrice - input.trade.stopPrice);

  if (!Number.isFinite(initialRisk) || initialRisk <= 0) {
    return input.account;
  }

  const favorableMove =
    input.trade.side === "SELL"
      ? input.trade.entryPrice - input.asset.price
      : input.asset.price - input.trade.entryPrice;
  let nextStopPrice = input.trade.stopPrice;
  let nextStopMode = input.trade.stopMode;

  if (favorableMove >= initialRisk * 1.5) {
    nextStopMode = "Trailing";
    nextStopPrice =
      input.trade.side === "SELL"
        ? Math.min(input.trade.stopPrice, input.trade.entryPrice - initialRisk * 0.35)
        : Math.max(input.trade.stopPrice, input.trade.entryPrice + initialRisk * 0.35);
  } else if (favorableMove >= initialRisk && input.trade.stopMode === "Initial") {
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

function shouldCloseFromLivePrice(trade: PersistedSiggiTrade, currentPriceUsd: number) {
  if (trade.side === "SELL") {
    if (currentPriceUsd <= trade.targetPrice) {
      return "Hit Target" as const;
    }

    if (currentPriceUsd >= trade.stopPrice) {
      return "Stopped" as const;
    }

    return null;
  }

  if (currentPriceUsd >= trade.targetPrice) {
    return "Hit Target" as const;
  }

  if (currentPriceUsd <= trade.stopPrice) {
    return "Stopped" as const;
  }

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

    if (asset) {
      account = maybeTrailStop({
        account,
        asset,
        syncedAt,
        trade,
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
        continue;
      }
    }

    if (
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
    }
  }

  if (allowNewTrades) {
    const existingPredictionIds = new Set(
      [...account.openTrades, ...account.closedTrades].map((trade) => trade.predictionId),
    );
    const existingSymbols = new Set(account.openTrades.map((trade) => trade.symbol));
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
              detail: `Siggy reached the maximum active trade slots (${maximumConcurrentTrades}), so further enter-now calls will queue until a position closes or free capacity returns.`,
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

      const record = data.predictionHistory.find(
        (item) =>
          item.sourceScannerResultId === candidate.setup.id &&
          item.monitoringStatus === "Active" &&
          item.decisionAtCall === "ENTER NOW",
      );

      if (!record || existingPredictionIds.has(record.id)) {
        continue;
      }

      const tradeDecision = shouldOpenTrade({
        account,
        record,
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
        continue;
      }

      account = openSiggiTrade({
        account,
        record,
        syncedAt,
        usdToGbpRate,
        view: candidate.view,
      });
      existingPredictionIds.add(record.id);
      existingSymbols.add(candidate.setup.symbol);
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
