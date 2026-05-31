import { journalEntries, tradeTickets, watchlist } from "@/app/_data/mock-data";
import type { PersistedWorkspaceData } from "./workspace-types";

const seededAt = "2026-05-31T05:30:00.000Z";

export const defaultWorkspaceData: PersistedWorkspaceData = {
  schemaVersion: 1,
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
};
