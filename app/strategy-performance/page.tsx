import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { PageHeader, Panel, StatusChip } from "@/app/_components/ui";
import { Sparkline } from "@/app/_components/sparkline";
import type { PersistedPredictionHistoryRecord, PersistedSiggiTrade } from "@/app/_lib/server/workspace-types";

export const metadata = {
  title: "Strategy Performance | Signalibrium",
};

type StratRow = {
  name: string;
  signals: number;
  activeSignals: number;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  pnlGbp: number;
  avgConfidence: number;
  avgHoldHours: number | null;
  pnlTimeline: number[]; // running P&L per closed trade, oldest→newest
};

export default async function StrategyPerformancePage() {
  const [siggiAccount, predictionHistory] = await Promise.all([
    getSiggiAccount(),
    listPredictionHistory(),
  ]);

  // ── Build prediction lookup: id → record ─────────────────────────────────────
  const predById = new Map<string, PersistedPredictionHistoryRecord>(
    predictionHistory.map((p) => [p.id, p]),
  );

  // ── Strategy from a trade: join via predictionId → strategyAtCall ─────────────
  function strategyOf(trade: PersistedSiggiTrade): string {
    const pred = predById.get(trade.predictionId);
    return pred?.strategyAtCall ?? "Unknown";
  }

  // ── Aggregate predictions by strategy ─────────────────────────────────────────
  const stratMap = new Map<string, StratRow>();

  function getRow(name: string): StratRow {
    if (!stratMap.has(name)) {
      stratMap.set(name, {
        name,
        signals: 0,
        activeSignals: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        pnlGbp: 0,
        avgConfidence: 0,
        avgHoldHours: null,
        pnlTimeline: [],
      });
    }
    return stratMap.get(name)!;
  }

  // Count signals per strategy
  const confidenceSums = new Map<string, number>();
  const confidenceCounts = new Map<string, number>();
  for (const p of predictionHistory) {
    if (p.resolvedSource === "seed_replay") continue;
    const row = getRow(p.strategyAtCall);
    row.signals++;
    if (p.monitoringStatus === "Active") row.activeSignals++;
    confidenceSums.set(p.strategyAtCall, (confidenceSums.get(p.strategyAtCall) ?? 0) + p.confidenceAtCall);
    confidenceCounts.set(p.strategyAtCall, (confidenceCounts.get(p.strategyAtCall) ?? 0) + 1);
  }

  // Count closed trades per strategy (sorted oldest → newest for P&L timeline)
  const sortedClosed = [...siggiAccount.closedTrades].sort(
    (a, b) => Date.parse(a.closedAt ?? "0") - Date.parse(b.closedAt ?? "0"),
  );
  const holdSums = new Map<string, number>();
  const holdCounts = new Map<string, number>();

  for (const trade of sortedClosed) {
    const strat = strategyOf(trade);
    const row = getRow(strat);
    row.trades++;
    if (trade.status === "Hit Target") row.wins++;
    else if (trade.status === "Stopped") row.losses++;
    else if (trade.status === "Breakeven") row.breakevens++;
    const pnl = trade.realizedPnlGbp ?? 0;
    row.pnlGbp += pnl;
    row.pnlTimeline.push(pnl);

    if (trade.openedAt && trade.closedAt) {
      const h = (Date.parse(trade.closedAt) - Date.parse(trade.openedAt)) / 3_600_000;
      if (h > 0) {
        holdSums.set(strat, (holdSums.get(strat) ?? 0) + h);
        holdCounts.set(strat, (holdCounts.get(strat) ?? 0) + 1);
      }
    }
  }

  // Also count open trades per strategy
  for (const trade of siggiAccount.openTrades) {
    const strat = strategyOf(trade);
    getRow(strat); // ensure row exists
  }

  // Resolve derived fields
  for (const [name, row] of stratMap) {
    const cc = confidenceCounts.get(name) ?? 0;
    row.avgConfidence = cc > 0 ? (confidenceSums.get(name) ?? 0) / cc : 0;
    const hc = holdCounts.get(name) ?? 0;
    row.avgHoldHours = hc > 0 ? (holdSums.get(name) ?? 0) / hc : null;
  }

  const rows = [...stratMap.values()].sort((a, b) => {
    // Sort: strategies with real trades first, then by P&L desc
    if (b.trades !== a.trades) return b.trades - a.trades;
    return b.pnlGbp - a.pnlGbp;
  });

  // ── Aggregate totals ───────────────────────────────────────────────────────────
  const totalStrategiesUsed = rows.filter((r) => r.trades > 0).length;
  const totalStrategiesWithSignals = rows.filter((r) => r.signals > 0).length;
  const bestByWinRate = rows
    .filter((r) => r.trades >= 2)
    .sort((a, b) => {
      const wrA = a.trades > 0 ? (a.wins + a.breakevens) / a.trades : 0;
      const wrB = b.trades > 0 ? (b.wins + b.breakevens) / b.trades : 0;
      return wrB - wrA;
    })[0] ?? null;
  const bestByPnl = rows.filter((r) => r.trades > 0).sort((a, b) => b.pnlGbp - a.pnlGbp)[0] ?? null;
  const totalPnl = rows.reduce((s, r) => s + r.pnlGbp, 0);

  // ── Running equity per strategy (cumulative P&L curve) ──────────────────────
  function buildEquityCurve(pnlTimeline: number[]): number[] {
    const curve: number[] = [];
    let running = 0;
    for (const pnl of pnlTimeline) {
      running += pnl;
      curve.push(running);
    }
    return curve;
  }

  function fmt(n: number, d = 1) {
    return n.toFixed(d);
  }
  function fmtPnl(n: number) {
    return n >= 0 ? `+£${fmt(Math.abs(n))}` : `-£${fmt(Math.abs(n))}`;
  }
  function winRatePct(row: StratRow) {
    return row.trades > 0 ? ((row.wins + row.breakevens) / row.trades) * 100 : 0;
  }

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Analytics"
        title="Strategy Performance"
        description="Win rates, P&L, and signal volume broken down by strategy. Trades are matched to strategies via their linked prediction record."
      />

      {/* ── Summary strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-[5px] sm:grid-cols-4">
        {[
          {
            label: "Strategies deployed",
            value: String(totalStrategiesUsed || "—"),
            sub: `${totalStrategiesWithSignals} with signals called`,
            tone: "text-[#00C884]/80",
          },
          {
            label: "Best win rate",
            value: bestByWinRate
              ? `${fmt(winRatePct(bestByWinRate))}%`
              : "—",
            sub: bestByWinRate ? bestByWinRate.name : "No closed trades yet",
            tone: "text-emerald-300",
          },
          {
            label: "Best P&L",
            value: bestByPnl ? fmtPnl(bestByPnl.pnlGbp) : "—",
            sub: bestByPnl ? bestByPnl.name : "No closed trades yet",
            tone: bestByPnl && bestByPnl.pnlGbp >= 0 ? "text-emerald-300" : "text-red-300",
          },
          {
            label: "Total realised P&L",
            value: fmtPnl(totalPnl),
            sub: `across ${rows.filter((r) => r.trades > 0).length} strategies`,
            tone: totalPnl >= 0 ? "text-emerald-300" : "text-red-300",
          },
        ].map((card) => (
          <Panel key={card.label} className="p-3">
            <p className="micro-label">{card.label}</p>
            <p className={`mt-1 text-[1.2rem] font-bold leading-tight ${card.tone}`}>{card.value}</p>
            <p className="mt-0.5 text-[0.63rem] leading-4 text-slate-600">{card.sub}</p>
          </Panel>
        ))}
      </div>

      {/* ── Strategy cards ─────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <Panel className="p-6 text-center">
          <p className="text-[0.85rem] text-slate-400">No strategy data yet.</p>
          <p className="mt-1 text-[0.72rem] text-slate-600">
            Data appears here once Siggi has called signals or closed trades.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-[5px] lg:grid-cols-2">
          {rows.map((row) => {
            const wr = winRatePct(row);
            const resolved = row.wins + row.losses + row.breakevens;
            const equityCurve = buildEquityCurve(row.pnlTimeline);
            const isPositive = row.pnlGbp >= 0;
            const holdLabel =
              row.avgHoldHours === null ? null
              : row.avgHoldHours < 48
                ? `${Math.round(row.avgHoldHours)}h avg hold`
                : `${Math.round(row.avgHoldHours / 24)}d avg hold`;

            return (
              <Panel key={row.name} className="p-3 sm:p-3.5">
                {/* ── Header ── */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[0.92rem] font-semibold text-white leading-tight">{row.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {row.trades > 0 && (
                        <StatusChip label={`${row.trades} TRADE${row.trades === 1 ? "" : "S"}`} />
                      )}
                      {row.activeSignals > 0 && (
                        <StatusChip label={`${row.activeSignals} ACTIVE`} />
                      )}
                      {row.signals > 0 && (
                        <span className="text-[0.64rem] text-slate-600">
                          {row.signals} signal{row.signals === 1 ? "" : "s"} called
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[1.0rem] font-bold ${isPositive ? "text-emerald-300" : "text-red-300"}`}>
                      {fmtPnl(row.pnlGbp)}
                    </p>
                    {holdLabel && (
                      <p className="text-[0.63rem] text-slate-600">{holdLabel}</p>
                    )}
                  </div>
                </div>

                {/* ── Win rate bar ── */}
                {resolved > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-[0.65rem]">
                      <span className="text-slate-500">Win rate</span>
                      <span className={`font-semibold ${wr >= 60 ? "text-emerald-300" : wr >= 45 ? "text-amber-200" : "text-red-300"}`}>
                        {fmt(wr)}% · {row.wins}W {row.losses}L{row.breakevens > 0 ? ` ${row.breakevens}BE` : ""}
                      </span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full"
                        style={{
                          width: `${(row.wins / resolved) * 100}%`,
                          background: "#34d399",
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${(row.breakevens / resolved) * 100}%`,
                          background: "#64748b",
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${(row.losses / resolved) * 100}%`,
                          background: "#f87171",
                        }}
                      />
                    </div>
                    <div className="mt-0.5 flex gap-3 text-[0.60rem] text-slate-600">
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Win
                      </span>
                      {row.breakevens > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500" />
                          Breakeven
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                        Loss
                      </span>
                    </div>
                  </div>
                )}

                {/* ── P&L equity curve sparkline ── */}
                {equityCurve.length >= 2 && (
                  <div className="mb-3">
                    <p className="mb-1 text-[0.60rem] text-slate-600">Cumulative P&L curve</p>
                    <Sparkline data={equityCurve} className="h-9 w-full" />
                  </div>
                )}

                {/* ── Stats grid ── */}
                <div className="grid grid-cols-3 gap-[5px]">
                  <div className="signal-surface-soft rounded-[0.6rem] p-2">
                    <p className="text-[0.58rem] text-slate-600 uppercase tracking-[0.11em]">Signals</p>
                    <p className="mt-0.5 text-[0.84rem] font-bold text-slate-200">{row.signals}</p>
                  </div>
                  <div className="signal-surface-soft rounded-[0.6rem] p-2">
                    <p className="text-[0.58rem] text-slate-600 uppercase tracking-[0.11em]">Avg conf</p>
                    <p className="mt-0.5 text-[0.84rem] font-bold text-[#00C884]/80">
                      {row.avgConfidence > 0 ? `${Math.round(row.avgConfidence)}%` : "—"}
                    </p>
                  </div>
                  <div className="signal-surface-soft rounded-[0.6rem] p-2">
                    <p className="text-[0.58rem] text-slate-600 uppercase tracking-[0.11em]">Open now</p>
                    <p className="mt-0.5 text-[0.84rem] font-bold text-amber-200">
                      {siggiAccount.openTrades.filter((t) => strategyOf(t) === row.name).length || "—"}
                    </p>
                  </div>
                </div>

                {/* ── Empty state hint ── */}
                {row.trades === 0 && row.signals > 0 && (
                  <p className="mt-2.5 text-[0.68rem] leading-4 text-slate-600">
                    Signals called but no trades closed yet — check back after Siggi's first close on this strategy.
                  </p>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
