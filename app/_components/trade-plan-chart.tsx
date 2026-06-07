/**
 * TradePlanChart — SVG visualisation of a single open trade's plan.
 *
 * Risk / reward zones are anchored to the ORIGINAL entry and stop so they
 * always read correctly regardless of whether the stop has since trailed.
 * The current stop is shown as a separate line coloured by its mode.
 */

type Props = {
  entry: number;
  stop: number;           // current stop (may have moved)
  target: number;
  current: number | null; // latest live price
  side: "BUY" | "SELL";
  symbol: string;
  initialStopPrice?: number; // original stop at open — used for zone sizing
  stopMode?: "Initial" | "Breakeven" | "Trailing";
};

const W = 280;
const H = 180;
const LEFT_PAD = 8;
const RIGHT_PAD = 60;
const TOP_PAD = 14;
const BOTTOM_PAD = 14;
const CHART_W = W - LEFT_PAD - RIGHT_PAD;
const CHART_H = H - TOP_PAD - BOTTOM_PAD;

function formatLevel(price: number, symbol: string) {
  const isForex =
    symbol.includes("USD") || symbol.includes("EUR") ||
    symbol.includes("GBP") || symbol.includes("JPY") || symbol.includes("CHF");
  if (isForex && price < 10) return price.toFixed(4);
  if (price < 1) return price.toFixed(5);
  if (price < 100) return price.toFixed(2);
  if (price < 10_000) return price.toFixed(1);
  return Math.round(price).toLocaleString();
}

/** Stop line colour by mode */
function stopColor(mode: Props["stopMode"]) {
  if (mode === "Trailing") return "#34d399";   // emerald — locking profits
  if (mode === "Breakeven") return "#fbbf24";  // amber — at entry, no loss
  return "#f87171";                            // red — original risk stop
}

/** Stop mode label suffix */
function stopLabel(mode: Props["stopMode"]) {
  if (mode === "Trailing") return "Stop (trailing)";
  if (mode === "Breakeven") return "Stop (b/e)";
  return "Stop";
}

export function TradePlanChart({
  entry,
  stop,
  target,
  current,
  side,
  symbol,
  initialStopPrice,
  stopMode = "Initial",
}: Props) {
  const livePrice = current ?? entry;
  // Use initial stop for zone boundaries — these represent the original plan.
  // Falls back to current stop if initial is absent.
  const zoneStop = initialStopPrice ?? stop;

  // Include all levels in the y-scale, including both stops when they differ.
  const allPrices = [zoneStop, stop, entry, target, livePrice];
  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const pad = (rawMax - rawMin) * 0.12 || rawMax * 0.005;
  const priceMin = rawMin - pad;
  const priceMax = rawMax + pad;
  const priceRange = priceMax - priceMin;

  // Higher price → smaller y value (top of chart)
  function py(price: number) {
    return TOP_PAD + ((priceMax - price) / priceRange) * CHART_H;
  }

  const yEntry     = py(entry);
  const yStop      = py(stop);
  const yZoneStop  = py(zoneStop);
  const yTarget    = py(target);
  const yLive      = py(livePrice);

  // ── Zones ─────────────────────────────────────────────────────────────────
  //
  // Reward (green): always between entry and target, toward profit.
  // Risk   (red):   between entry and the ORIGINAL stop — represents the
  //                 original plan's downside, not the current trailing level.
  //
  // For BUY:  target > entry > zoneStop  → green above, red below
  // For SELL: target < entry < zoneStop  → green below, red above
  //
  const rewardTop = Math.min(yEntry, yTarget);
  const rewardH   = Math.abs(yEntry - yTarget);
  const riskTop   = Math.min(yEntry, yZoneStop);
  const riskH     = Math.abs(yEntry - yZoneStop);

  // ── Forecast bezier ───────────────────────────────────────────────────────
  const seed    = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const wobble1 = ((seed % 7) - 3) * 3;
  const wobble2 = (((seed * 3) % 11) - 5) * 2;

  const x0 = LEFT_PAD + CHART_W * 0.08;
  const x1 = LEFT_PAD + CHART_W * 0.42;
  const x2 = LEFT_PAD + CHART_W * 0.72;
  const x3 = LEFT_PAD + CHART_W * 0.96;

  const pathD = `M ${x0} ${yLive} C ${x1} ${yLive + wobble1} ${x2} ${yTarget + wobble2} ${x3} ${yTarget}`;

  const inProfit   = side === "BUY" ? livePrice > entry : livePrice < entry;
  const pathColor  = inProfit ? "#34d399" : "#94a3b8";
  const sColor     = stopColor(stopMode);
  const sLabel     = stopLabel(stopMode);
  const stopMoved  = initialStopPrice !== undefined && Math.abs(stop - initialStopPrice) > entry * 0.0001;

  // Clamp labels so they stay within SVG bounds
  function ly(baseY: number, offset: number) {
    return Math.max(TOP_PAD + 4, Math.min(TOP_PAD + CHART_H - 4, baseY + offset));
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      aria-label={`Trade plan for ${symbol}: ${side}, entry ${formatLevel(entry, symbol)}, ${sLabel} ${formatLevel(stop, symbol)}, target ${formatLevel(target, symbol)}`}
    >
      {/* Background */}
      <rect x={LEFT_PAD} y={TOP_PAD} width={CHART_W} height={CHART_H} fill="rgba(255,255,255,0.02)" rx="4" />

      {/* Reward zone — entry toward target */}
      <rect x={LEFT_PAD} y={rewardTop} width={CHART_W} height={rewardH} fill="rgba(52,211,153,0.08)" />

      {/* Risk zone — entry toward original stop */}
      <rect x={LEFT_PAD} y={riskTop} width={CHART_W} height={riskH} fill="rgba(248,113,113,0.08)" />

      {/* Original stop reference line (faint, only when stop has moved) */}
      {stopMoved && (
        <line
          x1={LEFT_PAD}
          y1={yZoneStop}
          x2={LEFT_PAD + CHART_W}
          y2={yZoneStop}
          stroke="#f87171"
          strokeWidth="0.8"
          strokeDasharray="2 4"
          opacity="0.3"
        />
      )}

      {/* Target line */}
      <line x1={LEFT_PAD} y1={yTarget} x2={LEFT_PAD + CHART_W} y2={yTarget}
        stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={LEFT_PAD + CHART_W + 4} y={ly(yTarget, 4)} fontSize="9" fill="#34d399" fontFamily="monospace">
        {formatLevel(target, symbol)}
      </text>
      <text x={LEFT_PAD + CHART_W + 4} y={ly(yTarget, -4)} fontSize="8" fill="#34d399" opacity="0.65">
        Target
      </text>

      {/* Current stop line — colour reflects mode */}
      <line x1={LEFT_PAD} y1={yStop} x2={LEFT_PAD + CHART_W} y2={yStop}
        stroke={sColor} strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={LEFT_PAD + CHART_W + 4} y={ly(yStop, 4)} fontSize="9" fill={sColor} fontFamily="monospace">
        {formatLevel(stop, symbol)}
      </text>
      <text x={LEFT_PAD + CHART_W + 4} y={ly(yStop, -4)} fontSize="8" fill={sColor} opacity="0.65">
        {sLabel}
      </text>

      {/* Entry line */}
      <line x1={LEFT_PAD} y1={yEntry} x2={LEFT_PAD + CHART_W} y2={yEntry}
        stroke="#67e8f9" strokeWidth="1.5" />
      <text x={LEFT_PAD + CHART_W + 4} y={ly(yEntry, 4)} fontSize="9" fill="#67e8f9" fontFamily="monospace">
        {formatLevel(entry, symbol)}
      </text>
      <text x={LEFT_PAD + CHART_W + 4} y={ly(yEntry, -4)} fontSize="8" fill="#67e8f9" opacity="0.65">
        Entry
      </text>

      {/* Forecast bezier path */}
      <path d={pathD} fill="none" stroke={pathColor} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.55" />

      {/* Live price dot */}
      {current !== null && Math.abs(yLive - yEntry) > 2 && (
        <>
          <line x1={LEFT_PAD} y1={yLive} x2={LEFT_PAD + CHART_W * 0.5} y2={yLive}
            stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
          <circle cx={x0} cy={yLive} r="3" fill={inProfit ? "#34d399" : "#f87171"} />
        </>
      )}

      {/* Side badge */}
      <rect x={LEFT_PAD + 4} y={TOP_PAD + 4} width={30} height={14} rx="3"
        fill={side === "BUY" ? "rgba(52,211,153,0.18)" : "rgba(248,113,113,0.18)"} />
      <text x={LEFT_PAD + 4 + 15} y={TOP_PAD + 14} fontSize="8"
        fill={side === "BUY" ? "#34d399" : "#f87171"} textAnchor="middle" fontWeight="bold">
        {side}
      </text>

      {/* Stop-moved indicator badge */}
      {stopMoved && (
        <>
          <rect x={LEFT_PAD + 38} y={TOP_PAD + 4} width={stopMode === "Trailing" ? 40 : 32} height={14} rx="3"
            fill={`${sColor}22`} />
          <text x={LEFT_PAD + 38 + (stopMode === "Trailing" ? 20 : 16)} y={TOP_PAD + 14} fontSize="8"
            fill={sColor} textAnchor="middle" fontWeight="bold">
            {stopMode === "Trailing" ? "TRAILING" : "B/E"}
          </text>
        </>
      )}
    </svg>
  );
}
