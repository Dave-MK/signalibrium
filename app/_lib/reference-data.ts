import {
  getAssetBySymbol,
  setups,
  watchlist,
  type Asset,
  type Setup,
} from "@/app/_data/mock-data";
import type {
  PersistedTradeTicket,
  PersistedWatchlist,
} from "@/app/_lib/server/workspace-types";

const accountSize = 182450;
const riskPerTrade = 0.01;

function parseCurrencyLabel(label: string) {
  return Number(label.replaceAll("$", "").replaceAll(",", "").trim());
}

function parseEntryZone(entryZone: string) {
  const [start, end] = entryZone.split("-").map((value) => parseCurrencyLabel(value));
  if (Number.isFinite(start) && Number.isFinite(end)) {
    return Number(((start + end) / 2).toFixed(2));
  }

  return parseCurrencyLabel(entryZone);
}

export const assetUniverse = watchlist;
export const availableSetups = setups;

export function resolveAssetsForWatchlist(itemSymbols: string[]) {
  return itemSymbols
    .map((symbol) => getAssetBySymbol(symbol))
    .filter((asset): asset is Asset => Boolean(asset));
}

export function getDefaultPersistedWatchlist(watchlists: PersistedWatchlist[]) {
  return watchlists.find((watchlist) => watchlist.isDefault) ?? watchlists[0] ?? null;
}

export function getSetupById(setupId: string) {
  return availableSetups.find((setup) => setup.id === setupId) ?? null;
}

function buildGateResults(setup: Setup, asset: Asset) {
  return [
    {
      label: "Structure intact",
      status:
        setup.tradeability === "BLOCKED" ? "WARN" : "PASS",
      detail:
        setup.tradeability === "BLOCKED"
          ? "The setup is interesting, but confirmation is still incomplete."
          : `${setup.timeframe} structure is aligned with the current strategy trigger.`,
    },
    {
      label: "Liquidity",
      status: setup.liquidityStatus === "Thin" ? "FAIL" : "PASS",
      detail:
        setup.liquidityStatus === "Thin"
          ? "Spread and depth are too weak for protected execution."
          : `${setup.liquidityStatus} liquidity supports controlled sizing.`,
    },
    {
      label: "Volatility",
      status: asset.volatility === "Fast" ? "WARN" : "PASS",
      detail:
        asset.volatility === "Fast"
          ? "ATR expansion is elevated, so size should remain constrained."
          : "Volatility is within the prototype tolerance band.",
    },
    {
      label: "Tradeability",
      status:
        setup.tradeability === "TRADEABLE"
          ? "PASS"
          : setup.tradeability === "WATCH"
            ? "WARN"
            : "FAIL",
      detail:
        setup.tradeability === "TRADEABLE"
          ? "The setup clears current filters for protected execution."
          : setup.tradeability === "WATCH"
            ? "Keep monitoring until the trigger fully matures."
            : "The setup is blocked until regime or liquidity improves.",
    },
  ] as PersistedTradeTicket["gateResults"];
}

export function buildTradeTicketInputFromSetup(
  setupId: string,
): Omit<PersistedTradeTicket, "id" | "createdAt" | "updatedAt"> {
  const setup = getSetupById(setupId);

  if (!setup) {
    throw new Error("Setup not found");
  }

  const asset = getAssetBySymbol(setup.symbol);

  if (!asset) {
    throw new Error("Asset not found");
  }

  const entry = parseEntryZone(setup.entryZone);
  const stopLoss = parseCurrencyLabel(setup.stopLoss);
  const takeProfit = parseCurrencyLabel(setup.takeProfit);
  const maxRiskCapital = accountSize * riskPerTrade;
  const perUnitRisk = Math.max(Math.abs(entry - stopLoss), 0.01);
  const quantity = Math.max(1, Math.round(maxRiskCapital / perUnitRisk));
  const estimatedValue = Number((quantity * entry).toFixed(2));
  const plannedLoss = Number((quantity * perUnitRisk).toFixed(2));
  const potentialGain = Number((quantity * Math.abs(takeProfit - entry)).toFixed(2));
  const riskReward = Number((potentialGain / plannedLoss).toFixed(2));

  return {
    symbol: setup.symbol,
    strategy: setup.strategy,
    side: "Long",
    orderType: "Limit",
    entry,
    stopLoss,
    takeProfit,
    quantity,
    estimatedValue,
    plannedLoss,
    potentialGain,
    riskReward,
    status: "Prepared",
    rationale: `${asset.forecast} ${asset.aiBias}`,
    gateResults: buildGateResults(setup, asset),
    sourceAssetSymbol: asset.symbol,
    sourceSetupId: setup.id,
    notes: "",
  };
}
