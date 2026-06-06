import {
  formatCurrencyAmount,
  formatCurrencyForDisplay,
} from "@/app/_lib/currency";
import { getDisplayCurrencyState } from "@/app/_lib/server/currency-preference";
import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import { PageHeader, Panel, StatusChip } from "../_components/ui";
import { SiggiResetButton } from "./siggi-reset-button";

function SummaryCard({
  label,
  value,
  detail,
  tone = "text-white",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <p className="micro-label">{label}</p>
      <p className={`mt-1.5 text-[0.98rem] font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[0.76rem] leading-5 text-slate-400">{detail}</p>
    </div>
  );
}

function formatCompactTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return "Awaiting mark";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Europe/London",
  }).format(new Date(timestamp));
}

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
      ? ((totalBalanceGbp - siggiAccount.startingBalanceGbp) /
          siggiAccount.startingBalanceGbp) *
        100
      : 0;
  const formatGbp = (value: number) =>
    formatCurrencyAmount(
      value,
      "GBP",
      displayCurrencyState.currency,
      displayCurrencyState.rates,
    );
  const formatUsd = (value: number, digits = 2) =>
    formatCurrencyForDisplay(
      value,
      displayCurrencyState.currency,
      displayCurrencyState.rates,
      digits,
    );
  const recentEquityCurve = [...siggiAccount.equityCurve]
    .slice(0, 8)
    .reverse();
  const latestOpenMarkAt =
    siggiAccount.openTrades
      .map((trade) => trade.lastMarkedAt)
      .filter((value): value is string => typeof value === "string")
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Siggi"
        title="Siggi's Trades"
        description="Siggi runs with full capital and no artificial trade limits. Every qualifying enter-now signal is acted on immediately, managed live with trailing stops and partial exits, and fed back into memory so the win rate compounds over time."
        action={<SiggiResetButton />}
      />

      <Panel className="p-3 sm:p-3.5">
        <div className="grid gap-[5px] sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            label="Live equity"
            value={formatGbp(totalBalanceGbp)}
            detail={`${siggiAccount.openTrades.length} open trades / free cash ${formatGbp(siggiAccount.cashBalanceGbp)}`}
            tone="text-cyan-200"
          />
          <SummaryCard
            label="Open P&L"
            value={`${liveOpenPnlGbp >= 0 ? "+" : ""}${formatGbp(liveOpenPnlGbp)}`}
            detail={`Marked on live pulse / latest ${formatCompactTimestamp(latestOpenMarkAt)}`}
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
            label="Resolved win rate"
            value={`${winRate}%`}
            detail={`${siggiAccount.successfulTrades} wins / ${siggiAccount.failedTrades} fails`}
            tone="text-white"
          />
          <SummaryCard
            label="Resets after bust"
            value={`${siggiAccount.resetCount}`}
            detail="How many times Siggi had to reload the paper account"
            tone="text-amber-200"
          />
        </div>
      </Panel>

      <div className="grid gap-[5px] xl:grid-cols-[1.12fr_0.88fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Open trades</p>
          <div className="mt-3 panel-stack-5">
            {siggiAccount.openTrades.length > 0 ? (
              siggiAccount.openTrades.map((trade) => (
                <div key={trade.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.92rem] font-semibold text-white">
                        {trade.symbol} / {trade.side}
                      </p>
                      <p className="mt-1 text-[0.76rem] text-slate-400">
                        Opened {new Intl.DateTimeFormat("en-GB", {
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          month: "short",
                          timeZone: "Europe/London",
                        }).format(new Date(trade.openedAt))}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusChip label="LIVE" />
                      <StatusChip label={`${trade.confidenceAtOpen}% CONF`} />
                      <StatusChip label={trade.stopMode.toUpperCase()} />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-[5px] sm:grid-cols-2 xl:grid-cols-5">
                    <SummaryCard
                      label="Entry"
                      value={formatUsd(trade.entryPrice, trade.symbol.includes("USD") ? 4 : 2)}
                      detail="Locked from the enter-now call"
                    />
                    <SummaryCard
                      label="Stop"
                      value={formatUsd(trade.stopPrice, trade.symbol.includes("USD") ? 4 : 2)}
                      detail="Failure point Siggi is respecting"
                    />
                    <SummaryCard
                      label="Target"
                      value={formatUsd(trade.targetPrice, trade.symbol.includes("USD") ? 4 : 2)}
                      detail="Profit objective being tracked"
                    />
                    <SummaryCard
                      label="Current price"
                      value={formatUsd(trade.currentPriceUsd ?? trade.entryPrice, trade.symbol.includes("USD") ? 4 : 2)}
                      detail={`P&L marked ${formatCompactTimestamp(trade.lastMarkedAt)}`}
                    />
                    <SummaryCard
                      label="Live P&L"
                      value={`${(trade.unrealizedPnlGbp ?? 0) >= 0 ? "+" : ""}${formatGbp(trade.unrealizedPnlGbp ?? 0)}`}
                      detail={`${trade.quantity.toFixed(4)} units / stake ${formatGbp(trade.stakeGbp)}`}
                      tone={(trade.unrealizedPnlGbp ?? 0) >= 0 ? "text-emerald-300" : "text-red-200"}
                    />
                  </div>

                  <p className="mt-3 text-[0.8rem] leading-5 text-slate-300">{trade.narrative}</p>
                </div>
              ))
            ) : (
              <div className="signal-surface-soft rounded-[0.4rem] p-3">
                <p className="text-[0.82rem] leading-5 text-slate-300">
                  Siggi is flat right now. The next locked enter-now setup will open here automatically on sync.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Siggi account flow</p>
          <div className="mt-3 panel-stack-5">
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Autonomous selection</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                Siggi cycles the full ranked universe on every sync with no artificial slot limit. Every qualifying enter-now signal with fresh analysis (under 1 hour old), a clean R:R above 1.5:1, and sufficient confidence gets opened. Capital is sized at 2% risk per trade so losses stay manageable even when many trades run simultaneously.
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Live management</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                As prices move, Siggi marks each open trade live, can move stops to breakeven or trail them when the move proves itself, and updates live equity rather than waiting until the trade is closed.
              </p>
            </div>
            <div className="signal-surface-soft rounded-[0.4rem] p-3">
              <p className="text-[0.9rem] font-semibold text-white">Learning loop</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">
                Every open, skip, stop move, target, stop-out, and reset is written into memory so the bot keeps refining what worked, what failed, and which conditions actually deserve trust.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-[5px] xl:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Recent equity curve</p>
          <div className="mt-3 panel-stack-5">
            {recentEquityCurve.map((snapshot) => (
              <div key={snapshot.at} className="signal-surface-soft rounded-[0.4rem] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.88rem] font-semibold text-white">
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        timeZone: "Europe/London",
                      }).format(new Date(snapshot.at))}
                    </p>
                    <p className="mt-0.5 text-[0.74rem] text-slate-400">
                      Cash {formatGbp(snapshot.cashBalanceGbp)} / {snapshot.openTrades} open trades
                    </p>
                  </div>
                  <p className="text-[0.92rem] font-semibold text-cyan-200">
                    {formatGbp(snapshot.equityGbp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <p className="micro-label">Recent activity</p>
          <div className="mt-3 panel-stack-5">
            {siggiAccount.activityLog.slice(0, 10).map((activity) => (
              <div key={activity.id} className="signal-surface-soft rounded-[0.4rem] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.88rem] font-semibold text-white">
                      {activity.symbol ? `${activity.symbol} / ${activity.type}` : activity.type}
                    </p>
                    <p className="mt-0.5 text-[0.74rem] text-slate-400">
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        timeZone: "Europe/London",
                      }).format(new Date(activity.at))}
                    </p>
                  </div>
                  <StatusChip label={activity.type.toUpperCase()} />
                </div>
                <p className="mt-2 text-[0.8rem] leading-5 text-slate-300">{activity.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="grid gap-[5px] border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[0.69rem] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid-cols-[minmax(0,1.05fr)_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_0.85fr]">
          <span>Instrument</span>
          <span>Side</span>
          <span>Entry</span>
          <span>Stop</span>
          <span>Target</span>
          <span>PnL</span>
          <span>Status</span>
        </div>

        <div>
          {siggiAccount.closedTrades.slice(0, 24).map((trade) => (
            <div
              key={trade.id}
              className="grid gap-[5px] border-b border-white/6 px-3 py-2.5 last:border-b-0 lg:grid-cols-[minmax(0,1.05fr)_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_0.85fr] lg:items-center"
            >
              <div className="min-w-0">
                <p className="text-[0.88rem] font-semibold text-white">
                  {trade.symbol} <span className="text-slate-400">/ {trade.instrumentName}</span>
                </p>
                <p className="mt-0.5 text-[0.74rem] text-slate-400">
                  {trade.closedAt
                    ? new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        timeZone: "Europe/London",
                      }).format(new Date(trade.closedAt))
                    : "Open"}
                </p>
              </div>
              <div className="text-[0.82rem] font-semibold text-white">{trade.side}</div>
              <div className="text-[0.82rem] font-semibold text-white">
                {formatUsd(trade.entryPrice, trade.symbol.includes("USD") ? 4 : 2)}
              </div>
              <div className="text-[0.82rem] font-semibold text-white">
                {formatUsd(trade.stopPrice, trade.symbol.includes("USD") ? 4 : 2)}
              </div>
              <div className="text-[0.82rem] font-semibold text-white">
                {formatUsd(trade.targetPrice, trade.symbol.includes("USD") ? 4 : 2)}
              </div>
              <div
                className={`text-[0.82rem] font-semibold ${
                  (trade.realizedPnlGbp ?? 0) >= 0 ? "text-emerald-300" : "text-red-200"
                }`}
              >
                {formatGbp(trade.realizedPnlGbp ?? 0)}
              </div>
              <div className="min-w-0">
                <StatusChip label={trade.status.toUpperCase()} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
