import Link from "next/link";
import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import { listWatchlists } from "@/app/_lib/server/repositories/watchlists";
import type {
  PersistedJournalEntry,
  PersistedTradeTicket,
} from "./_lib/server/workspace-types";
import {
  backtests,
  marketSnapshot,
  riskWarnings,
  setups,
  type Asset,
} from "./_data/mock-data";
import {
  formatCurrency,
  formatDateLabel,
  formatPercent,
  formatRiskReward,
} from "./_lib/format";
import {
  assetUniverse,
  getDefaultPersistedWatchlist,
  resolveAssetsForWatchlist,
} from "./_lib/reference-data";
import { Sparkline } from "./_components/sparkline";
import { Panel, StatusChip } from "./_components/ui";

const regimeSignals = [
  { label: "Trend Strength", value: "Strong", tone: "text-cyan-200" },
  { label: "Market Breadth", value: "Positive", tone: "text-emerald-300" },
  { label: "Volatility", value: "Moderate", tone: "text-sky-300" },
  { label: "Liquidity", value: "High", tone: "text-cyan-200" },
  { label: "Macro Tailwind", value: "Favourable", tone: "text-emerald-300" },
];

const alertTitles = ["Elevated Volatility", "Correlation Spike", "Liquidity Watch"];
const topSetups = setups.slice(0, 6);
const backtestFocus = backtests[0];
const benchmarkCurve = [100, 99, 101, 100, 102, 103, 101, 104, 106, 105, 107, 109];

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-white">
        {title}
      </h2>
      {action ? (
        <button className="text-xs font-medium text-slate-400 transition hover:text-white">
          {action}
        </button>
      ) : null}
    </div>
  );
}

function WatchlistCard({
  asset,
}: {
  asset: Asset;
}) {
  return (
    <Link
      href={`/assets/${asset.symbol}`}
      className="signal-surface rounded-[0.46rem] p-2.5 transition hover:border-cyan-300/20 hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="signal-accent-surface flex h-8 w-8 items-center justify-center rounded-full text-[0.82rem] font-semibold text-cyan-200">
            {asset.symbol[0]}
          </div>
          <div>
            <p className="text-[0.92rem] font-semibold text-white">{asset.symbol}</p>
            <p className="text-[0.68rem] text-slate-400">{asset.name}</p>
          </div>
        </div>
        <p
          className={`text-[0.84rem] font-semibold ${
            asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
          }`}
        >
          {formatPercent(asset.change24h, true)}
        </p>
      </div>

      <p className="mt-2 text-[1.18rem] font-semibold tracking-tight text-white sm:text-[1.3rem]">
        {formatCurrency(asset.price)}
      </p>
      <Sparkline data={asset.sparkline} className="mt-1.5 h-9 w-full" />

      <div className="signal-outline-divider mt-2.5 grid grid-cols-2 gap-2.5 pt-2.5">
        <div>
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-slate-500">
            Score
          </p>
          <p className="mt-1 text-[0.82rem] font-semibold text-cyan-200">{asset.score}</p>
        </div>
        <div>
          <p className="text-[0.58rem] uppercase tracking-[0.12em] text-slate-500">
            Volatility
          </p>
          <p className="mt-1 text-[0.82rem] font-semibold text-white">{asset.volatility}</p>
        </div>
      </div>
    </Link>
  );
}

function SetupMobileCard({
  setup,
  index,
}: {
  setup: (typeof setups)[number];
  index: number;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">#{index + 1}</p>
          <Link href={`/assets/${setup.symbol}`} className="mt-1 block text-[0.92rem] font-semibold text-white">
            {setup.symbol}
          </Link>
          <p className="mt-1 text-[0.82rem] text-slate-400">{setup.strategy}</p>
        </div>
        <div className="text-right">
          <span className="signal-accent-surface inline-flex h-7.5 w-7.5 items-center justify-center rounded-full text-[0.82rem] font-semibold text-cyan-200">
            {setup.score}
          </span>
          <p className="mt-1.5 text-[0.68rem] text-slate-500">{setup.entryZone}</p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-[0.82rem]">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Regime</p>
          <div className="mt-1.5">
            <TableBadge
              label={setup.regime === "Risk-On" ? "Risk-On Expansion" : setup.regime}
              tone={setup.regime === "Risk-On" ? "teal" : "default"}
            />
          </div>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Liquidity</p>
          <div className="mt-1.5">
            <TableBadge
              label={setup.liquidityStatus}
              tone={
                setup.liquidityStatus === "High"
                  ? "teal"
                  : setup.liquidityStatus === "Moderate"
                    ? "gold"
                    : "red"
              }
            />
          </div>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Stop</p>
          <p className="mt-1.5 text-red-300">{setup.stopLoss}</p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Target</p>
          <p className="mt-1.5 text-slate-200">{setup.takeProfit}</p>
          <p className="mt-0.5 text-[0.68rem] font-medium text-emerald-300">
            {formatRiskReward(setup.riskReward)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TicketMobileCard({
  ticket,
}: {
  ticket: PersistedTradeTicket;
}) {
  return (
    <div className="signal-surface-soft rounded-[0.4rem] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.92rem] font-semibold text-white">{ticket.symbol}</p>
          <p className="mt-1 text-[0.82rem] text-slate-400">{ticket.strategy}</p>
        </div>
        <StatusChip label={ticket.status.toUpperCase()} />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-[0.82rem]">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Side</p>
          <p className={`mt-1.5 ${ticket.side === "Long" ? "text-emerald-300" : "text-red-300"}`}>
            {ticket.side}
          </p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Entry</p>
          <p className="mt-1.5 text-slate-200">{formatCurrency(ticket.entry)}</p>
        </div>
      </div>
    </div>
  );
}

function TableBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "teal" | "gold" | "red";
}) {
  const classes = {
    default: "border-white/10 bg-white/[0.04] text-slate-200",
    gold: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    red: "border-red-400/20 bg-red-500/10 text-red-100",
    teal: "border-cyan-300/18 bg-cyan-400/10 text-cyan-100",
  };

  return (
    <span className={`inline-flex rounded-[0.4rem] border px-2.5 py-[0.3rem] text-[0.68rem] font-medium leading-none ${classes[tone]}`}>
      {label}
    </span>
  );
}

function buildReminderTitle(entry: PersistedJournalEntry) {
  if (entry.notes.trim()) {
    return entry.notes.trim().slice(0, 54);
  }

  return `Review ${entry.asset} ${entry.status.toLowerCase()} workflow`;
}

function buildReminderDetail(entry: PersistedJournalEntry) {
  if (entry.aiReview.trim()) {
    return entry.aiReview.trim().slice(0, 88);
  }

  return "Update journal context and confirm whether execution followed the plan.";
}

function formatReminderTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DashboardPage() {
  const [watchlists, tradeTickets, journalEntries] = await Promise.all([
    listWatchlists(),
    listTradeTickets(),
    listJournalEntries(),
  ]);

  const activeWatchlist = getDefaultPersistedWatchlist(watchlists);
  const topWatchlist = (
    activeWatchlist
      ? resolveAssetsForWatchlist(activeWatchlist.itemSymbols)
      : assetUniverse
  ).slice(0, 6);
  const recentTickets = [...tradeTickets]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 5);
  const reminderEntries = [...journalEntries]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 3);

  return (
    <div className="grid gap-[5px] xl:grid-cols-[minmax(0,1fr)_286px] 2xl:grid-cols-[minmax(0,1fr)_298px]">
      <div className="panel-stack-5">
        <Panel className="p-3 sm:p-3.5">
          <SectionHeader
            title="Watchlist Summary"
            action={activeWatchlist ? activeWatchlist.name : "Edit Watchlist"}
          />
          <div className="mt-[5px] grid gap-[5px] md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {topWatchlist.length > 0 ? (
              topWatchlist.map((asset) => (
                <WatchlistCard key={asset.symbol} asset={asset} />
              ))
            ) : (
              <div className="signal-surface-soft rounded-[0.4rem] p-3 text-[0.84rem] text-slate-300 md:col-span-2 xl:col-span-3 2xl:col-span-4">
                Create or populate a watchlist in the assets workspace to surface it here.
              </div>
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden p-2.5 sm:p-3">
          <SectionHeader title="Top-Ranked Setups" />
          <div className="mt-2.5 space-y-2 md:hidden">
            {topSetups.map((setup, index) => (
              <SetupMobileCard key={setup.id} setup={setup} index={index} />
            ))}
          </div>
          <div className="mt-2.5 hidden overflow-x-auto md:block">
            <table className="data-table min-w-[920px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Asset</th>
                  <th>Strategy</th>
                  <th>Score</th>
                  <th>Regime</th>
                  <th>Entry</th>
                  <th>Stop-loss</th>
                  <th>Take-profit Target</th>
                  <th>Tradeability</th>
                </tr>
              </thead>
              <tbody>
                {topSetups.map((setup, index) => (
                  <tr key={setup.id}>
                    <td className="text-slate-400">{index + 1}</td>
                    <td>
                      <Link
                        href={`/assets/${setup.symbol}`}
                        className="font-semibold text-white hover:text-cyan-200"
                      >
                        {setup.symbol}
                      </Link>
                    </td>
                    <td className="text-slate-300">{setup.strategy}</td>
                    <td>
                      <span className="signal-accent-surface inline-flex h-7.5 w-7.5 items-center justify-center rounded-full text-[0.82rem] font-semibold text-cyan-200">
                        {setup.score}
                      </span>
                    </td>
                    <td>
                      <TableBadge
                        label={setup.regime === "Risk-On" ? "Risk-On Expansion" : setup.regime}
                        tone={setup.regime === "Risk-On" ? "teal" : "default"}
                      />
                    </td>
                    <td className="text-slate-200">{setup.entryZone}</td>
                    <td className="text-red-300">{setup.stopLoss}</td>
                    <td>
                      <p className="text-slate-200">{setup.takeProfit}</p>
                      <p className="mt-0.5 text-[0.68rem] font-medium text-emerald-300">
                        {formatRiskReward(setup.riskReward)}
                      </p>
                    </td>
                    <td>
                      <TableBadge
                        label={setup.liquidityStatus}
                        tone={
                          setup.liquidityStatus === "High"
                            ? "teal"
                            : setup.liquidityStatus === "Moderate"
                              ? "gold"
                              : "red"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="signal-outline-divider mt-2 flex justify-center pt-2.5">
            <Link href="/scanner" className="text-[0.84rem] font-medium text-slate-400 transition hover:text-white">
              View all setups
            </Link>
          </div>
        </Panel>

        <div className="grid gap-[5px] xl:grid-cols-2">
          <Panel className="p-2.5 sm:p-3">
            <SectionHeader title="Recent Trade Tickets" />
            <div className="mt-2.5 space-y-2 md:hidden">
              {recentTickets.length > 0 ? (
                recentTickets.map((ticket) => (
                  <TicketMobileCard key={ticket.id} ticket={ticket} />
                ))
              ) : (
                <div className="signal-surface-soft rounded-[0.4rem] p-3 text-[0.84rem] text-slate-300">
                  No persisted trade tickets yet.
                </div>
              )}
            </div>
            <div className="mt-2.5 hidden overflow-x-auto md:block">
              <table className="data-table min-w-[520px]">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Side</th>
                    <th>Strategy</th>
                    <th>Entry</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTickets.length > 0 ? (
                    recentTickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td className="font-semibold text-white">{ticket.symbol}</td>
                        <td className={ticket.side === "Long" ? "text-emerald-300" : "text-red-300"}>
                          {ticket.side}
                        </td>
                        <td className="text-slate-300">{ticket.strategy}</td>
                        <td className="text-slate-200">{formatCurrency(ticket.entry)}</td>
                        <td>
                          <StatusChip label={ticket.status.toUpperCase()} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-slate-400">
                        No saved trade tickets yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="signal-outline-divider mt-2 flex justify-center pt-2.5">
              <Link href="/trade-tickets" className="text-[0.84rem] font-medium text-slate-400 transition hover:text-white">
                View all trade tickets
              </Link>
            </div>
          </Panel>

          <Panel className="p-2.5 sm:p-3">
            <SectionHeader title="Journal Reminders / Follow-ups" />
            <div className="mt-2.5 space-y-2">
              {reminderEntries.length > 0 ? (
                reminderEntries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`flex flex-col gap-2.5 rounded-[0.4rem] border px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between ${
                      index === 0
                        ? "signal-accent-surface"
                        : "signal-surface-soft"
                    }`}
                  >
                    <div className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[0.22rem] border text-[0.62rem] ${
                          index === 0
                            ? "border-cyan-300/25 bg-cyan-300 text-[#04101d]"
                            : "border-white/12 bg-transparent"
                        }`}
                      >
                        {index === 0 ? "OK" : ""}
                      </span>
                      <div>
                        <p className="text-[0.84rem] font-medium text-white">
                          {buildReminderTitle(entry)}
                        </p>
                        <p className="mt-0.5 text-[0.68rem] text-slate-500">
                          {buildReminderDetail(entry)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-[0.68rem] text-slate-400">
                      <p>{formatDateLabel(entry.date)}</p>
                      <p className="mt-1">{formatReminderTime(entry.updatedAt)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="signal-surface-soft rounded-[0.4rem] p-3 text-[0.84rem] text-slate-300">
                  No persisted journal entries yet.
                </div>
              )}
            </div>
            <div className="signal-outline-divider mt-2 flex justify-center pt-2.5">
              <Link href="/journal" className="text-[0.84rem] font-medium text-slate-400 transition hover:text-white">
                View all journal entries
              </Link>
            </div>
          </Panel>
        </div>

        <Panel className="overflow-hidden p-2.5 sm:p-3">
          <SectionHeader title="Latest Backtest Results" />
          <div className="mt-3 grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[372px_minmax(0,1fr)]">
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[1.15rem] font-semibold text-white sm:text-[1.3rem]">
                    {backtestFocus.strategy}
                  </h3>
                  <span className="signal-accent-surface rounded-[0.4rem] px-2 py-0.5 text-[0.68rem] font-semibold text-cyan-100">
                    v2.4
                  </span>
                </div>
                <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-400">
                  Signalibrium backtest focus is prioritising reproducibility,
                  realistic drawdown, and regime-aware performance rather than hype
                  metrics.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Total Return
                  </p>
                  <p className="mt-1 text-[1.28rem] font-semibold text-emerald-300 sm:text-[1.45rem]">
                    {formatPercent(backtestFocus.totalReturn, true)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Annualised
                  </p>
                  <p className="mt-1 text-[1.28rem] font-semibold text-emerald-300 sm:text-[1.45rem]">
                    {formatPercent(backtestFocus.annualisedReturn, true)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Win Rate
                  </p>
                  <p className="mt-1 text-[1.28rem] font-semibold text-white sm:text-[1.45rem]">
                    {formatPercent(backtestFocus.winRate)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Profit Factor
                  </p>
                  <p className="mt-1 text-[1.28rem] font-semibold text-white sm:text-[1.45rem]">
                    {backtestFocus.profitFactor.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Max Drawdown
                  </p>
                  <p className="mt-1 text-[1.28rem] font-semibold text-red-300 sm:text-[1.45rem]">
                    {formatPercent(backtestFocus.maxDrawdown)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Trades
                  </p>
                  <p className="mt-1 text-[1.28rem] font-semibold text-white sm:text-[1.45rem]">142</p>
                </div>
              </div>

              <div className="signal-outline-divider grid gap-3 pt-3 sm:grid-cols-2">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Test Period
                  </p>
                  <p className="mt-1 text-[0.82rem] text-white">Jan 2025 - May 2026</p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Assets
                  </p>
                  <p className="mt-1 text-[0.82rem] text-white">Top AI & infra basket</p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Timeframe
                  </p>
                  <p className="mt-1 text-[0.82rem] text-white">4H</p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Capital
                  </p>
                  <p className="mt-1 text-[0.82rem] text-white">$10,000</p>
                </div>
              </div>
            </div>

            <div className="signal-surface rounded-[0.46rem] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="h-0.5 w-5 bg-cyan-300" />
                    <span>Strategy Equity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-0.5 w-5 bg-white/35" />
                    <span>Benchmark</span>
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  {["1M", "3M", "6M", "1Y", "All"].map((range, index) => (
                    <button
                      key={range}
                      className={`rounded-[0.4rem] border px-2.5 py-1 ${
                        index === 4
                          ? "signal-accent-surface text-cyan-100"
                          : "signal-surface-soft text-slate-400"
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="signal-surface signal-grid mt-3 rounded-[0.46rem] px-2.5 py-2.5">
                <div className="relative h-[190px] sm:h-[220px]">
                  <div className="absolute inset-y-0 left-0 flex flex-col justify-between text-xs text-slate-500">
                    <span>60%</span>
                    <span>30%</span>
                    <span>0%</span>
                    <span>-30%</span>
                  </div>
                  <div className="ml-12 h-full">
                    <Sparkline
                      data={backtestFocus.equityCurve}
                      className="absolute inset-0 h-full w-full"
                    />
                    <Sparkline
                      data={benchmarkCurve}
                      className="absolute inset-0 h-full w-full opacity-45"
                      color="#A1A1AA"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-between gap-2 text-[0.64rem] text-slate-500 sm:text-[0.68rem]">
                  <span>Jan 25</span>
                  <span>Apr 25</span>
                  <span>Jul 25</span>
                  <span>Oct 25</span>
                  <span>Jan 26</span>
                  <span>May 26</span>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="panel-stack-5 xl:sticky xl:top-[6.85rem] xl:self-start">
        <Panel className="p-2.5 sm:p-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Market Regime" />
            <p className="text-xs text-slate-500">Updated 03:47 BST</p>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[1.2rem] font-semibold leading-tight text-white sm:text-[1.35rem]">
                Risk-On Expansion
              </h3>
              <TableBadge label="Bullish" tone="teal" />
            </div>
            <p className="mt-3 text-[0.82rem] text-slate-400">AI Regime Score</p>
            <div className="mt-1.5 flex items-end gap-2">
              <span className="text-[2rem] font-semibold tracking-tight text-cyan-200 sm:text-[2.35rem]">
                {marketSnapshot.breadthScore}
              </span>
              <span className="pb-1.5 text-[0.84rem] text-slate-400">/100</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#00E5FF_0%,#009BFF_50%,#256BFF_100%)]"
                style={{ width: `${marketSnapshot.breadthScore}%` }}
              />
            </div>
          </div>

          <div className="signal-outline-divider mt-4 space-y-3 pt-4">
            {regimeSignals.map((signal) => (
              <div key={signal.label} className="flex items-center justify-between gap-4">
                <p className="text-[0.84rem] text-slate-300">{signal.label}</p>
                <p className={`text-[0.84rem] font-semibold ${signal.tone}`}>{signal.value}</p>
              </div>
            ))}
          </div>

          <p className="signal-outline-divider mt-4 pt-3 text-center text-[0.68rem] text-slate-500">
            Regime analysis powered by Signalibrium AI
          </p>
        </Panel>

        <Panel className="p-2.5 sm:p-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Risk Warnings" />
            <span className="signal-warning-surface rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold text-amber-100">
              {riskWarnings.length}
            </span>
          </div>

          <div className="mt-2.5 space-y-2">
            {riskWarnings.map((warning, index) => (
              <div
                key={warning}
                className="signal-warning-surface rounded-[0.46rem] p-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="signal-warning-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-amber-200">
                    {index === 0 ? "!" : index === 1 ? "*" : "~"}
                  </div>
                  <div>
                    <p className="text-[0.84rem] font-semibold text-amber-100">{alertTitles[index]}</p>
                    <p className="mt-1.5 text-[0.82rem] leading-5 text-slate-300">{warning}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="signal-outline-divider mt-2.5 flex justify-center pt-3">
            <Link href="/risk-lab" className="text-[0.84rem] font-medium text-slate-400 transition hover:text-white">
              View all risk alerts
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
