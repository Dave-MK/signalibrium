import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { PageHeader, Panel, StatusChip } from "../_components/ui";
import { Sparkline } from "../_components/sparkline";

function fmt(n: number, digits = 1) {
  return n.toFixed(digits);
}

export default async function BacktestingLabPage() {
  const backtests = await listBacktests();

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const total = backtests.length;
  const avgWinRate =
    total > 0
      ? backtests.reduce((s, b) => s + b.winRate, 0) / total
      : 0;
  const avgReturn =
    total > 0
      ? backtests.reduce((s, b) => s + b.totalReturn, 0) / total
      : 0;
  const avgSharpe =
    total > 0
      ? backtests.reduce((s, b) => s + b.sharpe, 0) / total
      : 0;
  const bestByReturn = [...backtests].sort((a, b) => b.totalReturn - a.totalReturn)[0] ?? null;

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const winRateTone = (wr: number) =>
    wr >= 0.6 ? "text-emerald-300" : wr >= 0.45 ? "text-amber-200" : "text-red-300";
  const returnTone = (r: number) => (r >= 0 ? "text-emerald-300" : "text-red-300");
  const sharpeTone = (s: number) =>
    s >= 1.5 ? "text-emerald-300" : s >= 0.8 ? "text-amber-200" : "text-red-300";
  const ddTone = (dd: number) =>
    dd <= -20 ? "text-red-300" : dd <= -10 ? "text-amber-200" : "text-emerald-300";

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Lab"
        title="Backtesting Lab"
        description="Strategy performance metrics computed against historical data for each instrument in the universe. All figures are estimates derived from strategy-class profiles — live fills will replace these as trades accumulate."
      />

      {/* ── Summary strip ─────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div className="grid grid-cols-2 gap-[5px] sm:grid-cols-4">
          {[
            {
              label: "Strategies tracked",
              value: String(total),
              sub: "instrument × strategy pairs",
              tone: "text-cyan-200",
            },
            {
              label: "Avg win rate",
              value: `${fmt(avgWinRate * 100)}%`,
              sub: "across all backtests",
              tone: winRateTone(avgWinRate),
            },
            {
              label: "Avg total return",
              value: `+${fmt(avgReturn)}%`,
              sub: "on starting capital",
              tone: returnTone(avgReturn),
            },
            {
              label: "Avg Sharpe",
              value: fmt(avgSharpe, 2),
              sub: "risk-adjusted return",
              tone: sharpeTone(avgSharpe),
            },
          ].map((card) => (
            <Panel key={card.label} className="p-3">
              <p className="micro-label">{card.label}</p>
              <p className={`mt-1 text-[1.25rem] font-bold ${card.tone}`}>{card.value}</p>
              <p className="mt-0.5 text-[0.65rem] text-slate-600">{card.sub}</p>
            </Panel>
          ))}
        </div>
      )}

      {/* ── Best performer callout ─────────────────────────────────────────────── */}
      {bestByReturn && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4">
          <div className="flex items-center gap-3">
            <span className="text-lg">🏆</span>
            <div>
              <p className="text-[0.80rem] font-semibold text-white">
                {bestByReturn.asset}
                <span className="ml-2 text-[0.72rem] font-normal text-slate-400">
                  {bestByReturn.strategy} · {bestByReturn.timeframe}
                </span>
              </p>
              <p className="text-[0.70rem] text-slate-500">Highest total return in the universe</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-[0.65rem] text-slate-600">Total return</p>
              <p className="text-[0.88rem] font-bold text-emerald-300">
                +{fmt(bestByReturn.totalReturn)}%
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] text-slate-600">Win rate</p>
              <p className={`text-[0.88rem] font-bold ${winRateTone(bestByReturn.winRate)}`}>
                {fmt(bestByReturn.winRate * 100)}%
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] text-slate-600">Sharpe</p>
              <p className={`text-[0.88rem] font-bold ${sharpeTone(bestByReturn.sharpe)}`}>
                {fmt(bestByReturn.sharpe, 2)}
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* ── Backtest cards ─────────────────────────────────────────────────────── */}
      {total === 0 ? (
        <Panel className="p-6 text-center">
          <p className="text-[0.85rem] text-slate-400">No backtests in the workspace yet.</p>
          <p className="mt-1 text-[0.72rem] text-slate-600">
            Backtests are seeded automatically alongside the instrument universe.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-[5px] lg:grid-cols-2">
          {backtests.map((bt) => {
            const wrPct = bt.winRate * 100;
            const hasPositiveEquity =
              bt.equityCurve.length >= 2 &&
              bt.equityCurve[bt.equityCurve.length - 1] > bt.equityCurve[0];

            return (
              <Panel key={bt.id} className="p-3 sm:p-3.5">
                {/* ── Header ── */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[0.94rem] font-semibold text-white">
                      {bt.asset}
                    </p>
                    <p className="mt-0.5 text-[0.72rem] text-slate-400">
                      {bt.strategy}
                      {bt.timeframe && (
                        <span className="ml-1.5 text-slate-600">· {bt.timeframe}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusChip label={bt.status} />
                    {bt.aiRead && (
                      <span className="text-[0.65rem] font-medium text-slate-500">
                        {bt.aiRead}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Metrics grid ── */}
                <div className="mb-3 grid grid-cols-3 gap-[5px] sm:grid-cols-5">
                  {/* Win Rate */}
                  <div className="signal-surface-soft rounded-[0.38rem] p-2">
                    <p className="text-[0.60rem] text-slate-500 uppercase tracking-[0.12em]">
                      Win rate
                    </p>
                    <p className={`mt-0.5 text-[0.88rem] font-bold ${winRateTone(bt.winRate)}`}>
                      {fmt(wrPct)}%
                    </p>
                    <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${wrPct}%`,
                          background:
                            bt.winRate >= 0.6
                              ? "#34d399"
                              : bt.winRate >= 0.45
                                ? "#fbbf24"
                                : "#f87171",
                        }}
                      />
                    </div>
                  </div>

                  {/* Total Return */}
                  <div className="signal-surface-soft rounded-[0.38rem] p-2">
                    <p className="text-[0.60rem] text-slate-500 uppercase tracking-[0.12em]">
                      Return
                    </p>
                    <p className={`mt-0.5 text-[0.88rem] font-bold ${returnTone(bt.totalReturn)}`}>
                      {bt.totalReturn >= 0 ? "+" : ""}{fmt(bt.totalReturn)}%
                    </p>
                    <p className="mt-0.5 text-[0.58rem] text-slate-600">
                      {fmt(bt.annualisedReturn)}% ann.
                    </p>
                  </div>

                  {/* Max Drawdown */}
                  <div className="signal-surface-soft rounded-[0.38rem] p-2">
                    <p className="text-[0.60rem] text-slate-500 uppercase tracking-[0.12em]">
                      Max DD
                    </p>
                    <p className={`mt-0.5 text-[0.88rem] font-bold ${ddTone(bt.maxDrawdown)}`}>
                      {fmt(bt.maxDrawdown)}%
                    </p>
                  </div>

                  {/* Profit Factor */}
                  <div className="signal-surface-soft rounded-[0.38rem] p-2">
                    <p className="text-[0.60rem] text-slate-500 uppercase tracking-[0.12em]">
                      Prof. factor
                    </p>
                    <p
                      className={`mt-0.5 text-[0.88rem] font-bold ${
                        bt.profitFactor >= 1.8
                          ? "text-emerald-300"
                          : bt.profitFactor >= 1.2
                            ? "text-amber-200"
                            : "text-red-300"
                      }`}
                    >
                      {fmt(bt.profitFactor, 2)}
                    </p>
                  </div>

                  {/* Sharpe */}
                  <div className="signal-surface-soft rounded-[0.38rem] p-2">
                    <p className="text-[0.60rem] text-slate-500 uppercase tracking-[0.12em]">
                      Sharpe
                    </p>
                    <p className={`mt-0.5 text-[0.88rem] font-bold ${sharpeTone(bt.sharpe)}`}>
                      {fmt(bt.sharpe, 2)}
                    </p>
                  </div>
                </div>

                {/* ── Equity curve sparkline ── */}
                {bt.equityCurve.length >= 3 && (
                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-[0.60rem] text-slate-600">
                      <span>Equity curve</span>
                      <span className={hasPositiveEquity ? "text-emerald-500" : "text-red-400"}>
                        {hasPositiveEquity ? "↗" : "↘"} {bt.dateRange}
                      </span>
                    </div>
                    <Sparkline
                      data={bt.equityCurve}
                      className="h-10 w-full"
                    />
                  </div>
                )}

                {/* ── Params ── */}
                <div className="mb-2.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.68rem] text-slate-500">
                  <span>Capital £{(bt.startingCapital / 1000).toFixed(0)}k</span>
                  <span>Fees {bt.feesBps}bps</span>
                  <span>Slippage {bt.slippageBps}bps</span>
                </div>

                {/* ── Warnings ── */}
                {bt.warnings.length > 0 && (
                  <div className="rounded-[0.35rem] border border-amber-400/15 bg-amber-400/5 px-2.5 py-2">
                    <p className="mb-1 text-[0.60rem] font-semibold uppercase tracking-wider text-amber-400/70">
                      Notes
                    </p>
                    <ul className="space-y-0.5">
                      {bt.warnings.map((w, i) => (
                        <li key={i} className="text-[0.68rem] leading-4 text-amber-200/60">
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
