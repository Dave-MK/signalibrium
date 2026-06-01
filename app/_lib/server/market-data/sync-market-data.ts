import type { MarketDataSyncSummary } from "@/app/_lib/market-data-contract";
import {
  readWorkspaceData,
  writeWorkspaceData,
} from "../workspace-store";
import type {
  PersistedAssetRecord,
  PersistedMarketSnapshot,
  PersistedWorkspaceData,
} from "../workspace-types";
import { getMarketDataAssetDefinition } from "./asset-catalog";
import { fetchLiveQuoteForSymbol, fetchLiveSeriesForSymbol } from "./twelve-data";

const minimumSyncIntervalMs = 65_000;

function getConfiguredProvider() {
  const provider =
    process.env.SIGNALIBRIUM_MARKET_DATA_PROVIDER?.trim().toLowerCase() ?? "twelvedata";

  if (provider !== "twelvedata") {
    throw new Error(
      `Unsupported market-data provider "${provider}". Signalibrium currently supports "twelvedata" only.`,
    );
  }

  return provider;
}

function formatSyncTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getSeriesChangePercent(series: number[]) {
  const first = series[0];
  const last = series[series.length - 1];

  if (!first || !last) {
    return 0;
  }

  return ((last - first) / first) * 100;
}

function buildAtr(series: number[], fallback: number) {
  if (series.length < 2) {
    return fallback;
  }

  const averageMove =
    series
      .slice(1)
      .map((value, index) => Math.abs(value - series[index]))
      .reduce((total, value) => total + value, 0) /
    (series.length - 1);

  return Number(averageMove.toFixed(2));
}

function buildVolatility(series: number[]) {
  if (series.length < 2) {
    return "Contained" as const;
  }

  const averagePercentMove =
    series
      .slice(1)
      .map((value, index) => Math.abs(((value - series[index]) / series[index]) * 100))
      .reduce((total, value) => total + value, 0) /
    (series.length - 1);

  if (averagePercentMove >= 5) {
    return "Fast" as const;
  }

  if (averagePercentMove >= 2.25) {
    return "Elevated" as const;
  }

  return "Contained" as const;
}

function buildRegime(changePercent: number, trailingChange: number) {
  const momentum = changePercent + trailingChange;

  if (momentum >= 6) {
    return "Risk-On" as const;
  }

  if (momentum <= -4) {
    return "Risk-Off" as const;
  }

  return "Balanced" as const;
}

function buildForecast(
  asset: PersistedAssetRecord,
  changePercent: number,
  trailingChange: number,
) {
  if (changePercent >= 3 && trailingChange >= 4) {
    return `${asset.symbol} is pressing higher with constructive short-term momentum and a supportive trailing trend.`;
  }

  if (changePercent <= -3 && trailingChange <= -4) {
    return `${asset.symbol} is losing short-term structure, so new entries should wait for price stability before re-rating the setup.`;
  }

  return `${asset.symbol} is rotating inside a more mixed tape, so execution quality matters more than raw speed.`;
}

function buildMarketSnapshot(
  data: PersistedWorkspaceData,
  assets: PersistedAssetRecord[],
  syncedAt: string,
) {
  const sortedByChange = [...assets].sort((left, right) => right.change24h - left.change24h);
  const advancers = assets.filter((asset) => asset.change24h > 0).length;
  const averageChange =
    assets.reduce((total, asset) => total + asset.change24h, 0) / Math.max(assets.length, 1);
  const breadthScore = clamp(
    Math.round((advancers / Math.max(assets.length, 1)) * 100),
    0,
    100,
  );
  const state =
    breadthScore >= 67
      ? "Measured risk-on rotation"
      : breadthScore <= 38
        ? "Defensive risk-off tape"
        : "Balanced rotation";
  const strongest = sortedByChange[0];
  const weakest = sortedByChange[sortedByChange.length - 1];
  const proxyCount = assets.filter((asset) => {
    const definition = getMarketDataAssetDefinition(asset.symbol);
    return Boolean(definition?.proxyNote);
  }).length;
  const fastAssets = assets.filter((asset) => asset.volatility === "Fast").length;
  const elevatedAssets = assets.filter((asset) => asset.volatility === "Elevated").length;
  const tradeableSetups = data.scannerResults.filter(
    (result) => result.tradeability === "TRADEABLE",
  ).length;
  const blockedSetups = data.scannerResults.filter(
    (result) => result.tradeability === "BLOCKED",
  ).length;

  const descriptionParts = [
    strongest
      ? `${strongest.symbol} is leading the synced watchlist at ${formatSignedPercent(strongest.change24h)}`
      : null,
    weakest
      ? `${weakest.symbol} is lagging at ${formatSignedPercent(weakest.change24h)}`
      : null,
    proxyCount > 0 ? `${proxyCount} composite symbols are using listed proxies for live pricing.` : null,
  ].filter(Boolean);

  const nextSnapshot: PersistedMarketSnapshot = {
    ...data.marketSnapshot,
    state,
    description: `${descriptionParts.join(". ")}${descriptionParts.length ? "." : ""}`,
    breadthScore,
    tradeableSetups,
    blockedSetups,
    watchlistMove: Number(averageChange.toFixed(2)),
    openRisk: Number(clamp(1 + fastAssets * 0.35 + elevatedAssets * 0.15, 0.8, 4.2).toFixed(2)),
    lastRefresh: formatSyncTimestamp(syncedAt),
    journalReminder: strongest
      ? `Review ${strongest.symbol} follow-through after the live data refresh before accepting the next ticket.`
      : data.marketSnapshot.journalReminder,
    updatedAt: syncedAt,
  };

  return nextSnapshot;
}

function buildUpdatedAsset(
  asset: PersistedAssetRecord,
  liveQuote:
    | Awaited<ReturnType<typeof fetchLiveQuoteForSymbol>>
    | Awaited<ReturnType<typeof fetchLiveSeriesForSymbol>>,
  syncedAt: string,
) {
  const nextSeries = liveQuote.series.length > 1 ? liveQuote.series : asset.sparkline;
  const trailingChange = getSeriesChangePercent(nextSeries);

  return {
    ...asset,
    price: Number(liveQuote.price.toFixed(asset.assetClass === "Crypto" ? 4 : 2)),
    change24h: Number(liveQuote.changePercent.toFixed(2)),
    sparkline: nextSeries,
    atr: buildAtr(nextSeries, asset.atr),
    volatility: buildVolatility(nextSeries),
    regime: buildRegime(liveQuote.changePercent, trailingChange),
    forecast: buildForecast(asset, liveQuote.changePercent, trailingChange),
    source: "sync" as const,
    lastSyncedAt: syncedAt,
    updatedAt: syncedAt,
  };
}

function buildCachedSyncSummary(
  data: PersistedWorkspaceData,
  provider: string,
  message: string,
): MarketDataSyncSummary {
  return {
    provider,
    syncedAt: data.marketSnapshot.updatedAt,
    syncedSymbols: [],
    skippedSymbols: [],
    warnings: [
      {
        symbol: "SYSTEM",
        message,
      },
    ],
    assets: data.assets,
    marketSnapshot: data.marketSnapshot,
  };
}

function getSparklineRefreshSymbol(data: PersistedWorkspaceData) {
  if (data.assets.length === 0) {
    return null;
  }

  const cursor = data.syncState.sparklineCursor % data.assets.length;
  return data.assets[cursor]?.symbol ?? null;
}

export async function syncExternalMarketData(): Promise<MarketDataSyncSummary> {
  const provider = getConfiguredProvider();
  const syncedAt = new Date().toISOString();
  const data = await readWorkspaceData();
  const lastSuccessfulSyncAt = Date.parse(data.marketSnapshot.updatedAt);

  if (
    Number.isFinite(lastSuccessfulSyncAt) &&
    Date.now() - lastSuccessfulSyncAt < minimumSyncIntervalMs
  ) {
    const secondsRemaining = Math.max(
      1,
      Math.ceil((minimumSyncIntervalMs - (Date.now() - lastSuccessfulSyncAt)) / 1000),
    );

    return buildCachedSyncSummary(
      data,
      provider,
      `Auto-sync is cooling down to stay inside the free-tier provider limit. Next live refresh window opens in about ${secondsRemaining}s.`,
    );
  }

  const warnings: MarketDataSyncSummary["warnings"] = [];
  const syncedSymbols: string[] = [];
  const skippedSymbols: string[] = [];
  const nextAssets: PersistedAssetRecord[] = [];
  const sparklineRefreshSymbol = getSparklineRefreshSymbol(data);

  const syncResults = await Promise.allSettled(
    data.assets.map(async (asset) => {
      const definition = getMarketDataAssetDefinition(asset.symbol);

      if (!definition?.providerSymbol || !definition.providerType) {
        skippedSymbols.push(asset.symbol);
        warnings.push({
          symbol: asset.symbol,
          message: "No live market-data symbol mapping is configured for this asset.",
        });
        return asset;
      }

      const liveQuote =
        sparklineRefreshSymbol === asset.symbol
          ? await fetchLiveSeriesForSymbol(asset.symbol)
          : await fetchLiveQuoteForSymbol(asset.symbol);

      syncedSymbols.push(asset.symbol);

      if (definition.proxyNote) {
        warnings.push({
          symbol: asset.symbol,
          message: definition.proxyNote,
        });
      }

      if (sparklineRefreshSymbol === asset.symbol) {
        warnings.push({
          symbol: asset.symbol,
          message:
            "Refreshed this asset with a full trailing time series on this sync to keep free-tier sparkline data rotating.",
        });
      }

      return buildUpdatedAsset(asset, liveQuote, syncedAt);
    }),
  );

  for (let index = 0; index < syncResults.length; index += 1) {
    const asset = data.assets[index];
    const result = syncResults[index];

    if (result.status === "fulfilled") {
      nextAssets.push(result.value);
      continue;
    }

    skippedSymbols.push(asset.symbol);
    nextAssets.push(asset);
    warnings.push({
      symbol: asset.symbol,
      message:
        result.reason instanceof Error
          ? result.reason.message
          : "Live market-data sync failed for this asset.",
    });
  }

  if (syncedSymbols.length === 0) {
    const rateLimitWarning = warnings.find((warning) =>
      warning.message.toLowerCase().includes("api credits"),
    );

    if (rateLimitWarning) {
      return buildCachedSyncSummary(
        data,
        provider,
        "Auto-sync hit the provider credit cap for this minute, so Signalibrium kept the last successful market snapshot and will try again on the next cycle.",
      );
    }

    throw new Error(
      warnings[0]?.message ??
        "No assets were synced. Check your market-data provider configuration and try again.",
    );
  }

  data.assets = nextAssets;
  data.syncState.sparklineCursor =
    data.assets.length > 0
      ? (data.syncState.sparklineCursor + 1) % data.assets.length
      : 0;
  data.marketSnapshot = buildMarketSnapshot(data, nextAssets, syncedAt);

  const persisted = await writeWorkspaceData(data);

  return {
    provider,
    syncedAt,
    syncedSymbols,
    skippedSymbols,
    warnings,
    assets: persisted.assets,
    marketSnapshot: persisted.marketSnapshot,
  };
}
