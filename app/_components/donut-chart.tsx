// Pure SVG donut chart — works as server or client component (no hooks needed).

export type DonutSegment = {
  value: number;
  color: string;  // CSS colour e.g. "#34d399"
  label: string;
};

// ─── geometry helpers ─────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Filled arc segment path (outer arc → inner arc → closed). */
function segPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
  gapDeg: number,
): string {
  const s = startDeg + gapDeg / 2;
  const e = endDeg - gapDeg / 2;
  if (e - s <= 0) return "";
  const large = e - s > 180 ? 1 : 0;
  const os = polar(cx, cy, outerR, s);
  const oe = polar(cx, cy, outerR, e);
  const ie = polar(cx, cy, innerR, e);
  const is_ = polar(cx, cy, innerR, s);
  return [
    `M ${os.x.toFixed(2)} ${os.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${oe.x.toFixed(2)} ${oe.y.toFixed(2)}`,
    `L ${ie.x.toFixed(2)} ${ie.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${is_.x.toFixed(2)} ${is_.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

export function DonutChart({
  segments,
  size = 88,
  thickness = 14,
  centerLabel,
  centerSublabel,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSublabel?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 1;
  const innerR = outerR - thickness;
  const total = segments.reduce((a, s) => a + s.value, 0);
  const nonZero = segments.filter((s) => s.value > 0).length;
  const gapDeg = nonZero > 1 ? 3 : 0;

  let cumDeg = 0;

  return (
    <div className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Empty-state track */}
        {total === 0 && (
          <path
            d={segPath(cx, cy, outerR, innerR, 0, 360 - 0.001, 0)}
            fill="rgba(255,255,255,0.05)"
          />
        )}
        {total > 0 &&
          segments.map((seg, i) => {
            if (seg.value <= 0) return null;
            const startDeg = cumDeg;
            const spanDeg = (seg.value / total) * 360;
            cumDeg += spanDeg;
            const endDeg = startDeg + spanDeg;
            return (
              <path
                key={i}
                d={segPath(cx, cy, outerR, innerR, startDeg, endDeg, gapDeg)}
                fill={seg.color}
                opacity="0.9"
              />
            );
          })}
      </svg>

      {/* Centre label — positioned on top of SVG */}
      {(centerLabel || centerSublabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel && (
            <span
              className="font-bold leading-none text-white"
              style={{ fontSize: Math.round(size * 0.21) }}
            >
              {centerLabel}
            </span>
          )}
          {centerSublabel && (
            <span
              className="mt-0.5 leading-none text-slate-500"
              style={{ fontSize: Math.round(size * 0.13) }}
            >
              {centerSublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DonutWithLegend ──────────────────────────────────────────────────────────
// Donut + side legend. Drop-in replacement for a SummaryCard when you have
// win/loss/breakeven breakdown data.

export function DonutWithLegend({
  segments,
  size = 88,
  thickness = 14,
  centerLabel,
  centerSublabel,
  title,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSublabel?: string;
  title?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <DonutChart
        segments={segments}
        size={size}
        thickness={thickness}
        centerLabel={centerLabel}
        centerSublabel={centerSublabel}
      />
      <div className="min-w-0 flex-1">
        {title && (
          <p className="mb-1.5 text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {title}
          </p>
        )}
        <div className="space-y-1">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: seg.color }}
                />
                <span className="text-[0.70rem] text-slate-400">{seg.label}</span>
              </div>
              <span className="text-[0.70rem] font-semibold text-white">{seg.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── StatBar ──────────────────────────────────────────────────────────────────
// Simple horizontal progress bar — use for score breakdowns.

export function StatBar({
  label,
  value,      // 0–100
  detail,
  color = "#22d3ee",
}: {
  label: string;
  value: number;
  detail?: string;
  color?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[0.69rem] text-slate-400">{label}</span>
        <span className="text-[0.75rem] font-semibold text-white">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {detail && (
        <p className="mt-0.5 text-[0.64rem] text-slate-600">{detail}</p>
      )}
    </div>
  );
}

// ─── RadialGauge ─────────────────────────────────────────────────────────────
// Semi-circle gauge for a single value 0–100 (e.g. portfolio heat).

export function RadialGauge({
  value,        // 0–100
  max = 100,
  color,
  size = 80,
  label,
  sublabel,
}: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const cx = size / 2;
  const cy = size * 0.58; // push centre down a little for a half-arc
  const r = size * 0.42;
  const thickness = size * 0.13;
  const outerR = r;
  const innerR = r - thickness;
  const pct = Math.min(1, Math.max(0, value / max));

  // Arc from -180° to 0° (left to right, half circle from bottom)
  // We want: empty state = -180° to -180° + pct*180
  // Angles: track from 180° to 360° (i.e., bottom-left to bottom-right in SVG)
  const START_DEG = 180;
  const END_DEG = 360;
  const fillEndDeg = START_DEG + pct * (END_DEG - START_DEG);

  const trackPath = segPath(cx, cy, outerR, innerR, START_DEG, END_DEG, 0);
  const fillPath = pct > 0 ? segPath(cx, cy, outerR, innerR, START_DEG, fillEndDeg, 0) : "";

  return (
    <div className="relative inline-block shrink-0" style={{ width: size, height: size * 0.65 }}>
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size}`}>
        <path d={trackPath} fill="rgba(255,255,255,0.05)" />
        {fillPath && <path d={fillPath} fill={color} opacity="0.9" />}
      </svg>
      {(label || sublabel) && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-col items-center"
        >
          {label && (
            <span className="font-bold leading-none text-white" style={{ fontSize: size * 0.22 }}>
              {label}
            </span>
          )}
          {sublabel && (
            <span className="mt-0.5 leading-none text-slate-500" style={{ fontSize: size * 0.13 }}>
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
