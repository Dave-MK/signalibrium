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
  schemaVersion: 5,
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
  marketEvents: [
    {
      id: "event-fed-tone",
      title: "Policy tone still the dominant macro driver",
      summary:
        "Risk assets remain sensitive to policy-path repricing. A softer tone supports AI-beta continuation, while a hawkish surprise would likely compress the highest-multiple names first.",
      impact: "High",
      bias: "Mixed",
      scope: "Macro",
      relatedSymbols: ["LINK", "RENDER", "ONDO"],
      startsAt: "2026-06-04T18:00:00.000Z",
      sourceLabel: "Macro Calendar",
      sourceType: "Calendar",
      status: "Upcoming",
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "event-ai-beta-flow",
      title: "AI-beta rotation remains supportive",
      summary:
        "The highest-ranked AI-linked crypto names are still showing stronger participation than the defensive basket, keeping upside breakouts more actionable than mean-reversion shorts for now.",
      impact: "Medium",
      bias: "Bullish",
      scope: "Sector",
      relatedSymbols: ["LINK", "RENDER", "AKT"],
      startsAt: "2026-06-03T07:00:00.000Z",
      sourceLabel: "Flow Monitor",
      sourceType: "Flow",
      status: "Live",
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "event-uranium-pause",
      title: "Uranium proxies still constructive but less urgent",
      summary:
        "URA and the nuclear proxy complex remain structurally firm, but current momentum is flatter than the leading AI-beta basket. This supports selective watchlisting rather than aggressive fresh entries.",
      impact: "Low",
      bias: "Neutral",
      scope: "Sector",
      relatedSymbols: ["URA", "NUKZ"],
      startsAt: "2026-06-03T06:30:00.000Z",
      sourceLabel: "Sector Research",
      sourceType: "News",
      status: "Recent",
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ],
  confirmationChecks: [
    {
      id: "confirm-link-breakout",
      symbol: "LINK",
      stance: "Long",
      summary:
        "Trend, participation, and replay evidence are all aligned enough to keep LINK in the confirmed long bucket.",
      score: 84,
      overallStatus: "Confirmed",
      linkedScannerResultId: "setup-link-trend",
      checks: [
        {
          label: "Trend Structure",
          status: "Confirmed",
          detail: "Higher highs and higher lows remain intact on the active timeframe.",
        },
        {
          label: "Backtest Memory",
          status: "Confirmed",
          detail: "The linked breakout playbook retains acceptable drawdown versus reward.",
        },
        {
          label: "News Context",
          status: "Mixed",
          detail: "Macro sensitivity is elevated, so timing still matters around event windows.",
        },
      ],
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "confirm-render-momentum",
      symbol: "RENDER",
      stance: "Long",
      summary:
        "RENDER remains strong, but volatility is high enough that confirmation is good rather than perfect.",
      score: 78,
      overallStatus: "Mixed",
      linkedScannerResultId: "setup-render-breakout",
      checks: [
        {
          label: "Trend Structure",
          status: "Confirmed",
          detail: "Momentum leadership remains clear across the active session.",
        },
        {
          label: "Liquidity",
          status: "Confirmed",
          detail: "Participation remains deep enough for planned execution.",
        },
        {
          label: "Risk Stability",
          status: "Mixed",
          detail: "Fast ATR keeps stop placement and size discipline critical.",
        },
      ],
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "confirm-ura-patience",
      symbol: "URA",
      stance: "Neutral",
      summary:
        "URA has not failed, but it also is not yet giving the same confirmation density as the leading basket.",
      score: 61,
      overallStatus: "Mixed",
      linkedScannerResultId: null,
      checks: [
        {
          label: "Trend Structure",
          status: "Mixed",
          detail: "Structure is constructive but not currently accelerating.",
        },
        {
          label: "Relative Strength",
          status: "Rejected",
          detail: "Relative leadership trails the stronger crypto names.",
        },
        {
          label: "Macro Fit",
          status: "Confirmed",
          detail: "The broader thematic backdrop remains acceptable.",
        },
      ],
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ],
  aiOpportunities: [
    {
      id: "opportunity-link-long",
      symbol: "LINK",
      side: "Long",
      title: "Confirmed breakout continuation",
      summary:
        "Best current long. Structure, replay memory, and live participation are aligned well enough to justify a prepared order plan.",
      confidence: 84,
      action: "Buy",
      entryPlan: "18.10 - 18.35 on controlled pullback",
      stopPlan: "Below 17.42 structure support",
      targetPlan: "19.40 first target / 20.10 extension",
      expectedMove: "+6.2% if trend continuation holds",
      invalidation: "Lose pullback support and fail to reclaim the breakout shelf.",
      marketContext: "Risk-on rotation still favours AI-beta leaders.",
      newsContext: "Macro calendar risk is near enough that timing matters, but not enough to cancel the setup.",
      confirmationContext: "Confirmed by trend structure, backtest memory, and acceptable liquidity.",
      linkedScannerResultId: "setup-link-trend",
      linkedBacktestId: "bt-link-trend",
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "opportunity-render-long",
      symbol: "RENDER",
      side: "Long",
      title: "Momentum leader with higher volatility",
      summary:
        "Strong opportunity, but it requires stricter position sizing than LINK because of faster ATR and sharper intraday swings.",
      confidence: 78,
      action: "Buy",
      entryPlan: "Buy strength only on clean continuation through resistance",
      stopPlan: "Place below the last higher low, allow for wider volatility bands",
      targetPlan: "Trend extension target above 11.00",
      expectedMove: "+7.8% if momentum persists",
      invalidation: "Momentum stalls and price loses the higher-low structure.",
      marketContext: "Still one of the cleanest upside names in the live basket.",
      newsContext: "No direct negative catalyst in the current desk memory, but macro sensitivity stays elevated.",
      confirmationContext: "Trend and liquidity confirm; volatility keeps the overall rating below top tier.",
      linkedScannerResultId: "setup-render-breakout",
      linkedBacktestId: "bt-render-breakout",
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: "opportunity-ura-wait",
      symbol: "URA",
      side: "Long",
      title: "Watch, not chase",
      summary:
        "URA remains constructive, but confirmation is incomplete. Better to keep it on watch than force a new order here.",
      confidence: 61,
      action: "Wait",
      entryPlan: "Wait for renewed momentum or a tighter pullback into support",
      stopPlan: "Would sit under the refreshed support zone once a valid entry appears",
      targetPlan: "No active target until a cleaner trigger forms",
      expectedMove: "Opportunity quality improves if relative strength returns",
      invalidation: "Continued drift lower versus the stronger leadership basket.",
      marketContext: "Constructive but secondary relative to the leading AI-beta names.",
      newsContext: "Theme remains intact, but there is no urgent catalyst demanding immediate action.",
      confirmationContext: "Mixed overall: acceptable macro fit, weaker current confirmation.",
      linkedScannerResultId: null,
      linkedBacktestId: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ],
};
