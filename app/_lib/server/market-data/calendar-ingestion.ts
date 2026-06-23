import type { PersistedMarketEvent } from "../workspace-types";

// Nasdaq public economic calendar — no API key required
const NASDAQ_CALENDAR_URL = "https://api.nasdaq.com/api/calendar/economicevents";

type NasdaqRow = {
  gmt?: string;
  country?: string;
  eventName?: string;
  importance?: string; // "HIGH" | "MODERATE" | "LOW"
  date?: string;       // YYYY-MM-DD
};

type NasdaqPayload = {
  data?: { rows?: NasdaqRow[] };
};

function importanceToImpact(raw: string | undefined): PersistedMarketEvent["impact"] {
  const s = (raw ?? "").toUpperCase();
  if (s === "HIGH")     return "High";
  if (s === "MODERATE") return "Medium";
  return "Low";
}

// Keywords that signal a macro-level event
const MACRO_KEYWORDS = [
  "fomc", "federal reserve", "fed ", "interest rate", "cpi", "inflation",
  "nfp", "nonfarm", "non-farm", "gdp", "ecb", "boe", "bank of england",
  "bank of canada", "rba ", "rbnz", "boj", "unemployment", "payroll",
  "retail sales", "pce", "pmi", "ism ", "trade balance", "debt ceiling",
];

function classifyScope(name: string): PersistedMarketEvent["scope"] {
  const n = name.toLowerCase();
  if (MACRO_KEYWORDS.some((k) => n.includes(k))) return "Macro";
  if (n.includes("oil") || n.includes("crude") || n.includes("energy")) return "Sector";
  return "Macro"; // default calendar events to Macro
}

// Guess directional bias from event name — conservative defaults
function guessBias(name: string, country: string): PersistedMarketEvent["bias"] {
  const n = name.toLowerCase();
  if (n.includes("rate hike") || n.includes("hawkish")) return "Bearish"; // risk-off
  if (n.includes("rate cut")  || n.includes("dovish"))  return "Bullish"; // risk-on
  return "Mixed"; // most calendar events could go either way
}

// Symbols that are universally affected by major macro events
const MACRO_SYMBOLS = ["XAUUSD", "BTCUSD", "SPX500", "GBPUSD", "EURUSD"];

async function fetchNasdaqCalendar(date: string): Promise<NasdaqRow[]> {
  try {
    const url = `${NASDAQ_CALENDAR_URL}?date=${date}&daterange=week`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as NasdaqPayload;
    return data?.data?.rows ?? [];
  } catch {
    return [];
  }
}

export async function ingestEconomicCalendar(
  existingEvents: PersistedMarketEvent[],
  now: string,
): Promise<PersistedMarketEvent[]> {
  const today = now.slice(0, 10); // YYYY-MM-DD

  // Only run once per day — skip if we already have calendar events added today
  const alreadySynced = existingEvents.some(
    (e) => e.sourceType === "Calendar" && e.updatedAt.slice(0, 10) === today,
  );
  if (alreadySynced) return existingEvents;

  // Fetch the current week's events
  const rows = await fetchNasdaqCalendar(today);

  // Only keep High and Moderate importance events from US and UK
  const relevant = rows.filter(
    (r) =>
      r.eventName &&
      r.importance &&
      ["HIGH", "MODERATE"].includes(r.importance.toUpperCase()) &&
      ["US", "UK", "EU", "GB"].includes((r.country ?? "").toUpperCase()),
  );

  if (relevant.length === 0) return existingEvents;

  const nowMs = Date.parse(now);
  const existingTitles = new Set(existingEvents.map((e) => e.title.toLowerCase().slice(0, 55)));

  const newEvents: PersistedMarketEvent[] = relevant
    .filter((r) => !existingTitles.has((r.eventName ?? "").toLowerCase().slice(0, 55)))
    .map((r) => {
      const name    = r.eventName ?? "Economic Event";
      const eventMs = r.date ? Date.parse(`${r.date}T${r.gmt ?? "12:00"}:00Z`) : nowMs;
      const status: PersistedMarketEvent["status"] =
        eventMs > nowMs + 60_000 ? "Upcoming"
        : eventMs > nowMs - 3_600_000 ? "Live"
        : "Recent";

      return {
        id: `cal-${r.date ?? today}-${name.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`,
        title: name.slice(0, 120),
        summary: `${r.country ?? "US"} ${name} — scheduled ${r.gmt ? `${r.gmt} UTC` : "today"}. Impact on rates, risk appetite, and USD pairs expected.`,
        impact:         importanceToImpact(r.importance),
        bias:           guessBias(name, r.country ?? ""),
        scope:          classifyScope(name),
        relatedSymbols: MACRO_SYMBOLS,
        startsAt:       r.date ? `${r.date}T${r.gmt ?? "12:00"}:00Z` : now,
        sourceLabel:    "Nasdaq Economic Calendar",
        sourceType:     "Calendar" as const,
        status,
        createdAt: now,
        updatedAt: now,
      };
    });

  return [...newEvents, ...existingEvents].slice(0, 40);
}
