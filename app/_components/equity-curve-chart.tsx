"use client";

import { useState } from "react";

type EquityPoint = {
  at: string;
  equityGbp: number;
  cashBalanceGbp: number;
  openTrades: number;
};

type Props = {
  curve: EquityPoint[];
  startingBalanceGbp: number;
};

function fmtGbp(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const W = 600;
const H = 160;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 14;
const PAD_B = 24;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(iso));
}

export function EquityCurveChart({ curve, startingBalanceGbp }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Deduplicate consecutive snapshots with the same equity value — only plot
  // points where the balance actually moved.
  const plotCurve: EquityPoint[] = [];
  for (const point of curve) {
    const last = plotCurve.at(-1);
    if (!last || point.equityGbp !== last.equityGbp) {
      plotCurve.push(point);
    }
  }

  if (plotCurve.length < 2) {
    return (
      <div className="flex h-[160px] items-center justify-center text-[0.78rem] text-slate-500">
        No equity movement recorded yet — the curve will appear once the balance changes.
      </div>
    );
  }

  const n = plotCurve.length;
  const values = plotCurve.map((p) => p.equityGbp);
  const rawMin = Math.min(...values, startingBalanceGbp);
  const rawMax = Math.max(...values, startingBalanceGbp);
  const padding = (rawMax - rawMin) * 0.12 || startingBalanceGbp * 0.02;
  const yMin = rawMin - padding;
  const yMax = rawMax + padding;
  const yRange = yMax - yMin;

  function cx(i: number) {
    return PAD_L + (i / (n - 1)) * INNER_W;
  }
  function cy(val: number) {
    return PAD_T + ((yMax - val) / yRange) * INNER_H;
  }

  const pts = plotCurve.map((p, i) => `${cx(i).toFixed(1)},${cy(p.equityGbp).toFixed(1)}`).join(" ");

  const fillPath =
    `M ${cx(0).toFixed(1)},${cy(plotCurve[0].equityGbp).toFixed(1)} ` +
    plotCurve.map((p, i) => `L ${cx(i).toFixed(1)},${cy(p.equityGbp).toFixed(1)}`).join(" ") +
    ` L ${cx(n - 1).toFixed(1)},${(PAD_T + INNER_H).toFixed(1)} L ${PAD_L},${(PAD_T + INNER_H).toFixed(1)} Z`;

  const yBaseline = cy(startingBalanceGbp);
  const latestEquity = plotCurve.at(-1)?.equityGbp ?? startingBalanceGbp;
  const isUp = latestEquity >= startingBalanceGbp;
  const lineColor = isUp ? "#34d399" : "#f87171";
  const fillId = `ecfill-${isUp ? "up" : "dn"}`;

  const hoverPoint = hoverIdx !== null ? plotCurve[hoverIdx] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: H }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Baseline — starting balance */}
        <line
          x1={PAD_L}
          y1={yBaseline}
          x2={PAD_L + INNER_W}
          y2={yBaseline}
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

        {/* Invisible hover strips — one per plotted point */}
        {plotCurve.map((_, i) => {
          const x = cx(i);
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
              x1={cx(hoverIdx)}
              y1={PAD_T}
              x2={cx(hoverIdx)}
              y2={PAD_T + INNER_H}
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
        {[0, Math.floor(n / 2), n - 1].map((i) => (
          <text
            key={`date-${i}`}
            x={cx(i)}
            y={PAD_T + INNER_H + 12}
            fontSize="8"
            fill="rgba(255,255,255,0.3)"
            textAnchor="middle"
          >
            {fmtDate(plotCurve[i].at).split(",")[0]}
          </text>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hoverPoint && (
        <div
          className="pointer-events-none absolute rounded-[0.35rem] bg-[#07111d] px-2.5 py-1.5 text-[0.72rem] ring-1 ring-white/12 shadow-lg"
          style={{
            left: `${Math.min(85, (hoverIdx! / (n - 1)) * 100)}%`,
            bottom: "calc(100% + 6px)",
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-semibold text-white">{fmtGbp(hoverPoint.equityGbp)}</p>
          <p className="text-slate-400">
            {hoverPoint.openTrades} open · {fmtDate(hoverPoint.at)}
          </p>
        </div>
      )}
    </div>
  );
}
