import {
  formatCurrencyAmount,
  formatCurrencyForDisplay,
} from "@/app/_lib/currency";
import { getDisplayCurrencyState } from "@/app/_lib/server/currency-preference";
import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import { PageHeader, Panel, StatusChip, SummaryCard } from "../_components/ui";
import { TradePlanChart } from "../_components/trade-plan-chart";
import { EquityCurveChart } from "../_components/equity-curve-chart";
import { SiggiResetButton } from "./siggi-reset-button";

function formatCompactTimestamp(timestamp: string | null) {
  if (!timestamp) return "Awaiting mark";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/London",
  }).format(new Date(timestamp));
}

// Account flow copy — shown in the "i" hover tooltip on each trade card
const ACCOUNT_FLOW_SECTIONS = [
  {
    heading: "How Siggi opens trades",
    body: "Every qualifying ENTER NOW signal with fresh analysis, clean R:R above 1.5:1, and sufficient confidence gets opened automatically. Capital is sized at 2% risk per trade so losses stay manageable even when many trades run at once.",
  },
  {
    heading: "Live management",
    body: "As prices move, Siggi marks each trade live, moves stops to breakeven when the move proves itself, and trails them toward target. P&L updates on every pulse — not just at close.",
  },
  {
    heading: "Learning loop",
    body: "Every open, skip, stop move, and close is written into memory. The bot refines what worked, what failed, and which conditions actually deserve trust — compounding accuracy over time.",
  },
];

export default async function SiggiDoesTradingPage() {
  const [siggiAccount, displayCurrencyState] = await Promise.all([
    getSiggiAccount(),
    getDisplayCurrencyState(),
  ]);

  const liveOpenPnlGbp = siggiAccount.openTrades.reduce(
    (total, trade) => total + (trade.unrealizedPnlGbp ?? 0),
    0,
  );
  const totalBalanceGbp =
    siggiAccount.cashBalanceGbp +
    siggiAccount.openTrades.reduce((total, trade) => total + trade.stakeGbp, 0) +
    liveOpenPnlGbp;
  const resolvedTrades = siggiAccount.successfulTrades + siggiAccount.failedTrades;
  const winRate = resolvedTrades
    ? Math.round((siggiAccount.successfulTrades / resolvedTrades) * 1000) / 10
    : 0;
  const growthPct =
    siggiAccount.startingBalanceGbp > 0
      ? ((totalBalanceGbp - siggiAccount.startingBalanceGbp) / siggiAccount.startingBalanceGbp) * 100
      : 0;

  const formatGbp = (value: number) =>
    formatCurrencyAmount(value, "GBP", displayCurrencyState.currency, displayCurrencyState.rates);
  const formatUsd = (value: number, digits = 2) =>
    formatCurrencyForDisplay(value, displayCurrencyState.currency, displayCurrencyState.rates, digits);

  // Use up to 40 equity snapshots for the chart — newest last
  const equityCurve = [...siggiAccount.equityCurve].reverse().slice(-40);

  const latestOpenMarkAt =
    siggiAccount.openTrades
      .map((t) => t.lastMarkedAt)
      .filter((v): v is string => typeof v === "string")
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Siggi"
        title="Siggi's Trades"
        description="Siggi runs with full capital — every qualifying signal is acted on, managed live, and fed back into memory so accuracy compounds over time."
        action={<SiggiResetButton />}
      />

      {/* ── Summary metrics ── */}
      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            label="Live equity"
            value={formatGbp(totalBalanceGbp)}
            detail={`${siggiAccount.openTrades.length} open · free cash ${formatGbp(siggiAccount.cashBalanceGbp)}`}
            tone="text-cyan-200"
          />
          <SummaryCard
            label="Open P&L"
            value={`${liveOpenPnlGbp >= 0 ? "+" : ""}${formatGbp(liveOpenPnlGbp)}`}
            detail={`Pulse-marked · latest ${formatCompactTimestamp(latestOpenMarkAt)}`}
            tone={liveOpenPnlGbp >= 0 ? "text-emerald-300" : "text-red-200"}
          />
          <SummaryCard
            label="High watermark"
            value={formatGbp(siggiAccount.highWatermarkGbp)}
            detail="Best paper-equity level so far"
            tone="text-emerald-300"
          />
          <SummaryCard
            label="Growth vs start"
            value={`${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`}
            detail={`Started from ${formatGbp(siggiAccount.startingBalanceGbp)}`}
            tone={growthPct >= 0 ? "text-emerald-300" : "text-red-200"}
          />
          <SummaryCard
            label="Win rate"
            value={`${winRate}%`}
            detail={`${siggiAccount.successfulTrades} wins / ${siggiAccount.failedTrades} losses`}
            tone="text-white"
          />
          <SummaryCard
            label="Resets"
            value={`${siggiAccount.resetCount}`}
            detail="Times Siggi had to reload after a bust"
            tone="text-amber-200"
          />
        </div>
      </Panel>

      {/* ── Open trades with embedded plan charts ── */}
      <Panel className="p-3 sm:p-3.5">
        <p className="micro-label">Open trades</p>
        <div className="mt-3 space-y-3">
          {siggiAccount.openTrades.length > 0 ? (
            siggiAccount.openTrades.map((trade) => {
              const pnl = trade.unrealizedPnlGbp ?? 0;
              const dp = trade.symbol.includes("JPY") ? 3 : trade.entryPrice < 10 ? 4 : trade.entryPrice < 1000 ? 2 : 0;
              return (
                <div key={trade.id} className="signal-surface-soft rounded-[0.4rem]">
                  <div className="grid lg:grid-cols-[1fr_260px]">
                    {/* ── Left: trade details ── */}
                    <div className="p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[0.92rem] font-semibold text-white">
                              {trade.symbol}
                              <span className={`ml-2 text-[0.80rem] font-semibold ${trade.side === "BUY" ? "text-emerald-300" : "text-amber-200"}`}>
                                {trade.side === "BUY" ? "▲ BUY" : "▼ SELL"}
                              </span>
                            </p>

                            {/* ── "i" info button with hover tooltip ── */}
                            <div className="group/info relative">
                              <button
                                type="button"
                                aria-label="How Siggi manages this trade"
                                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[0.62rem] font-bold text-slate-500 transition hover:border-cyan-400/40 hover:text-cyan-300"
                              >
                                i
                              </button>
                              {/* Tooltip — pure CSS hover, no JS */}
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 scale-95 rounded-[0.5rem] border border-white/10 bg-[#07111d] p-3 opacity-0 shadow-[0_16px_48px_rgba(0,0,0,0.6)] transition-all duration-150 group-hover/info:pointer-events-auto group-hover/info:scale-100 group-hover/info:opacity-100">
                                <p className="mb-2 text-[0.70rem] font-semibold uppercase tracking-wider text-slate-500">
                                  How Siggi operates
                                </p>
                                {ACCOUNT_FLOW_SECTIONS.map((section) => (
                                  <div key={section.heading} className="mb-2 last:mb-0">
                                    <p className="text-[0.76rem] font-semibold text-white">{section.heading}</p>
                                    <p className="mt-0.5 text-[0.72rem] leading-[1.45] text-slate-400">{section.body}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <p className="mt-0.5 text-[0.73rem] text-slate-400">
                            Opened {formatCompactTimestamp(trade.openedAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip label="LIVE" />
                          <StatusChip label={`${trade.confidenceAtOpen}% CONF`} />
                          <StatusChip label={trade.stopMode.toUpperCase()} />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-5">
                        <SummaryCard
                          label="Entry"
                          value={formatUsd(trade.entryPrice, dp)}
                          detail="Locked from signal"
                        />
                        <SummaryCard
                          label="Stop"
                          value={formatUsd(trade.stopPrice, dp)}
                          detail="Invalidation level"
                        />
                        <SummaryCard
                          label="Target"
                          value={formatUsd(trade.targetPrice, dp)}
                          detail="Profit objective"
                        />
                        <SummaryCard
                          label="Live price"
                          value={formatUsd(trade.currentPriceUsd ?? trade.entryPrice, dp)}
                          detail={`Marked ${formatCompactTimestamp(trade.lastMarkedAt)}`}
                        />
                        <SummaryCard
                          label="Live P&L"
                          value={`${pnl >= 0 ? "+" : ""}${formatGbp(pnl)}`}
                          detail={`${trade.quantity.toFixed(4)} units · stake ${formatGbp(trade.stakeGbp)}`}
                          tone={pnl >= 0 ? "text-emerald-300" : "text-red-200"}
                        />
                      </div>

                      <p className="mt-2.5 text-[0.78rem] leading-5 text-slate-400">{trade.narrative}</p>
                    </div>

                    {/* ── Right: trade plan chart (overflow-hidden here, not on outer card, so tooltip isn't clipped) ── */}
                    <div className="flex items-stretch overflow-hidden rounded-br-[0.4rem] rounded-tr-[0.4rem] border-t border-white/6 lg:border-l lg:border-t-0">
                      <div className="flex w-full flex-col">
                        <p className="px-3 pt-2.5 text-[0.64rem] font-semibold uppercase tracking-wider text-slate-600">
                          Trade plan
                        </p>
                        <div className="flex-1 px-1 pb-2">
                          <TradePlanChart
                            entry={trade.entryPrice}
                            stop={trade.stopPrice}
                            target={trade.targetPrice}
                            current={trade.currentPriceUsd}
                            side={trade.side}
                            symbol={trade.symbol}
                            initialStopPrice={trade.initialStopPrice}
                            stopMode={trade.stopMode}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="text-[0.82rem] leading-5 text-slate-300">
                Siggi is flat right now. The next locked enter-now setup will open here automatically on the next sync.
              </p>
            </div>
          )}
        </div>
      </Panel>

      {/* ── Equity curve chart + activity log ── */}
      <div className="grid gap-[5px] xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-3 sm:p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="micro-label">Equity curve</p>
            <p className="text-[0.72rem] text-slate-500">
              {equityCurve.length} snapshots · hover for detail
            </p>
          </div>
          <EquityCurveChart
            curve={equityCurve}
            startingBalanceGbp={siggiAccount.startingBalanceGbp}
          />
          {equityCurve.length > 0 && (
            <div className="mt-3 grid gap-[5px] sm:grid-cols-3">
              <SummaryCard
                label="Starting balance"
                value={formatGbp(siggiAccount.startingBalanceGbp)}
                detail="Paper account seed"
              />
              <SummaryCard
                label="Current equity"
                value={formatGbp(totalBalanceGbp)}
                detail="Cash + open stakes + unrealised P&L"
                tone={totalBalanceGbp >= siggiAccount.startingBalanceGbp ? "text-emerald-300" : "text-red-200"}
              />
              <SummaryCard
                label="Peak equity"
                value={formatGbp(siggiAccount.highWatermarkGbp)}
                detail="All-time high watermark"
                tone="text-cyan-200"
              />
            </div>
          )}
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Recent activity</p>
          <div className="mt-3 space-y-2">
            {siggiAccount.activityLog.slice(0, 12).map((activity) => (
              <div key={activity.id} className="signal-surface-soft rounded-[0.4rem] p-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.84rem] font-semibold text-white">
                      {activity.symbol ? `${activity.symbol}` : "System"}
                      <span className="ml-1.5 text-[0.72rem] font-normal text-slate-400">/ {activity.type}</span>
                    </p>
                    <p className="mt-0.5 text-[0.70rem] text-slate-500">
                      {formatCompactTimestamp(activity.at)}
                    </p>
                  </div>
                  <StatusChip label={activity.type.toUpperCase()} />
                </div>
                <p className="mt-1.5 text-[0.76rem] leading-[1.45] text-slate-400">{activity.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Closed trades table ── */}
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-white/8 bg-white/[0.02] px-3 py-2.5">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Closed trades
          </p>
        </div>
        <div className="grid gap-x-3 border-b border-white/6 bg-white/[0.015] px-3 py-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.13em] text-slate-600 lg:grid-cols-[minmax(0,1.05fr)_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_0.85fr]">
          <span>Instrument</span>
          <span>Side</span>
          <span>Entry</span>
          <span>Stop</span>
          <span>Target</span>
          <span>P&L</span>
          <span>Status</span>
        </div>
        <div>
          {siggiAccount.closedTrades.slice(0, 30).map((trade) => {
            const dp = trade.symbol.includes("JPY") ? 3 : trade.entryPrice < 10 ? 4 : trade.entryPrice < 1000 ? 2 : 0;
            const pnl = trade.realizedPnlGbp ?? 0;
            return (
              <div
                key={trade.id}
                className="grid gap-[5px] border-b border-white/5 px-3 py-2.5 last:border-b-0 lg:grid-cols-[minmax(0,1.05fr)_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_0.85fr] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.84rem] font-semibold text-white">
                    {trade.symbol}
                    <span className="ml-1.5 text-[0.74rem] font-normal text-slate-500">{trade.instrumentName}</span>
                  </p>
                  <p className="mt-0.5 text-[0.70rem] text-slate-500">
                    {trade.closedAt ? formatCompactTimestamp(trade.closedAt) : "Open"}
                  </p>
                </div>
                <div className={`text-[0.82rem] font-semibold ${trade.side === "BUY" ? "text-emerald-300" : "text-amber-200"}`}>
                  {trade.side}
                </div>
                <div className="text-[0.80rem] text-slate-300">{formatUsd(trade.entryPrice, dp)}</div>
                <div className="text-[0.80rem] text-slate-300">{formatUsd(trade.stopPrice, dp)}</div>
                <div className="text-[0.80rem] text-slate-300">{formatUsd(trade.targetPrice, dp)}</div>
                <div className={`text-[0.82rem] font-semibold ${pnl >= 0 ? "text-emerald-300" : "text-red-200"}`}>
                  {pnl >= 0 ? "+" : ""}{formatGbp(pnl)}
                </div>
                <div>
                  <StatusChip label={trade.status === "Hit Target" ? "HIT TARGET" : trade.status === "Stopped" ? "STOPPED" : trade.status.toUpperCase()} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
