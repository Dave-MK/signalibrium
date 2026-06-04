import { buildCurrencyRates } from "@/app/_lib/currency";
import type {
  PersistedPredictionHistoryRecord,
  PersistedSiggiAccount,
  PersistedSiggiTrade,
  PersistedWorkspaceData,
} from "./workspace-types";

const minimumFreeCashToTradeGbp = 5;
const maximumConcurrentTrades = 3;
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

function buildTradeNarrative(record: PersistedPredictionHistoryRecord) {
  return [
    `${record.symbol} ${record.actionAtCall} call locked from ${record.timeframe} / ${record.horizon}.`,
    record.patternSnapshotAtCall,
    record.eventContextAtCall,
  ]
    .filter(Boolean)
    .join(" ");
}

function openSiggiTrade(input: {
  account: PersistedSiggiAccount;
  record: PersistedPredictionHistoryRecord;
  syncedAt: string;
  usdToGbpRate: number;
}) {
  const direction = input.record.actionAtCall === "SELL" ? "SELL" : "BUY";
  const riskDistanceUsd = Math.abs(
    input.record.entryHighAtCall - input.record.stopPriceAtCall,
  );

  if (!Number.isFinite(riskDistanceUsd) || riskDistanceUsd <= 0) {
    return input.account;
  }

  const freeCash = input.account.cashBalanceGbp;
  const stakeGbp = clamp(freeCash * 0.42, 6, freeCash);
  const riskBudgetGbp = clamp(freeCash * 0.6, 5, freeCash * 0.78);
  const stakeUsd = convertGbpToUsd(stakeGbp, input.usdToGbpRate);
  const riskBudgetUsd = convertGbpToUsd(riskBudgetGbp, input.usdToGbpRate);
  const quantity = riskBudgetUsd / riskDistanceUsd;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return input.account;
  }

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
    entryPrice: direction === "SELL" ? input.record.entryHighAtCall : input.record.entryLowAtCall,
    stopPrice: input.record.stopPriceAtCall,
    targetPrice: input.record.targetPriceAtCall,
    stakeGbp: roundMoney(stakeGbp),
    stakeUsd: roundMoney(stakeUsd),
    quantity: Number(quantity.toFixed(6)),
    realizedPnlGbp: null,
    realizedPnlUsd: null,
    narrative: buildTradeNarrative(input.record),
    createdAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };

  return {
    ...input.account,
    cashBalanceGbp: roundMoney(input.account.cashBalanceGbp - trade.stakeGbp),
    openTrades: [trade, ...input.account.openTrades],
    lastEvaluatedAt: input.syncedAt,
    updatedAt: input.syncedAt,
  };
}

function closeSiggiTrade(input: {
  account: PersistedSiggiAccount;
  record: PersistedPredictionHistoryRecord;
  syncedAt: string;
  trade: PersistedSiggiTrade;
  usdToGbpRate: number;
}) {
  const exitPrice =
    input.record.outcome === "Hit Target"
      ? input.trade.targetPrice
      : input.trade.stopPrice;
  const realizedPnlUsd =
    input.trade.side === "SELL"
      ? (input.trade.entryPrice - exitPrice) * input.trade.quantity
      : (exitPrice - input.trade.entryPrice) * input.trade.quantity;
  const realizedPnlUsdRounded = roundMoney(realizedPnlUsd);
  const realizedPnlGbpRounded = roundMoney(realizedPnlUsd * input.usdToGbpRate);
  const closedTrade: PersistedSiggiTrade = {
    ...input.trade,
    status: input.record.outcome === "Hit Target" ? "Hit Target" : "Stopped",
    closedAt: input.syncedAt,
    realizedPnlUsd: realizedPnlUsdRounded,
    realizedPnlGbp: realizedPnlGbpRounded,
    updatedAt: input.syncedAt,
    narrative: `${input.trade.narrative} ${input.record.narrative}`.trim(),
  };
  const remainingOpenTrades = input.account.openTrades.filter(
    (trade) => trade.id !== input.trade.id,
  );
  const closedTrades = [closedTrade, ...input.account.closedTrades].slice(0, 180);

  return {
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
}

function computeTotalBalanceGbp(account: PersistedSiggiAccount) {
  return roundMoney(
    account.cashBalanceGbp +
      account.openTrades.reduce((total, trade) => total + trade.stakeGbp, 0),
  );
}

function normalizeBust(account: PersistedSiggiAccount, syncedAt: string) {
  if (account.openTrades.length > 0 || account.cashBalanceGbp > bustThresholdGbp) {
    return account;
  }

  return {
    ...account,
    cashBalanceGbp: account.startingBalanceGbp,
    resetCount: account.resetCount + 1,
    lastEvaluatedAt: syncedAt,
    updatedAt: syncedAt,
  };
}

export function syncSiggiAccount(data: PersistedWorkspaceData, syncedAt: string) {
  const rates = buildCurrencyRates(data.assets);
  const usdToGbpRate = rates.GBP;
  const recordsById = new Map(
    data.predictionHistory.map((record) => [record.id, record] as const),
  );
  let account = data.siggiAccount;

  for (const trade of account.openTrades) {
    const record = recordsById.get(trade.predictionId);

    if (!record || record.monitoringStatus !== "Resolved") {
      continue;
    }

    account = closeSiggiTrade({
      account,
      record,
      syncedAt,
      trade,
      usdToGbpRate,
    });
  }

  const existingPredictionIds = new Set(
    [...account.openTrades, ...account.closedTrades].map((trade) => trade.predictionId),
  );
  const existingSymbols = new Set(account.openTrades.map((trade) => trade.symbol));
  const eligibleRecords = data.predictionHistory
    .filter(
      (record) =>
        record.monitoringStatus === "Active" &&
        record.decisionAtCall === "ENTER NOW" &&
        record.actionAtCall !== "WAIT" &&
        !existingPredictionIds.has(record.id) &&
        !existingSymbols.has(record.symbol),
    )
    .sort((left, right) => {
      if (right.confidenceAtCall !== left.confidenceAtCall) {
        return right.confidenceAtCall - left.confidenceAtCall;
      }

      return Date.parse(right.calledAt) - Date.parse(left.calledAt);
    });

  for (const record of eligibleRecords) {
    if (account.openTrades.length >= maximumConcurrentTrades) {
      break;
    }

    if (account.cashBalanceGbp < minimumFreeCashToTradeGbp) {
      break;
    }

    account = openSiggiTrade({
      account,
      record,
      syncedAt,
      usdToGbpRate,
    });
  }

  const totalBalanceGbp = computeTotalBalanceGbp(account);
  account = {
    ...account,
    highWatermarkGbp: Math.max(account.highWatermarkGbp, totalBalanceGbp),
    lastEvaluatedAt: syncedAt,
    updatedAt: syncedAt,
  };
  account = normalizeBust(account, syncedAt);
  data.siggiAccount = account;

  return data;
}
