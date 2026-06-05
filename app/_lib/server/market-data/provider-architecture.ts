import { getMarketDataAssetDefinition, listMarketDataAssetDefinitions } from "./asset-catalog";
import { getConfiguredProviderName } from "./market-data";
import type { MarketDataProviderName } from "./provider-types";

export type ProviderTrustLevel = "official" | "public_api" | "unofficial";
export type ProviderRole =
  | "execution_truth"
  | "price_confirmation"
  | "charting_enrichment"
  | "research_only";

export type ProviderAutomationPolicy =
  | "full_auto_allowed"
  | "manual_confirmation_required"
  | "display_or_research_only";

export type MarketDataProviderArchitecture = {
  key: Exclude<MarketDataProviderName, "hybrid">;
  name: string;
  trustLevel: ProviderTrustLevel;
  supportsExecution: boolean;
  supportsStreaming: boolean;
  supportsHistoricalCandles: boolean;
  currentUsage: ProviderRole[];
  targetUsage: ProviderRole[];
  automationPolicy: ProviderAutomationPolicy;
  currentState: "enabled" | "available_but_not_configured" | "use_with_caution";
  notes: string[];
};

export type MarketDataMeshSummary = {
  configuredProvider: MarketDataProviderName;
  generatedAt: string;
  providers: MarketDataProviderArchitecture[];
  symbolPolicies: Array<{
    symbol: string;
    currentSource: Exclude<MarketDataProviderName, "hybrid">;
    currentAutomationPolicy: ProviderAutomationPolicy;
    targetPrimarySource: "provider_mesh";
    targetExecutionVenue: "ibkr" | "ig" | "manual";
    requiresBrokerConfirmation: boolean;
    executionSafeNow: boolean;
    migrationPriority: "high" | "medium";
  }>;
  platformPolicy: {
    tradeAutomationRule: string;
    confirmationRule: string;
    degradedModeRule: string;
    scrapingRule: string;
  };
};

const providerCatalog: Record<
  Exclude<MarketDataProviderName, "hybrid">,
  Omit<MarketDataProviderArchitecture, "currentState">
> = {
  ig: {
    key: "ig",
    name: "IG Labs / IG Trading API",
    trustLevel: "official",
    supportsExecution: true,
    supportsStreaming: true,
    supportsHistoricalCandles: true,
    currentUsage: ["execution_truth", "charting_enrichment"],
    targetUsage: ["execution_truth", "price_confirmation", "charting_enrichment"],
    automationPolicy: "full_auto_allowed",
    notes: [
      "Use as the source of truth for executable prices, account state, and order routing.",
      "Use the streaming API for live prices and the REST API for recovery, metadata, and snapshots.",
      "If IG is unavailable, the platform should switch to research mode rather than silently auto-trading from a weaker source.",
    ],
  },
  coinbase: {
    key: "coinbase",
    name: "Coinbase Exchange",
    trustLevel: "official",
    supportsExecution: false,
    supportsStreaming: true,
    supportsHistoricalCandles: true,
    currentUsage: ["price_confirmation", "charting_enrichment"],
    targetUsage: ["price_confirmation", "charting_enrichment"],
    automationPolicy: "manual_confirmation_required",
    notes: [
      "Use as the primary crypto market-data rail for public real-time prices and official candles.",
      "The public WebSocket feed is appropriate for live crypto monitoring and significantly stronger than rate-limited aggregator snapshots.",
      "This feed improves timing and replay accuracy, but it is still separate from broker execution and should be confirmed before live order routing.",
    ],
  },
  kraken: {
    key: "kraken",
    name: "Kraken",
    trustLevel: "official",
    supportsExecution: false,
    supportsStreaming: true,
    supportsHistoricalCandles: true,
    currentUsage: ["price_confirmation", "charting_enrichment"],
    targetUsage: ["price_confirmation", "charting_enrichment"],
    automationPolicy: "manual_confirmation_required",
    notes: [
      "Use as the secondary official crypto market-data rail when Coinbase does not list or cleanly resolve a symbol.",
      "Kraken's public ticker stream and OHLC endpoints improve long-tail crypto coverage without falling straight to aggregator APIs.",
      "This improves monitoring resilience, but it still remains a market-data rail rather than the final execution venue.",
    ],
  },
  coingecko: {
    key: "coingecko",
    name: "CoinGecko",
    trustLevel: "public_api",
    supportsExecution: false,
    supportsStreaming: false,
    supportsHistoricalCandles: true,
    currentUsage: ["price_confirmation", "charting_enrichment"],
    targetUsage: ["price_confirmation", "research_only"],
    automationPolicy: "manual_confirmation_required",
    notes: [
      "Good for crypto market breadth, secondary confirmation, and historical enrichment.",
      "Not suitable as the sole execution-grade feed for a live trading engine.",
      "Use to detect source divergence and to enrich the AI memory layer rather than to place trades directly.",
    ],
  },
  yahoo: {
    key: "yahoo",
    name: "Yahoo Finance",
    trustLevel: "unofficial",
    supportsExecution: false,
    supportsStreaming: false,
    supportsHistoricalCandles: true,
    currentUsage: ["charting_enrichment", "research_only"],
    targetUsage: ["research_only"],
    automationPolicy: "display_or_research_only",
    notes: [
      "Keep out of automated execution logic and do not treat it as a contractual uptime layer.",
      "Use only as a temporary research/chart fallback while replacing affected symbols with licensed official feeds.",
      "The long-term goal is to remove Yahoo-dependent live decisioning from the core stack.",
    ],
  },
};

function getProviderCurrentState(
  provider: Exclude<MarketDataProviderName, "hybrid">,
): MarketDataProviderArchitecture["currentState"] {
  if (provider === "ig") {
    return process.env.SIGNALIBRIUM_IG_API_KEY?.trim()
      ? "enabled"
      : "available_but_not_configured";
  }

  if (provider === "coingecko") {
    return "enabled";
  }

  if (provider === "coinbase") {
    return "enabled";
  }

  if (provider === "kraken") {
    return "enabled";
  }

  return "use_with_caution";
}

function getCurrentSource(symbol: string) {
  const definition = getMarketDataAssetDefinition(symbol);
  return definition?.marketDataSource ?? "ig";
}

function getCurrentAutomationPolicy(symbol: string): ProviderAutomationPolicy {
  const source = getCurrentSource(symbol);
  return providerCatalog[source].automationPolicy;
}

function getTargetExecutionVenue(symbol: string): "ibkr" | "ig" | "manual" {
  const source = getCurrentSource(symbol);

  if (source === "ig") {
    return "ig";
  }

  return "ibkr";
}

function requiresBrokerConfirmation(symbol: string) {
  return getCurrentSource(symbol) !== "ig";
}

function isExecutionSafeNow(symbol: string) {
  return !requiresBrokerConfirmation(symbol);
}

function getMigrationPriority(symbol: string): "high" | "medium" {
  return getCurrentSource(symbol) === "ig" ? "medium" : "high";
}

export function getMarketDataMeshSummary(): MarketDataMeshSummary {
  const configuredProvider = getConfiguredProviderName();
  const providers = (Object.keys(providerCatalog) as Array<
    Exclude<MarketDataProviderName, "hybrid">
  >).map((key) => ({
    ...providerCatalog[key],
    currentState: getProviderCurrentState(key),
  }));

  const symbolPolicies = listMarketDataAssetDefinitions().map((definition) => ({
    symbol: definition.symbol,
    currentSource: getCurrentSource(definition.symbol),
    currentAutomationPolicy: getCurrentAutomationPolicy(definition.symbol),
    targetPrimarySource: "provider_mesh" as const,
    targetExecutionVenue: getTargetExecutionVenue(definition.symbol),
    requiresBrokerConfirmation: requiresBrokerConfirmation(definition.symbol),
    executionSafeNow: isExecutionSafeNow(definition.symbol),
    migrationPriority: getMigrationPriority(definition.symbol),
  }));

  return {
    configuredProvider,
    generatedAt: new Date().toISOString(),
    providers,
    symbolPolicies,
    platformPolicy: {
      tradeAutomationRule:
        "Use the research mesh to rank and analyse opportunities, but route orders only through a healthy execution venue with broker-confirmed prices and account state.",
      confirmationRule:
        "Use secondary sources for divergence checks, breadth, and AI memory, then confirm the final entry, stop, and target against the execution rail before trade placement.",
      degradedModeRule:
        "If the active execution venue fails, keep the research mesh running, switch the desk into broker-confirmation mode, and avoid silently auto-routing from a lower-trust feed.",
      scrapingRule:
        "Do not use scraped website data as a primary live price source, order-routing dependency, or uptime guarantee. If website-derived data is ever used, restrict it to non-critical research enrichment where terms allow it.",
    },
  };
}
