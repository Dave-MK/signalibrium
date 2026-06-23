import type { PersistedMarketEvent } from "@/app/_lib/server/workspace-types";

interface FngResponse {
  data: Array<{ value: string; value_classification: string; timestamp: string }>;
}

function fngImpact(score: number): PersistedMarketEvent["impact"] {
  if (score <= 20 || score >= 80) return "High";
  if (score <= 35 || score >= 65) return "Medium";
  return "Low";
}

function fngBias(score: number): PersistedMarketEvent["bias"] {
  if (score >= 55) return "Bullish";
  if (score <= 45) return "Bearish";
  return "Neutral";
}

function fngSummary(score: number, label: string): string {
  if (score >= 75) return `Extreme Greed (${score}/100) — crowd over-positioned long; risk of sharp reversal on any negative catalyst.`;
  if (score >= 55) return `Greed (${score}/100) — ${label.toLowerCase()} sentiment; momentum favours risk assets but complacency risk rising.`;
  if (score <= 25) return `Extreme Fear (${score}/100) — panic positioning; potential mean-reversion bounce opportunity for contrarian longs.`;
  if (score <= 45) return `Fear (${score}/100) — ${label.toLowerCase()} sentiment; risk aversion elevated, safe-haven flows likely.`;
  return `Neutral (${score}/100) — no strong crowd lean; let price action lead.`;
}

export async function ingestSentimentData(
  existingEvents: PersistedMarketEvent[],
  syncedAt: string,
): Promise<PersistedMarketEvent[]> {
  // Run once per 4 hours — skip if a recent sentiment event exists
  const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
  const recentSentiment = existingEvents.find(
    (e) => e.sourceLabel === "Fear & Greed Index" && Date.parse(e.updatedAt) > fourHoursAgo,
  );
  if (recentSentiment) return existingEvents;

  let fngScore: number | null = null;
  let fngLabel = "Unknown";

  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const json = (await res.json()) as FngResponse;
      const entry = json?.data?.[0];
      if (entry) {
        fngScore = Number(entry.value);
        fngLabel = entry.value_classification ?? "Unknown";
      }
    }
  } catch {
    // Network failure — skip silently, sentiment is optional data
  }

  const events = existingEvents.filter((e) => e.sourceLabel !== "Fear & Greed Index");

  if (fngScore !== null && Number.isFinite(fngScore)) {
    const fngEvent: PersistedMarketEvent = {
      id: `sentiment-fng-${syncedAt}`,
      title: `Fear & Greed Index: ${fngLabel} (${fngScore}/100)`,
      summary: fngSummary(fngScore, fngLabel),
      impact: fngImpact(fngScore),
      bias: fngBias(fngScore),
      scope: "Macro",
      status: "Recent",
      sourceType: "Flow",
      sourceLabel: "Fear & Greed Index",
      relatedSymbols: ["BTCUSD", "SPX500", "NAS100", "XAUUSD", "EURUSD"],
      startsAt: syncedAt,
      createdAt: syncedAt,
      updatedAt: syncedAt,
    };
    events.push(fngEvent);
  }

  return events;
}
