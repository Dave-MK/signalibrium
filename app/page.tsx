import Link from "next/link";
import {
  backtests,
  journalEntries,
  journalReminders,
  marketSnapshot,
  riskWarnings,
  setups,
  tradeTickets,
  watchlist,
} from "./_data/mock-data";
import {
  formatCurrency,
  formatDateLabel,
  formatPercent,
  formatRiskReward,
} from "./_lib/format";
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
const topWatchlist = watchlist.slice(0, 6);
const topSetups = setups.slice(0, 6);
const recentTickets = tradeTickets;
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
  asset: (typeof watchlist)[number];
}) {
  return (
    <Link
      href={`/assets/${asset.symbol}`}
      className="signal-surface rounded-[0.62rem] p-3 transition hover:border-cyan-300/20 hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="signal-accent-surface flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-cyan-200">
            {asset.symbol[0]}
          </div>
          <div>
            <p className="font-semibold text-white">{asset.symbol}</p>
            <p className="text-xs text-slate-400">{asset.name}</p>
          </div>
        </div>
        <p
          className={`text-sm font-semibold ${
            asset.change24h >= 0 ? "text-emerald-300" : "text-red-300"
          }`}
        >
          {formatPercent(asset.change24h, true)}
        </p>
      </div>

      <p className="mt-2.5 text-[1.38rem] font-semibold tracking-tight text-white sm:text-[1.5rem]">
        {formatCurrency(asset.price)}
      </p>
      <Sparkline data={asset.sparkline} className="mt-2 h-10 w-full" />

      <div className="signal-outline-divider mt-3 grid grid-cols-2 gap-3 pt-3">
        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">
            Score
          </p>
          <p className="mt-1 text-sm font-semibold text-cyan-200">{asset.score}</p>
        </div>
        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">
            Volatility
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{asset.volatility}</p>
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
    <div className="signal-surface-soft rounded-[0.58rem] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">#{index + 1}</p>
          <Link href={`/assets/${setup.symbol}`} className="mt-1 block font-semibold text-white">
            {setup.symbol}
          </Link>
          <p className="mt-1 text-sm text-slate-400">{setup.strategy}</p>
        </div>
        <div className="text-right">
          <span className="signal-accent-surface inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-cyan-200">
            {setup.score}
          </span>
          <p className="mt-2 text-xs text-slate-500">{setup.entryZone}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
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
          <p className="mt-1 text-xs font-medium text-emerald-300">
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
  ticket: (typeof tradeTickets)[number];
}) {
  return (
    <div className="signal-surface-soft rounded-[0.58rem] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{ticket.symbol}</p>
          <p className="mt-1 text-sm text-slate-400">{ticket.strategy}</p>
        </div>
        <StatusChip label={ticket.status.toUpperCase()} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
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
    <span className={`inline-flex rounded-[0.58rem] border px-2.5 py-1 text-xs font-medium ${classes[tone]}`}>
      {label}
    </span>
  );
}

export default function DashboardPage() {
  return (
    <div className="grid gap-[5px] xl:grid-cols-[minmax(0,1fr)_286px] 2xl:grid-cols-[minmax(0,1fr)_298px]">
      <div className="panel-stack-5">
        <Panel className="p-3 sm:p-3.5">
          <SectionHeader title="Watchlist Summary" action="Edit Watchlist" />
          <div className="mt-[5px] grid gap-[5px] md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {topWatchlist.map((asset) => (
              <WatchlistCard key={asset.symbol} asset={asset} />
            ))}
          </div>
        </Panel>

        <Panel className="overflow-hidden p-3 sm:p-3.5">
          <SectionHeader title="Top-Ranked Setups" />
          <div className="mt-3 space-y-2.5 md:hidden">
            {topSetups.map((setup, index) => (
              <SetupMobileCard key={setup.id} setup={setup} index={index} />
            ))}
          </div>
          <div className="mt-3 hidden overflow-x-auto md:block">
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
                      <span className="signal-accent-surface inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-cyan-200">
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
                      <p className="mt-1 text-xs font-medium text-emerald-300">
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
          <div className="signal-outline-divider mt-2 flex justify-center pt-3">
            <Link href="/scanner" className="text-sm font-medium text-slate-400 transition hover:text-white">
              View all setups
            </Link>
          </div>
        </Panel>

        <div className="grid gap-[5px] xl:grid-cols-2">
          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Recent Trade Tickets" />
            <div className="mt-3 space-y-2.5 md:hidden">
              {recentTickets.map((ticket) => (
                <TicketMobileCard key={ticket.id} ticket={ticket} />
              ))}
            </div>
            <div className="mt-3 hidden overflow-x-auto md:block">
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
                  {recentTickets.map((ticket) => (
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
                  ))}
                </tbody>
              </table>
            </div>
            <div className="signal-outline-divider mt-2 flex justify-center pt-3">
              <Link href="/trade-tickets" className="text-sm font-medium text-slate-400 transition hover:text-white">
                View all trade tickets
              </Link>
            </div>
          </Panel>

          <Panel className="p-3 sm:p-3.5">
            <SectionHeader title="Journal Reminders / Follow-ups" />
            <div className="mt-3 space-y-2.5">
              {journalReminders.map((reminder, index) => (
                <div
                  key={reminder}
                  className={`flex flex-col gap-3 rounded-[0.58rem] border px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between ${
                    index === 2
                      ? "signal-accent-surface"
                      : "signal-surface-soft"
                  }`}
                >
                  <div className="flex gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        index === 2
                          ? "border-cyan-300/25 bg-cyan-300 text-[#04101d]"
                          : "border-white/12 bg-transparent"
                      }`}
                    >
                      {index === 2 ? "OK" : ""}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">{reminder}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {index === 0
                          ? "Set reminder for after market close"
                          : index === 1
                            ? "Adjust max daily loss parameter"
                            : "Completed review and tagged in journal"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>{index === 0 ? "Today" : formatDateLabel(journalEntries[index].date)}</p>
                    <p className="mt-1">{index === 0 ? "04:00 PM" : "11:00 AM"}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="signal-outline-divider mt-2 flex justify-center pt-3">
              <Link href="/journal" className="text-sm font-medium text-slate-400 transition hover:text-white">
                View all journal entries
              </Link>
            </div>
          </Panel>
        </div>

        <Panel className="overflow-hidden p-3 sm:p-3.5">
          <SectionHeader title="Latest Backtest Results" />
          <div className="mt-4 grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[392px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-[1.35rem] font-semibold text-white sm:text-[1.55rem]">
                    {backtestFocus.strategy}
                  </h3>
                  <span className="signal-accent-surface rounded-[0.58rem] px-2 py-1 text-xs font-semibold text-cyan-100">
                    v2.4
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5 text-slate-400">
                  Signalibrium backtest focus is prioritising reproducibility,
                  realistic drawdown, and regime-aware performance rather than hype
                  metrics.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Total Return
                  </p>
                  <p className="mt-1.5 text-[1.55rem] font-semibold text-emerald-300 sm:text-[1.75rem]">
                    {formatPercent(backtestFocus.totalReturn, true)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Annualised
                  </p>
                  <p className="mt-1.5 text-[1.55rem] font-semibold text-emerald-300 sm:text-[1.75rem]">
                    {formatPercent(backtestFocus.annualisedReturn, true)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Win Rate
                  </p>
                  <p className="mt-1.5 text-[1.55rem] font-semibold text-white sm:text-[1.75rem]">
                    {formatPercent(backtestFocus.winRate)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Profit Factor
                  </p>
                  <p className="mt-1.5 text-[1.55rem] font-semibold text-white sm:text-[1.75rem]">
                    {backtestFocus.profitFactor.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Max Drawdown
                  </p>
                  <p className="mt-1.5 text-[1.55rem] font-semibold text-red-300 sm:text-[1.75rem]">
                    {formatPercent(backtestFocus.maxDrawdown)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Trades
                  </p>
                  <p className="mt-1.5 text-[1.55rem] font-semibold text-white sm:text-[1.75rem]">142</p>
                </div>
              </div>

              <div className="signal-outline-divider grid gap-4 pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Test Period
                  </p>
                  <p className="mt-1 text-sm text-white">Jan 2025 - May 2026</p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Assets
                  </p>
                  <p className="mt-1 text-sm text-white">Top AI & infra basket</p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Timeframe
                  </p>
                  <p className="mt-1 text-sm text-white">4H</p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    Capital
                  </p>
                  <p className="mt-1 text-sm text-white">$10,000</p>
                </div>
              </div>
            </div>

            <div className="signal-surface rounded-[0.62rem] p-3">
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
                      className={`rounded-lg border px-2.5 py-1 ${
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
              <div className="signal-surface signal-grid mt-4 rounded-[0.62rem] px-3 py-3.5">
                <div className="relative h-[200px] sm:h-[240px]">
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
                <div className="mt-4 flex justify-between gap-2 text-[0.68rem] text-slate-500 sm:text-xs">
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
        <Panel className="p-3 sm:p-3.5">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Market Regime" />
            <p className="text-xs text-slate-500">Updated 03:47 BST</p>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[1.45rem] font-semibold leading-tight text-white sm:text-[1.65rem]">
                Risk-On Expansion
              </h3>
              <TableBadge label="Bullish" tone="teal" />
            </div>
            <p className="mt-4 text-sm text-slate-400">AI Regime Score</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-[2.5rem] font-semibold tracking-tight text-cyan-200 sm:text-[2.9rem]">
                {marketSnapshot.breadthScore}
              </span>
              <span className="pb-2 text-slate-400">/100</span>
            </div>
            <div className="mt-4 h-2.5 rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#00E5FF_0%,#009BFF_50%,#256BFF_100%)]"
                style={{ width: `${marketSnapshot.breadthScore}%` }}
              />
            </div>
          </div>

          <div className="signal-outline-divider mt-6 space-y-4 pt-5">
            {regimeSignals.map((signal) => (
              <div key={signal.label} className="flex items-center justify-between gap-4">
                <p className="text-sm text-slate-300">{signal.label}</p>
                <p className={`text-sm font-semibold ${signal.tone}`}>{signal.value}</p>
              </div>
            ))}
          </div>

          <p className="signal-outline-divider mt-6 pt-4 text-center text-xs text-slate-500">
            Regime analysis powered by Signalibrium AI
          </p>
        </Panel>

        <Panel className="p-3 sm:p-3.5">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title="Risk Warnings" />
            <span className="signal-warning-surface rounded-full px-2.5 py-1 text-xs font-semibold text-amber-100">
              {riskWarnings.length}
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {riskWarnings.map((warning, index) => (
              <div
                key={warning}
                className="signal-warning-surface rounded-[0.62rem] p-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="signal-warning-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-amber-200">
                    {index === 0 ? "!" : index === 1 ? "*" : "~"}
                  </div>
                  <div>
                    <p className="font-semibold text-amber-100">{alertTitles[index]}</p>
                    <p className="mt-2 text-sm leading-5 text-slate-300">{warning}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="signal-outline-divider mt-3 flex justify-center pt-4">
            <Link href="/risk-lab" className="text-sm font-medium text-slate-400 transition hover:text-white">
              View all risk alerts
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
