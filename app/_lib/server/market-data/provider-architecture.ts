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
    targetPrimarySource: "ig";
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

function isExecutionSafeNow(symbol: string) {
  return getCurrentSource(symbol) === "ig";
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
    targetPrimarySource: "ig" as const,
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
        "Only permit fully automated order generation and routing when the symbol is priced from an official execution-grade provider and that provider is healthy.",
      confirmationRule:
        "Use a secondary official or public API for confidence checks, divergence detection, and market-memory enrichment before upgrading AI opportunities.",
      degradedModeRule:
        "If the execution-grade provider fails, switch the platform into research-only mode, keep charts/news alive from lower-trust sources, and require manual confirmation before any trade.",
      scrapingRule:
        "Do not use scraped website data as a primary live price source, order-routing dependency, or uptime guarantee. If website-derived data is ever used, restrict it to non-critical research enrichment where terms allow it.",
    },
  };
}
