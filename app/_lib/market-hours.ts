import { getInstrumentUniverseEntry } from "./instrument-universe";
import type { PersistedAssetRecord } from "./server/workspace-types";

export type MarketSessionState = "Open" | "Closed" | "Weekend" | "24/7";

export type MarketSession = {
  detail: string;
  state: MarketSessionState;
  timezone: string;
  venue: string;
};

type SessionWindow = {
  closeMinute: number;
  openMinute: number;
};

type VenueSession = {
  scheduleType?: "regular" | "us-futures";
  timezone: string;
  venue: string;
  windows: SessionWindow[];
};

const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getWeekdayFormatter(timezone: string) {
  const cached = weekdayFormatterCache.get(timezone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
  });
  weekdayFormatterCache.set(timezone, formatter);

  return formatter;
}

function getTimeFormatter(timezone: string) {
  const cached = timeFormatterCache.get(timezone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: timezone,
  });
  timeFormatterCache.set(timezone, formatter);

  return formatter;
}

function getLocalClockParts(date: Date, timezone: string) {
  const weekday = getWeekdayFormatter(timezone).format(date);
  const timeParts = getTimeFormatter(timezone).formatToParts(date);
  const hour = Number(timeParts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(timeParts.find((part) => part.type === "minute")?.value ?? "0");

  return {
    dayIndex: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday),
    minuteOfDay: hour * 60 + minute,
    weekday,
  };
}

function isWeekday(weekday: string) {
  return weekday !== "Sat" && weekday !== "Sun";
}

function isInsideWindow(minuteOfDay: number, window: SessionWindow) {
  return minuteOfDay >= window.openMinute && minuteOfDay < window.closeMinute;
}

function formatSessionTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildSession(session: VenueSession, now: Date): MarketSession {
  const localClock = getLocalClockParts(now, session.timezone);
  const isFuturesWeekOpen =
    session.scheduleType === "us-futures"
      ? localClock.dayIndex > 0 &&
          localClock.dayIndex < 6 &&
          !(localClock.dayIndex === 5 && localClock.minuteOfDay >= 17 * 60)
        ? true
        : localClock.dayIndex === 0 && localClock.minuteOfDay >= 18 * 60
      : isWeekday(localClock.weekday);
  const openNow =
    isFuturesWeekOpen &&
    session.windows.some((window) => isInsideWindow(localClock.minuteOfDay, window));
  const sessionWindows = session.windows
    .map((window) => `${formatSessionTime(window.openMinute)}-${formatSessionTime(window.closeMinute)}`)
    .join(", ");
  const state: MarketSessionState = !isFuturesWeekOpen
    ? "Weekend"
    : openNow
      ? "Open"
      : "Closed";

  return {
    detail: openNow
      ? `Regular session active (${sessionWindows} local)`
      : `Regular session ${sessionWindows} local`,
    state,
    timezone: session.timezone,
    venue: session.venue,
  };
}

function resolveVenueSession(asset: PersistedAssetRecord): VenueSession | null {
  const instrument = getInstrumentUniverseEntry(asset.symbol);
  const widgetSymbol = instrument?.widgetSymbol ?? "";
  const yahooSymbol = instrument?.yahooSymbol ?? "";

  if (asset.assetClass === "Crypto") {
    return null;
  }

  if (asset.assetClass === "Forex") {
    return {
      timezone: "Europe/London",
      venue: "Global FX",
      windows: [{ openMinute: 22 * 60, closeMinute: 24 * 60 }],
    };
  }

  if (
    widgetSymbol.startsWith("LSE:") ||
    widgetSymbol.includes("UK100") ||
    yahooSymbol === "^FTSE"
  ) {
    return {
      timezone: "Europe/London",
      venue: "London",
      windows: [{ openMinute: 8 * 60, closeMinute: 16 * 60 + 30 }],
    };
  }

  if (widgetSymbol.startsWith("XETR:") || yahooSymbol === "^GDAXI") {
    return {
      timezone: "Europe/Berlin",
      venue: "Xetra",
      windows: [{ openMinute: 9 * 60, closeMinute: 17 * 60 + 30 }],
    };
  }

  if (
    widgetSymbol.startsWith("COMEX:") ||
    widgetSymbol.startsWith("NYMEX:") ||
    yahooSymbol.endsWith("=F")
  ) {
    return {
      timezone: "America/New_York",
      venue: "US futures",
      scheduleType: "us-futures",
      windows: [
        { openMinute: 0, closeMinute: 17 * 60 },
        { openMinute: 18 * 60, closeMinute: 24 * 60 },
      ],
    };
  }

  return {
    timezone: "America/New_York",
    venue: widgetSymbol.startsWith("NASDAQ:") ? "Nasdaq" : "US market",
    windows: [{ openMinute: 9 * 60 + 30, closeMinute: 16 * 60 }],
  };
}

export function getMarketSession(asset: PersistedAssetRecord | null, now = new Date()): MarketSession {
  if (!asset) {
    return {
      detail: "Session data unavailable",
      state: "Closed",
      timezone: "UTC",
      venue: "Unknown",
    };
  }

  if (asset.assetClass === "Crypto") {
    return {
      detail: "Crypto trades continuously",
      state: "24/7",
      timezone: "UTC",
      venue: "Crypto",
    };
  }

  if (asset.assetClass === "Forex") {
    const londonClock = getLocalClockParts(now, "Europe/London");
    const state: MarketSessionState = londonClock.weekday === "Sat" ||
      (londonClock.weekday === "Sun" && londonClock.minuteOfDay < 22 * 60) ||
      (londonClock.weekday === "Fri" && londonClock.minuteOfDay >= 22 * 60)
      ? "Weekend"
      : "Open";

    return {
      detail: state === "Open" ? "Global FX week is active" : "FX reopens Sunday 22:00 London",
      state,
      timezone: "Europe/London",
      venue: "Global FX",
    };
  }

  const venueSession = resolveVenueSession(asset);

  return venueSession
    ? buildSession(venueSession, now)
    : {
        detail: "Session data unavailable",
        state: "Closed",
        timezone: "UTC",
        venue: "Unknown",
      };
}

export function getMarketSessionTone(state: MarketSessionState) {
  if (state === "Open" || state === "24/7") {
    return "text-emerald-300";
  }

  if (state === "Weekend") {
    return "text-slate-400";
  }

  return "text-amber-200";
}
