import type { MarketIntelligenceSyncSummary } from "@/app/_lib/market-data-contract";
import { readWorkspaceData, writeWorkspaceData } from "../workspace-store";
import type {
  PersistedAiOpportunity,
  PersistedConfirmationCheck,
  PersistedMarketEvent,
  PersistedWorkspaceData,
} from "../workspace-types";
import { intelligenceFeedSources, type IntelligenceFeedSource } from "./feed-sources";

const minimumIntelligenceSyncIntervalMs = 10 * 60_000;
const maxEventsToPersist = 18;
const maxSummaryWarnings = 8;

type FeedEntry = {
  id: string;
  link: string;
  publishedAt: string;
  summary: string;
  title: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/â/g, "'")
    .replace(/â/g, "'")
    .replace(/â/g, "-")
    .replace(/â/g, "-")
    .replace(/â/g, '"')
    .replace(/â/g, '"');
}

function stripTags(value: string) {
  return decodeHtml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getFirstTagValue(block: string, tagNames: string[]) {
  for (const tagName of tagNames) {
    const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
    if (match?.[1]) {
      return stripTags(match[1]);
    }
  }

  return "";
}

function getAtomLink(block: string) {
  const hrefMatch = block.match(/<link[^>]+href="([^"]+)"/i);
  return hrefMatch?.[1]?.trim() ?? "";
}

function parseFeedEntries(xml: string, source: IntelligenceFeedSource): FeedEntry[] {
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entryBlocks = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const blocks = itemBlocks.length > 0 ? itemBlocks : entryBlocks;

  return blocks
    .map((block, index) => {
      const title = getFirstTagValue(block, ["title"]);
      const summary = getFirstTagValue(block, ["description", "summary", "content"]);
      const publishedAt =
        getFirstTagValue(block, ["pubDate", "updated", "published"]) || new Date().toISOString();
      const link =
        itemBlocks.length > 0
          ? getFirstTagValue(block, ["link"])
          : getAtomLink(block);

      if (!title || !summary) {
        return null;
      }

      return {
        id: `${source.id}-${index}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`,
        link,
        publishedAt: new Date(publishedAt).toISOString(),
        summary,
        title,
      } satisfies FeedEntry;
    })
    .filter((entry): entry is FeedEntry => Boolean(entry));
}

function getRelatedSymbols(text: string) {
  const haystack = text.toLowerCase();
  const symbols = new Set<string>();

  if (/\b(ai|artificial intelligence|crypto|digital asset|token|blockchain)\b/.test(haystack)) {
    ["LINK", "RENDER", "ONDO", "AKT", "AINF", "TKNX"].forEach((symbol) => symbols.add(symbol));
  }

  if (/\b(uranium|nuclear|energy)\b/.test(haystack)) {
    ["URA", "NUKZ"].forEach((symbol) => symbols.add(symbol));
  }

  if (/\b(liquidity|rates|inflation|central bank|fomc|ecb|bank of england|federal reserve|macro)\b/.test(haystack)) {
    ["LINK", "RENDER", "ONDO", "AKT", "URA"].forEach((symbol) => symbols.add(symbol));
  }

  return [...symbols];
}

function getRelevanceScore(text: string) {
  const haystack = text.toLowerCase();
  let score = 0;

  if (/\b(rate|rates|inflation|jobs|employment|gdp|central bank|monetary|policy|liquidity|volatility|bond|capital flow)\b/.test(haystack)) {
    score += 3;
  }

  if (/\b(ai|artificial intelligence|crypto|digital asset|token|blockchain|uranium|nuclear|energy)\b/.test(haystack)) {
    score += 3;
  }

  if (/\b(conference|workshop|call for papers|citizens forum)\b/.test(haystack)) {
    score -= 1;
  }

  if (/\b(cost of living)\b/.test(haystack)) {
    score += 1;
  }

  return score;
}

function classifyBias(text: string): PersistedMarketEvent["bias"] {
  const haystack = text.toLowerCase();
  const bullishHits = [
    "rally",
    "surge",
    "cooling inflation",
    "rate cut",
    "easing",
    "supportive",
    "beats",
    "growth",
    "upgrade",
  ].filter((keyword) => haystack.includes(keyword)).length;
  const bearishHits = [
    "selloff",
    "hawkish",
    "inflation risk",
    "tariff",
    "downgrade",
    "liquidation",
    "risk-off",
    "decline",
    "warning",
  ].filter((keyword) => haystack.includes(keyword)).length;

  if (bullishHits > 0 && bearishHits > 0) {
    return "Mixed";
  }

  if (bullishHits > bearishHits) {
    return "Bullish";
  }

  if (bearishHits > bullishHits) {
    return "Bearish";
  }

  return "Neutral";
}

function classifyImpact(text: string): PersistedMarketEvent["impact"] {
  const haystack = text.toLowerCase();

  if (/\b(rate|fomc|ecb|inflation|jobs|policy|treasury|central bank)\b/.test(haystack)) {
    return "High";
  }

  if (/\b(crypto|equity|market|bond|sector|earnings|liquidity)\b/.test(haystack)) {
    return "Medium";
  }

  return "Low";
}

function classifyStatus(source: IntelligenceFeedSource, publishedAt: string): PersistedMarketEvent["status"] {
  const publishedMs = Date.parse(publishedAt);
  const now = Date.now();

  if (source.sourceType === "Calendar" && publishedMs > now) {
    return "Upcoming";
  }

  if (now - publishedMs <= 36 * 60 * 60 * 1000) {
    return "Live";
  }

  return "Recent";
}

function normalizeFeedEntry(source: IntelligenceFeedSource, entry: FeedEntry): PersistedMarketEvent {
  const combinedText = `${entry.title} ${entry.summary}`;

  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    impact: classifyImpact(combinedText),
    bias: classifyBias(combinedText),
    scope: source.scope,
    relatedSymbols: getRelatedSymbols(combinedText),
    startsAt: entry.publishedAt,
    sourceLabel: source.sourceLabel,
    sourceType: source.sourceType,
    status: classifyStatus(source, entry.publishedAt),
    createdAt: entry.publishedAt,
    updatedAt: new Date().toISOString(),
  };
}

function isRelevantEvent(event: PersistedMarketEvent) {
  const score = getRelevanceScore(`${event.title} ${event.summary}`);
  return score >= 2 || event.impact === "High";
}

async function fetchSourceEvents(source: IntelligenceFeedSource) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Signalibrium/1.0 (+market-intelligence-sync)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Source responded with ${response.status}`);
  }

  const xml = await response.text();
  const entries = parseFeedEntries(xml, source);

  return entries.map((entry) => normalizeFeedEntry(source, entry));
}

function mergeEvents(existing: PersistedMarketEvent[], incoming: PersistedMarketEvent[]) {
  const byId = new Map<string, PersistedMarketEvent>();

  for (const event of [...incoming.filter(isRelevantEvent), ...existing.filter(isRelevantEvent)]) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }

  return [...byId.values()]
    .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt))
    .slice(0, maxEventsToPersist);
}

function replaceLiveDriver(description: string, liveDriverTitle: string) {
  const cleaned = description.replace(/\s*Key live driver: .*$/i, "").trim();
  return `${cleaned} Key live driver: ${liveDriverTitle}.`.trim();
}

function replaceMarketContext(context: string, snapshotState: string) {
  let cleaned = context.trim();

  while (cleaned.startsWith(`${snapshotState}.`)) {
    cleaned = cleaned.slice(`${snapshotState}.`.length).trim();
  }

  cleaned = cleaned.replace(/^[^.]+\.\s*/i, "").trim();
  return `${snapshotState}. ${cleaned}`.trim();
}

function eventAppliesToOpportunity(
  event: PersistedMarketEvent,
  opportunity: PersistedAiOpportunity,
) {
  if (event.relatedSymbols.includes(opportunity.symbol)) {
    return true;
  }

  return event.scope === "Macro";
}

function refreshOpportunityFromEvents(
  opportunity: PersistedAiOpportunity,
  events: PersistedMarketEvent[],
  snapshotState: string,
): PersistedAiOpportunity {
  const relevantEvents = events.filter((event) => eventAppliesToOpportunity(event, opportunity)).slice(0, 2);
  let confidence = opportunity.confidence;
  let shouldWait = opportunity.action === "Wait";

  for (const event of relevantEvents) {
    if (event.bias === "Bullish") {
      confidence += opportunity.side === "Long" ? 3 : -4;
    } else if (event.bias === "Bearish") {
      confidence += opportunity.side === "Short" ? 3 : -5;
    } else if (event.bias === "Mixed") {
      confidence -= 2;
    }

    if (event.status === "Upcoming" && event.impact === "High") {
      shouldWait = true;
    }
  }

  const clampedConfidence = Math.max(35, Math.min(96, confidence));
  const topEvent = relevantEvents[0];

  return {
    ...opportunity,
    confidence: clampedConfidence,
    action: shouldWait ? "Wait" : opportunity.action,
    marketContext: replaceMarketContext(opportunity.marketContext, snapshotState).slice(0, 240),
    newsContext: topEvent
      ? `${topEvent.sourceLabel}: ${topEvent.title}. ${topEvent.summary}`.slice(0, 280)
      : opportunity.newsContext,
    updatedAt: new Date().toISOString(),
  };
}

function refreshConfirmationChecks(
  confirmationChecks: PersistedConfirmationCheck[],
  events: PersistedMarketEvent[],
) {
  return confirmationChecks.map((check) => {
    const relevantEvents = events.filter((event) => event.relatedSymbols.includes(check.symbol) || event.scope === "Macro").slice(0, 2);
    let score = check.score;

    for (const event of relevantEvents) {
      if (event.bias === "Bullish" && check.stance === "Long") {
        score += 2;
      } else if (event.bias === "Bearish" && check.stance === "Long") {
        score -= 4;
      } else if (event.bias === "Bearish" && check.stance === "Short") {
        score += 2;
      } else if (event.bias === "Bullish" && check.stance === "Short") {
        score -= 4;
      } else if (event.bias === "Mixed") {
        score -= 1;
      }
    }

    const nextScore = Math.max(35, Math.min(95, score));
    const overallStatus =
      nextScore >= 75 ? "Confirmed" : nextScore <= 52 ? "Rejected" : "Mixed";

    return {
      ...check,
      score: nextScore,
      overallStatus,
      updatedAt: new Date().toISOString(),
    } satisfies PersistedConfirmationCheck;
  });
}

function buildCachedSummary(data: PersistedWorkspaceData, message: string): MarketIntelligenceSyncSummary {
  return {
    provider: "rss",
    syncedAt: data.syncState.intelligenceLastSyncedAt,
    marketEvents: data.marketEvents,
    confirmationChecks: data.confirmationChecks,
    aiOpportunities: data.aiOpportunities,
    warnings: [
      {
        source: "SYSTEM",
        message,
      },
    ],
  };
}

export async function syncMarketIntelligence(): Promise<MarketIntelligenceSyncSummary> {
  const data = await readWorkspaceData();
  const lastSyncMs = Date.parse(data.syncState.intelligenceLastSyncedAt);

  if (Number.isFinite(lastSyncMs) && Date.now() - lastSyncMs < minimumIntelligenceSyncIntervalMs) {
    const minutesRemaining = Math.max(
      1,
      Math.ceil((minimumIntelligenceSyncIntervalMs - (Date.now() - lastSyncMs)) / 60_000),
    );

    return buildCachedSummary(
      data,
      `Intelligence sync is cooling down. The next news refresh window opens in about ${minutesRemaining} minute(s).`,
    );
  }

  const warnings: MarketIntelligenceSyncSummary["warnings"] = [];
  const incomingEvents: PersistedMarketEvent[] = [];

  const results = await Promise.allSettled(
    intelligenceFeedSources.map(async (source) => ({
      source,
      events: await fetchSourceEvents(source),
    })),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      incomingEvents.push(...result.value.events);
      continue;
    }

    warnings.push({
      source:
        result.reason instanceof Error && "source" in (result.reason as object)
          ? String((result.reason as { source?: string }).source)
          : "feed",
      message:
        result.reason instanceof Error
          ? result.reason.message
          : "Unable to sync one of the intelligence feeds.",
    });
  }

  if (incomingEvents.length === 0) {
    if (data.marketEvents.length > 0) {
      return buildCachedSummary(
        data,
        "All live intelligence feeds failed on this attempt, so Signalibrium kept the last successful event set.",
      );
    }

    throw new Error("No intelligence feeds returned usable market events.");
  }

  data.marketEvents = mergeEvents(data.marketEvents, incomingEvents);
  data.confirmationChecks = refreshConfirmationChecks(data.confirmationChecks, data.marketEvents);
  data.aiOpportunities = data.aiOpportunities.map((opportunity) =>
    refreshOpportunityFromEvents(opportunity, data.marketEvents, data.marketSnapshot.state),
  );
  data.syncState.intelligenceLastSyncedAt = new Date().toISOString();

  if (data.marketEvents[0]) {
    data.marketSnapshot.description = replaceLiveDriver(
      data.marketSnapshot.description,
      data.marketEvents[0].title,
    );
  }

  const persisted = await writeWorkspaceData(data);

  return {
    provider: "rss",
    syncedAt: persisted.syncState.intelligenceLastSyncedAt,
    marketEvents: persisted.marketEvents,
    confirmationChecks: persisted.confirmationChecks,
    aiOpportunities: persisted.aiOpportunities,
    warnings: warnings.slice(0, maxSummaryWarnings),
  };
}
