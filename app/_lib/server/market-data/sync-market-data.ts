import type {
  MarketDataPulseSummary,
  MarketDataSyncSummary,
} from "@/app/_lib/market-data-contract";
import { refreshPredictionMemory } from "../prediction-memory";
import {
  syncSiggiAccount,
  syncSiggiAccountWithOptions,
} from "../siggi-simulation";
import {
  readWorkspaceData,
  writeWorkspaceData,
} from "../workspace-store";
import type {
  PersistedAssetRecord,
  PersistedMarketSnapshot,
  PersistedSiggiTrade,
  PersistedWorkspaceData,
} from "../workspace-types";
import { roundPriceValue } from "@/app/_lib/market-prices";
import { getMarketDataAssetDefinition } from "./asset-catalog";
import { fetchLiveQuoteForSymbol, getConfiguredProviderName } from "./market-data";
import {
  sendTelegramMessage,
  formatTradeOpenedMessage,
  formatTradeClosedMessage,
} from "../telegram";

const minimumSyncIntervalMs = 65_000;
const minimumPulseIntervalMs = 12_000;

function getConfiguredProvider() {
  return getConfiguredProviderName();
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
    proxyCount > 0 ? `${proxyCount} composite symbols are using listed proxies for live pricing` : null,
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
      ? `Review ${strongest.symbol} follow-through after the live data refresh before acting on the next setup.`
      : data.marketSnapshot.journalReminder,
    updatedAt: syncedAt,
  };

  return nextSnapshot;
}

function buildUpdatedAsset(
  asset: PersistedAssetRecord,
  liveQuote: Awaited<ReturnType<typeof fetchLiveQuoteForSymbol>>,
  syncedAt: string,
) {
  const nextSeries =
    liveQuote.series.length > 1
      ? liveQuote.series
      : buildRollingSeries(asset.sparkline, liveQuote.price);
  const resolvedPrice =
    getLastPositiveValue([liveQuote.price]) ??
    getLastPositiveValue(nextSeries) ??
    getLastPositiveValue(asset.sparkline) ??
    asset.price;
  const trailingChange = getSeriesChangePercent(nextSeries);

  return {
    ...asset,
    price: roundPriceValue(resolvedPrice, asset.assetClass),
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

function getLastPositiveValue(values: number[]) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];

    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function buildRollingSeries(existingSeries: number[], latestPrice: number) {
  const usableSeries = existingSeries.filter(
    (value) => Number.isFinite(value) && value > 0,
  );

  if (usableSeries.length === 0) {
    return [latestPrice];
  }

  const nextSeries = [...usableSeries];
  const previousPrice = nextSeries[nextSeries.length - 1];
  const roundedLatestPrice = roundPriceValue(latestPrice);

  if (Math.abs(previousPrice - roundedLatestPrice) < 0.000001) {
    nextSeries[nextSeries.length - 1] = roundedLatestPrice;
    return nextSeries;
  }

  const maxPoints = Math.max(usableSeries.length, 12);
  nextSeries.push(roundedLatestPrice);

  return nextSeries.slice(-maxPoints);
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

function buildCachedPulseSummary(
  data: PersistedWorkspaceData,
  provider: string,
  message: string,
): MarketDataPulseSummary {
  return {
    provider,
    pulsedAt: data.syncState.pricePulseLastSyncedAt,
    pulsedSymbols: [],
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

function recordPricePulsePoints(
  data: PersistedWorkspaceData,
  assets: PersistedAssetRecord[],
  timestamp: string,
  symbols?: string[],
) {
  const symbolFilter = symbols ? new Set(symbols) : null;
  const nextTape = { ...data.syncState.pricePulseTape };

  for (const asset of assets) {
    if (symbolFilter && !symbolFilter.has(asset.symbol)) {
      continue;
    }

    const currentPoints = nextTape[asset.symbol] ?? [];
    const lastPoint = currentPoints[currentPoints.length - 1] ?? null;

    if (lastPoint && lastPoint.at === timestamp && Math.abs(lastPoint.price - asset.price) < 0.000001) {
      continue;
    }

    nextTape[asset.symbol] = [...currentPoints, { at: timestamp, price: asset.price }].slice(-120);
  }

  data.syncState.pricePulseTape = nextTape;
}

function getPulseSymbols(data: PersistedWorkspaceData) {
  const symbols = new Set<string>();

  for (const trade of data.siggiAccount.openTrades) {
    symbols.add(trade.symbol);
  }

  for (const record of data.predictionHistory) {
    if (record.monitoringStatus === "Active") {
      symbols.add(record.symbol);
    }
  }

  for (const setup of [...data.scannerResults].sort((left, right) => right.score - left.score)) {
    if (symbols.size >= 12) {
      break;
    }

    if (setup.tradeability === "TRADEABLE") {
      symbols.add(setup.symbol);
    }
  }

  return [...symbols];
}

/**
 * Diff Siggi's trade state before/after a sync and fire Telegram notifications
 * for any newly opened or newly closed trades.
 */
async function fireSiggiTradeNotifications(
  data: PersistedWorkspaceData,
  openIdsBefore: Set<string>,
  closedIdsBefore: Set<string>,
) {
  const notifications: Promise<void>[] = [];

  // Newly opened trades
  for (const trade of data.siggiAccount.openTrades) {
    if (!openIdsBefore.has(trade.id)) {
      const asset = data.assets.find((a) => a.symbol === trade.symbol);
      notifications.push(
        sendTelegramMessage(
          formatTradeOpenedMessage({
            symbol: trade.symbol,
            instrumentName: trade.instrumentName,
            side: trade.side,
            entryPrice: trade.entryPrice,
            stopPrice: trade.stopPrice,
            targetPrice: trade.targetPrice,
            stakeGbp: trade.stakeGbp,
            confidenceAtOpen: trade.confidenceAtOpen,
            narrative: trade.narrative,
            strategy: asset?.activeStrategy,
            timeframe: data.scannerResults.find((r) => r.symbol === trade.symbol)?.timeframe,
          }),
        ),
      );
    }
  }

  // Newly closed trades
  for (const trade of data.siggiAccount.closedTrades) {
    if (!closedIdsBefore.has(trade.id)) {
      notifications.push(
        sendTelegramMessage(
          formatTradeClosedMessage({
            symbol: trade.symbol,
            instrumentName: trade.instrumentName,
            side: trade.side,
            status: trade.status,
            entryPrice: trade.entryPrice,
            stopPrice: trade.stopPrice,
            targetPrice: trade.targetPrice,
            realizedPnlGbp: trade.realizedPnlGbp,
            openedAt: trade.openedAt,
            closedAt: trade.closedAt,
          }),
        ),
      );
    }
  }

  await Promise.allSettled(notifications);
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
      `Auto-sync is cooling down to stay inside the current provider cadence. The next refresh window opens in about ${secondsRemaining}s.`,
    );
  }

  const warnings: MarketDataSyncSummary["warnings"] = [];
  const syncedSymbols: string[] = [];
  const skippedSymbols: string[] = [];
  const nextAssets: PersistedAssetRecord[] = [];

  const syncResults = await Promise.allSettled(
    data.assets.map(async (asset) => {
      const definition = getMarketDataAssetDefinition(asset.symbol);

      if (!definition) {
        skippedSymbols.push(asset.symbol);
        warnings.push({
          symbol: asset.symbol,
          message: "No live market-data symbol mapping is configured for this asset.",
        });
        return asset;
      }

      const liveQuote = await fetchLiveQuoteForSymbol(asset.symbol);

      syncedSymbols.push(asset.symbol);

      if (definition.proxyNote) {
        warnings.push({
          symbol: asset.symbol,
          message: definition.proxyNote,
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
    const rateLimitWarning = warnings.find(
      (warning) =>
        warning.message.toLowerCase().includes("allowance") ||
        warning.message.toLowerCase().includes("rate limit"),
    );

    if (rateLimitWarning) {
      return buildCachedSyncSummary(
        data,
        provider,
        "The live-data providers are cooling down, so Signalibrium kept the last successful market snapshot and will try again on the next cycle.",
      );
    }

    throw new Error(
      warnings[0]?.message ??
        "No assets were synced. Check your market-data provider configuration and try again.",
    );
  }

  data.assets = nextAssets;
  data.marketSnapshot = buildMarketSnapshot(data, nextAssets, syncedAt);
  recordPricePulsePoints(data, nextAssets, syncedAt);
  await refreshPredictionMemory(data, syncedAt);

  // Snapshot trade state before Siggi runs so we can diff for notifications
  const openTradeIdsBefore = new Set(data.siggiAccount.openTrades.map((t) => t.id));
  const closedTradeIdsBefore = new Set(data.siggiAccount.closedTrades.map((t) => t.id));

  syncSiggiAccount(data, syncedAt);

  // Fire Telegram notifications for any new opens or closes
  await fireSiggiTradeNotifications(
    data,
    openTradeIdsBefore,
    closedTradeIdsBefore,
  );

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

export async function pulseExternalMarketData(): Promise<MarketDataPulseSummary> {
  const provider = getConfiguredProvider();
  const pulsedAt = new Date().toISOString();
  const data = await readWorkspaceData();
  const lastPulseAt = Date.parse(data.syncState.pricePulseLastSyncedAt);

  if (Number.isFinite(lastPulseAt) && Date.now() - lastPulseAt < minimumPulseIntervalMs) {
    const secondsRemaining = Math.max(
      1,
      Math.ceil((minimumPulseIntervalMs - (Date.now() - lastPulseAt)) / 1000),
    );

    return buildCachedPulseSummary(
      data,
      provider,
      `Live pulse is cooling down for about ${secondsRemaining}s so the app can stay responsive without oversampling providers.`,
    );
  }

  const pulsedSymbols = getPulseSymbols(data);
  const warnings: MarketDataPulseSummary["warnings"] = [];
  const skippedSymbols: string[] = [];

  if (pulsedSymbols.length === 0) {
    data.syncState.pricePulseLastSyncedAt = pulsedAt;
    const persisted = await writeWorkspaceData(data);

    return {
      provider,
      pulsedAt,
      pulsedSymbols: [],
      skippedSymbols: [],
      warnings,
      assets: persisted.assets,
      marketSnapshot: persisted.marketSnapshot,
    };
  }

  const nextAssets = [...data.assets];
  const assetIndexBySymbol = new Map(
    nextAssets.map((asset, index) => [asset.symbol, index] as const),
  );
  const pulseResults = await Promise.allSettled(
    pulsedSymbols.map(async (symbol) => {
      const assetIndex = assetIndexBySymbol.get(symbol);

      if (assetIndex === undefined) {
        return null;
      }

      const asset = nextAssets[assetIndex];
      const definition = getMarketDataAssetDefinition(asset.symbol);

      if (!definition) {
        skippedSymbols.push(asset.symbol);
        warnings.push({
          symbol: asset.symbol,
          message: "No live market-data symbol mapping is configured for this asset.",
        });
        return null;
      }

      const liveQuote = await fetchLiveQuoteForSymbol(asset.symbol);

      if (definition.proxyNote) {
        warnings.push({
          symbol: asset.symbol,
          message: definition.proxyNote,
        });
      }

      return {
        assetIndex,
        asset: buildUpdatedAsset(asset, liveQuote, pulsedAt),
      };
    }),
  );

  for (let index = 0; index < pulseResults.length; index += 1) {
    const result = pulseResults[index];
    const symbol = pulsedSymbols[index];

    if (result.status === "fulfilled" && result.value) {
      nextAssets[result.value.assetIndex] = result.value.asset;
      continue;
    }

    skippedSymbols.push(symbol);

    if (result.status === "rejected") {
      warnings.push({
        symbol,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : "Live pulse failed for this asset.",
      });
    }
  }

  data.assets = nextAssets;
  data.marketSnapshot = buildMarketSnapshot(data, nextAssets, pulsedAt);
  data.syncState.pricePulseLastSyncedAt = pulsedAt;
  recordPricePulsePoints(data, nextAssets, pulsedAt, pulsedSymbols);
  await refreshPredictionMemory(data, pulsedAt, {
    createNewCalls: false,
    refreshAnalyses: false,
  });
  syncSiggiAccountWithOptions(data, pulsedAt, {
    allowNewTrades: false,
  });
  const persisted = await writeWorkspaceData(data);

  return {
    provider,
    pulsedAt,
    pulsedSymbols,
    skippedSymbols,
    warnings,
    assets: persisted.assets,
    marketSnapshot: persisted.marketSnapshot,
  };
}
