import {
  backtests as prototypeBacktests,
  getAssetBySymbol,
  journalEntries,
  marketSnapshot,
  setups,
  tradeTickets,
  watchlist,
} from "@/app/_data/mock-data";
import type { PersistedWorkspaceData } from "./workspace-types";

const seededAt = "2026-05-31T05:30:00.000Z";

export const defaultWorkspaceData: PersistedWorkspaceData = {
  schemaVersion: 2,
  updatedAt: seededAt,
  workspace: {
    id: "workspace-signalibrium-mvp",
    name: "Signalibrium MVP Workspace",
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  watchlists: [
    {
      id: "watchlist-core",
      name: "Core Watchlist",
      description: "Seeded from the current prototype asset universe.",
      itemSymbols: watchlist.map((asset) => asset.symbol),
      isDefault: true,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ],
  tradeTickets: tradeTickets.map((ticket) => ({
    ...ticket,
    sourceAssetSymbol: ticket.symbol,
    sourceSetupId: null,
    notes: "",
    createdAt: seededAt,
    updatedAt: seededAt,
  })),
  journalEntries: journalEntries.map((entry) => ({
    ...entry,
    ticketId: null,
    createdAt: seededAt,
    updatedAt: seededAt,
  })),
  assets: watchlist.map((asset) => ({
    ...asset,
    source: "seed",
    lastSyncedAt: seededAt,
    createdAt: seededAt,
    updatedAt: seededAt,
  })),
  scannerResults: setups.map((setup) => {
    const linkedBacktest = prototypeBacktests.find(
      (backtest) => backtest.asset === setup.symbol && backtest.strategy === setup.strategy,
    );
    const linkedAsset = getAssetBySymbol(setup.symbol);

    return {
      ...setup,
      thesis: linkedAsset?.forecast ?? `${setup.symbol} remains aligned with ${setup.strategy}.`,
      linkedAssetSymbol: setup.symbol,
      linkedBacktestId: linkedBacktest?.id ?? null,
      createdAt: seededAt,
      updatedAt: seededAt,
    };
  }),
  backtests: prototypeBacktests.map((backtest) => {
    const linkedScannerResult = setups.find(
      (setup) => setup.symbol === backtest.asset && setup.strategy === backtest.strategy,
    );

    return {
      ...backtest,
      timeframe: linkedScannerResult?.timeframe ?? "4H",
      dateRange: "01 Jan 2025 - 31 May 2026",
      startingCapital: 100000,
      feesBps: 12,
      slippageBps: 18,
      aiRead: "Edge intact",
      status: "BACKTESTED",
      linkedAssetSymbol: backtest.asset,
      linkedScannerResultId: linkedScannerResult?.id ?? null,
      createdAt: seededAt,
      updatedAt: seededAt,
    };
  }),
  marketSnapshot: {
    id: "market-snapshot-primary",
    ...marketSnapshot,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
};
