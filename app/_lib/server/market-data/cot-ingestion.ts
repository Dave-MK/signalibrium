import type { PersistedMarketEvent } from "../workspace-types";

// CFTC "Legacy" Futures-Only report — weekly, free, no API key
const COT_URL = "https://www.cftc.gov/dea/newcot/deafut.txt";

// Map CFTC market names (substring match) → our trading symbols
const MARKET_MAP: Array<{ cftcSubstring: string; symbols: string[]; displayName: string }> = [
  { cftcSubstring: "EURO FX",            symbols: ["EURUSD"],          displayName: "Euro FX" },
  { cftcSubstring: "BRITISH POUND",      symbols: ["GBPUSD"],          displayName: "British Pound" },
  { cftcSubstring: "JAPANESE YEN",       symbols: ["USDJPY"],          displayName: "Japanese Yen" },
  { cftcSubstring: "GOLD",               symbols: ["XAUUSD"],          displayName: "Gold" },
  { cftcSubstring: "SILVER",             symbols: ["XAGUSD"],          displayName: "Silver" },
  { cftcSubstring: "CRUDE OIL, LIGHT",   symbols: ["USOIL", "WTI"],    displayName: "Crude Oil (WTI)" },
  { cftcSubstring: "S&P 500 STOCK INDEX",symbols: ["SPX500", "US500"], displayName: "S&P 500" },
  { cftcSubstring: "BITCOIN",            symbols: ["BTCUSD"],          displayName: "Bitcoin" },
  { cftcSubstring: "NASDAQ",             symbols: ["NAS100", "US100"], displayName: "Nasdaq" },
];

type CotReading = {
  marketName:  string;
  displayName: string;
  symbols:     string[];
  reportDate:  string;
  netNonCommercial: number;
  longNonCommercial:  number;
  shortNonCommercial: number;
  openInterest: number;
};

function parseCotText(text: string): CotReading[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const readings: CotReading[] = [];

  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 10) continue;

    const marketName = (parts[0] ?? "").trim().toUpperCase();
    const reportDateRaw = (parts[2] ?? "").trim(); // MM/DD/YYYY

    // Only match markets we care about
    const mapping = MARKET_MAP.find((m) => marketName.includes(m.cftcSubstring.toUpperCase()));
    if (!mapping) continue;

    // Parse date
    const [month, day, year] = reportDateRaw.split("/");
    if (!month || !day || !year) continue;
    const reportDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

    const openInterest   = Number(parts[4]?.replace(/\s/g, "").replace(/"/g, "")) || 0;
    const longNonComm    = Number(parts[5]?.replace(/\s/g, "").replace(/"/g, "")) || 0;
    const shortNonComm   = Number(parts[6]?.replace(/\s/g, "").replace(/"/g, "")) || 0;

    if (openInterest === 0) continue;

    readings.push({
      marketName:          mapping.displayName,
      displayName:         mapping.displayName,
      symbols:             mapping.symbols,
      reportDate,
      netNonCommercial:    longNonComm - shortNonComm,
      longNonCommercial:   longNonComm,
      shortNonCommercial:  shortNonComm,
      openInterest,
    });
  }

  return readings;
}

function netToText(net: number, openInterest: number): { biasLabel: string; bias: PersistedMarketEvent["bias"] } {
  if (openInterest === 0) return { biasLabel: "Neutral", bias: "Neutral" };
  const pct = (net / openInterest) * 100;
  if (pct >  15) return { biasLabel: `Net Long (${pct.toFixed(0)}% of OI)`,  bias: "Bullish" };
  if (pct < -15) return { biasLabel: `Net Short (${Math.abs(pct).toFixed(0)}% of OI)`, bias: "Bearish" };
  return { biasLabel: `Near Neutral (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% of OI)`, bias: "Mixed" };
}

export async function ingestCotData(
  existingEvents: PersistedMarketEvent[],
  now: string,
): Promise<PersistedMarketEvent[]> {
  const today = now.slice(0, 10);

  // Only run once per week — skip if we already have COT events added this week (Mon–Sun)
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const alreadySynced = existingEvents.some(
    (e) => e.sourceType === "Flow" && e.sourceLabel === "CFTC COT" && e.updatedAt.slice(0, 10) >= weekStartStr,
  );
  if (alreadySynced) return existingEvents;

  let text: string;
  try {
    const res = await fetch(COT_URL, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/plain" },
    });
    if (!res.ok) return existingEvents;
    text = await res.text();
  } catch {
    return existingEvents;
  }

  const readings = parseCotText(text);
  if (readings.length === 0) return existingEvents;

  // Remove old COT events from previous weeks before adding fresh ones
  const withoutOldCot = existingEvents.filter(
    (e) => !(e.sourceType === "Flow" && e.sourceLabel === "CFTC COT"),
  );

  const newEvents: PersistedMarketEvent[] = readings.map((r) => {
    const { biasLabel, bias } = netToText(r.netNonCommercial, r.openInterest);
    const longK  = (r.longNonCommercial  / 1000).toFixed(0);
    const shortK = (r.shortNonCommercial / 1000).toFixed(0);
    const netK   = (Math.abs(r.netNonCommercial) / 1000).toFixed(0);
    const dir    = r.netNonCommercial >= 0 ? "long" : "short";

    return {
      id:      `cot-${r.reportDate}-${r.marketName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
      title:   `COT: ${r.displayName} — Speculators ${bias === "Bullish" ? "net long" : bias === "Bearish" ? "net short" : "neutral"}`,
      summary: `CFTC report dated ${r.reportDate}. Non-commercial (speculative) positioning: ${longK}k long / ${shortK}k short — net ${dir} by ${netK}k contracts. ${biasLabel}.`,
      impact:  Math.abs(r.netNonCommercial / r.openInterest) > 0.25 ? "High" : "Medium",
      bias,
      scope:   "Liquidity" as const,
      relatedSymbols: r.symbols,
      startsAt: `${r.reportDate}T20:30:00Z`,
      sourceLabel: "CFTC COT",
      sourceType: "Flow" as const,
      status: "Recent" as const,
      createdAt: now,
      updatedAt: now,
    };
  });

  return [...newEvents, ...withoutOldCot].slice(0, 50);
}
