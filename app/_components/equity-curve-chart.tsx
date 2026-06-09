"use client";

import { useMemo, useState } from "react";

type EquityPoint = {
  at: string;
  equityGbp: number;
  cashBalanceGbp: number;
  openTrades: number;
};

type Period = "week" | "lastweek" | "30d" | "all";

type Props = {
  curve: EquityPoint[];
  startingBalanceGbp: number;
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtGbp(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtTooltipDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(iso));
}

function fmtAxisLabel(iso: string, period: Period): string {
  const d = new Date(iso);
  if (period === "week" || period === "lastweek") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
  }).format(d);
}

// ─── Trading calendar week utilities ─────────────────────────────────────────

/**
 * UTC milliseconds for 00:00:00 Europe/London on the given YYYY-MM-DD date string.
 * Probes at noon UTC (safe — DST transitions never happen at noon).
 */
function londonMidnightUtcMs(dateStr: string): number {
  const noonUtc = new Date(dateStr + "T12:00:00Z");
  const londonHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/London",
      hour: "numeric",
      hour12: false,
    }).format(noonUtc),
    10,
  );
  const offsetHours = londonHour - 12; // +1 during BST, 0 during GMT
  return Date.parse(dateStr + "T00:00:00Z") - offsetHours * 3_600_000;
}

/** London date string (YYYY-MM-DD) for a given Date object. */
function londonDateStr(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London" }).format(d);
}

/**
 * Monday of the trading week that contains `d`, at midnight London time.
 * Mon=0, Tue=1, …, Sun=6
 */
function tradingWeekStart(d: Date): Date {
  const todayStr = londonDateStr(d);
  const dowName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(d);
  const daysBack: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const back = daysBack[dowName] ?? 0;
  const todayNoonMs = Date.parse(todayStr + "T12:00:00Z");
  const mondayStr = new Date(todayNoonMs - back * 86_400_000).toISOString().slice(0, 10);
  return new Date(londonMidnightUtcMs(mondayStr));
}

// ─── Period helpers ───────────────────────────────────────────────────────────

function getPeriodBounds(period: Period, now: Date): { start: Date; end: Date } {
  const thisMonday = tradingWeekStart(now);
  switch (period) {
    case "week":
      return { start: thisMonday, end: now };
    case "lastweek": {
      const lastMonday = new Date(thisMonday.getTime() - 7 * 86_400_000);
      return { start: lastMonday, end: thisMonday };
    }
    case "30d":
      return { start: new Date(now.getTime() - 30 * 86_400_000), end: now };
    case "all":
      return { start: new Date(0), end: now };
  }
}

function buildPlotCurve(
  curve: EquityPoint[],
  start: Date,
  end: Date,
  startingBalanceGbp: number,
  deduplicate: boolean,
): EquityPoint[] {
  const startMs = start.getTime();
  const endMs   = end.getTime();

  // Last equity value before the window (used for the synthetic opening point)
  let syntheticEquity = startingBalanceGbp;
  let syntheticOpenTrades = 0;
  for (const p of curve) {
    const ms = Date.parse(p.at);
    if (ms < startMs) {
      syntheticEquity    = p.equityGbp;
      syntheticOpenTrades = p.openTrades;
    }
  }

  // Filter to the window
  const windowed = curve.filter((p) => {
    const ms = Date.parse(p.at);
    return ms >= startMs && ms <= endMs;
  });

  // Optionally deduplicate consecutive identical equity values
  const deduped: EquityPoint[] = [];
  for (const p of windowed) {
    const last = deduped.at(-1);
    if (!deduplicate || !last || p.equityGbp !== last.equityGbp) {
      deduped.push(p);
    }
  }

  if (deduped.length === 0) return [];

  // Prepend a synthetic "period start" point when the first real point is
  // more than 1 hour into the window — anchors the chart to the period boundary.
  const firstMs = Date.parse(deduped[0].at);
  if (firstMs > startMs + 3_600_000) {
    return [
      {
        at:             start.toISOString(),
        equityGbp:      syntheticEquity,
        cashBalanceGbp: 0,
        openTrades:     syntheticOpenTrades,
      },
      ...deduped,
    ];
  }

  return deduped;
}

// ─── SVG geometry ─────────────────────────────────────────────────────────────

const W      = 600;
const H      = 160;
const PAD_L  = 4;
const PAD_R  = 4;
const PAD_T  = 14;
const PAD_B  = 24;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

const PERIOD_LABELS: Record<Period, string> = {
  week:     "This week",
  lastweek: "Last week",
  "30d":    "30 days",
  all:      "All time",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function EquityCurveChart({ curve, startingBalanceGbp }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [period,   setPeriod]   = useState<Period>("all");

  // Stable "now" reference — recomputed when the period tab changes
  // (which is fine; the tiny time difference doesn't matter)
  const now = useMemo(() => new Date(), [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const plotCurve = useMemo(() => {
    const { start, end } = getPeriodBounds(period, now);
    return buildPlotCurve(curve, start, end, startingBalanceGbp, period === "all");
  }, [curve, period, now, startingBalanceGbp]);

  // Reset hover when period changes
  const handlePeriodChange = (p: Period) => {
    setHoverIdx(null);
    setPeriod(p);
  };

  const isEmpty = plotCurve.length < 2;

  const n      = plotCurve.length;
  const values = plotCurve.map((p) => p.equityGbp);
  const rawMin = isEmpty ? 0 : Math.min(...values, startingBalanceGbp);
  const rawMax = isEmpty ? 1 : Math.max(...values, startingBalanceGbp);
  const rangePad = (rawMax - rawMin) * 0.12 || startingBalanceGbp * 0.02 || 1;
  const yMin   = rawMin - rangePad;
  const yMax   = rawMax + rangePad;
  const yRange = yMax - yMin;

  function cx(i: number) {
    return PAD_L + (i / Math.max(n - 1, 1)) * INNER_W;
  }
  function cy(val: number) {
    return PAD_T + ((yMax - val) / yRange) * INNER_H;
  }

  const pts = isEmpty ? "" : plotCurve.map((p, i) => `${cx(i).toFixed(1)},${cy(p.equityGbp).toFixed(1)}`).join(" ");

  const fillPath = isEmpty ? "" :
    `M ${cx(0).toFixed(1)},${cy(plotCurve[0].equityGbp).toFixed(1)} ` +
    plotCurve.map((p, i) => `L ${cx(i).toFixed(1)},${cy(p.equityGbp).toFixed(1)}`).join(" ") +
    ` L ${cx(n - 1).toFixed(1)},${(PAD_T + INNER_H).toFixed(1)} L ${PAD_L},${(PAD_T + INNER_H).toFixed(1)} Z`;

  const yBaseline    = cy(startingBalanceGbp);
  const latestEquity = plotCurve.at(-1)?.equityGbp ?? startingBalanceGbp;
  const isUp         = latestEquity >= startingBalanceGbp;
  const lineColor    = isUp ? "#34d399" : "#f87171";
  const fillId       = `ecfill-${isUp ? "up" : "dn"}`;

  const hoverPoint = hoverIdx !== null ? plotCurve[hoverIdx] : null;

  // X-axis: 3 evenly spaced labels
  const axisIdxs = isEmpty ? [] : [0, Math.floor(n / 2), n - 1];

  return (
    <div className="relative w-full">
      {/* ── Period selector tabs ─────────────────────────────────────────────── */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex gap-0.5">
          {(["week", "lastweek", "30d", "all"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePeriodChange(p)}
              className={`rounded-[0.28rem] px-2.5 py-1 text-[0.68rem] font-semibold transition ${
                period === p
                  ? "bg-cyan-400/12 text-cyan-200 ring-1 ring-cyan-400/20"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        {!isEmpty && (
          <span className="text-[0.66rem] text-slate-600">
            {period === "all" ? `${n} pts` : `${n - 1} pts`} · hover for detail
          </span>
        )}
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {isEmpty ? (
        <div className="flex h-[160px] items-center justify-center text-[0.78rem] text-slate-500">
          {curve.length < 2
            ? "No equity movement recorded yet — the curve will appear once the balance changes."
            : `No equity snapshots for ${PERIOD_LABELS[period].toLowerCase()} — try a wider range.`}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: H }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={lineColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Baseline — starting balance */}
          <line
            x1={PAD_L}        y1={yBaseline}
            x2={PAD_L + INNER_W} y2={yBaseline}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text x={PAD_L + 2} y={yBaseline - 3} fontSize="8" fill="rgba(255,255,255,0.22)">
            Start {fmtGbp(startingBalanceGbp)}
          </text>

          {/* Filled area under line */}
          <path d={fillPath} fill={`url(#${fillId})`} />

          {/* Main equity line */}
          <polyline
            points={pts}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Invisible hover strips */}
          {plotCurve.map((_, i) => {
            const x      = cx(i);
            const stripW = INNER_W / n;
            return (
              <rect
                key={`strip-${i}`}
                x={x - stripW / 2}
                y={PAD_T}
                width={stripW}
                height={INNER_H}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            );
          })}

          {/* Hover crosshair */}
          {hoverIdx !== null && hoverPoint && (
            <>
              <line
                x1={cx(hoverIdx)} y1={PAD_T}
                x2={cx(hoverIdx)} y2={PAD_T + INNER_H}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
              <circle
                cx={cx(hoverIdx)}
                cy={cy(hoverPoint.equityGbp)}
                r="4"
                fill={lineColor}
                stroke="#07111d"
                strokeWidth="1.5"
              />
            </>
          )}

          {/* X-axis date labels — first, middle, last */}
          {axisIdxs.map((i) => (
            <text
              key={`date-${i}`}
              x={cx(i)}
              y={PAD_T + INNER_H + 12}
              fontSize="8"
              fill="rgba(255,255,255,0.30)"
              textAnchor="middle"
            >
              {fmtAxisLabel(plotCurve[i].at, period)}
            </text>
          ))}
        </svg>
      )}

      {/* Hover tooltip */}
      {!isEmpty && hoverPoint && (
        <div
          className="pointer-events-none absolute rounded-[0.35rem] bg-[#07111d] px-2.5 py-1.5 text-[0.72rem] ring-1 ring-white/12 shadow-lg"
          style={{
            left:      `${Math.min(85, (hoverIdx! / (n - 1)) * 100)}%`,
            bottom:    "calc(100% + 6px)",
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-semibold text-white">{fmtGbp(hoverPoint.equityGbp)}</p>
          <p className="text-slate-400">
            {hoverPoint.openTrades} open · {fmtTooltipDate(hoverPoint.at)}
          </p>
        </div>
      )}
    </div>
  );
}
