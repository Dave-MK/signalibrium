"use client";

import type { AiSignalVerdict, PersistedSiggiTrade } from "@/app/_lib/server/workspace-types";

function tradeWon(t: PersistedSiggiTrade) {
  return t.status === "Hit Target";
}

function winRate(trades: PersistedSiggiTrade[]) {
  if (trades.length === 0) return null;
  return Math.round((trades.filter(tradeWon).length / trades.length) * 100);
}

function totalPnl(trades: PersistedSiggiTrade[]) {
  return trades.reduce((sum, t) => sum + (t.realizedPnlGbp ?? 0), 0);
}

function avgRMultiple(trades: PersistedSiggiTrade[]) {
  const valid = trades.filter(
    (t) => t.realizedPnlGbp != null && t.stakeGbp > 0,
  );
  if (valid.length === 0) return null;
  const avg =
    valid.reduce((sum, t) => {
      const riskGbp = Math.abs(t.entryPrice - t.stopPrice) / t.entryPrice * t.stakeGbp;
      if (riskGbp <= 0) return sum;
      return sum + (t.realizedPnlGbp ?? 0) / riskGbp;
    }, 0) / valid.length;
  return avg;
}

function StatCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "red" | "neutral";
}) {
  const color =
    tone === "green" ? "text-emerald-300" : tone === "red" ? "text-rose-400" : "text-white";
  return (
    <div className="signal-surface-soft rounded-[0.65rem] p-2.5">
      <p className="micro-label">{label}</p>
      <p className={`mt-1 text-[0.92rem] font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[0.7rem] text-slate-400">{sub}</p>}
    </div>
  );
}

const VERDICT_ORDER: AiSignalVerdict[] = ["Strong", "Good", "Marginal", "Skip"];
const VERDICT_COLOR: Record<AiSignalVerdict, string> = {
  Strong:   "text-emerald-400",
  Good:     "text-[#00C884]",
  Marginal: "text-amber-300",
  Skip:     "text-rose-400",
};

export function SiggiLiveVsPaper({
  closedTrades,
}: {
  closedTrades: PersistedSiggiTrade[];
}) {
  const live  = closedTrades.filter((t) => t.brokerConnectionId);
  const paper = closedTrades.filter((t) => !t.brokerConnectionId);

  const liveWr  = winRate(live);
  const paperWr = winRate(paper);
  const livePnl  = totalPnl(live);
  const paperPnl = totalPnl(paper);
  const liveAvgR  = avgRMultiple(live);
  const paperAvgR = avgRMultiple(paper);

  // Verdict performance breakdown across ALL closed trades that have aiVerdictAtOpen
  const verdictRows = VERDICT_ORDER.map((verdict) => {
    const group = closedTrades.filter((t) => t.aiVerdictAtOpen === verdict);
    const wr = winRate(group);
    const pnl = totalPnl(group);
    return { verdict, count: group.length, wr, pnl };
  }).filter((r) => r.count > 0);

  if (closedTrades.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Live vs Paper */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Live */}
        <div className="rounded-[0.5rem] border border-[#00C884]/20 bg-[#00C884]/5 p-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#00C884]" />
            <p className="text-[0.78rem] font-semibold text-[#00C884]">Live execution</p>
            <span className="ml-auto text-[0.7rem] text-slate-500">{live.length} trades</span>
          </div>
          {live.length === 0 ? (
            <p className="mt-2 text-[0.76rem] text-slate-500">No live trades closed yet.</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-[5px]">
              <StatCell
                label="Win rate"
                value={liveWr != null ? `${liveWr}%` : "—"}
                tone={liveWr != null && liveWr >= 50 ? "green" : "red"}
              />
              <StatCell
                label="Total P&L"
                value={`${livePnl >= 0 ? "+" : ""}£${Math.abs(livePnl).toFixed(2)}`}
                tone={livePnl > 0 ? "green" : livePnl < 0 ? "red" : "neutral"}
              />
              <StatCell
                label="Avg R"
                value={liveAvgR != null ? `${liveAvgR >= 0 ? "+" : ""}${liveAvgR.toFixed(2)}R` : "—"}
                tone={liveAvgR != null && liveAvgR > 0 ? "green" : "red"}
              />
            </div>
          )}
        </div>

        {/* Paper */}
        <div className="rounded-[0.5rem] border border-white/8 bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            <p className="text-[0.78rem] font-semibold text-slate-300">Paper simulation</p>
            <span className="ml-auto text-[0.7rem] text-slate-500">{paper.length} trades</span>
          </div>
          {paper.length === 0 ? (
            <p className="mt-2 text-[0.76rem] text-slate-500">No paper trades closed yet.</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-[5px]">
              <StatCell
                label="Win rate"
                value={paperWr != null ? `${paperWr}%` : "—"}
                tone={paperWr != null && paperWr >= 50 ? "green" : "red"}
              />
              <StatCell
                label="Total P&L"
                value={`${paperPnl >= 0 ? "+" : ""}£${Math.abs(paperPnl).toFixed(2)}`}
                tone={paperPnl > 0 ? "green" : paperPnl < 0 ? "red" : "neutral"}
              />
              <StatCell
                label="Avg R"
                value={paperAvgR != null ? `${paperAvgR >= 0 ? "+" : ""}${paperAvgR.toFixed(2)}R` : "—"}
                tone={paperAvgR != null && paperAvgR > 0 ? "green" : "red"}
              />
            </div>
          )}
        </div>
      </div>

      {/* Siggi's Read accuracy by verdict tier */}
      {verdictRows.length > 0 && (
        <div className="rounded-[0.5rem] border border-white/8 bg-white/[0.02] p-3">
          <p className="micro-label mb-2.5">Siggi&apos;s Read accuracy by tier</p>
          <div className="grid gap-[5px] sm:grid-cols-4">
            {verdictRows.map(({ verdict, count, wr, pnl }) => (
              <div key={verdict} className="signal-surface-soft rounded-[0.65rem] p-2.5">
                <p className={`text-[0.78rem] font-semibold ${VERDICT_COLOR[verdict]}`}>{verdict}</p>
                <p className="mt-1 text-[0.88rem] font-semibold text-white">
                  {wr != null ? `${wr}%` : "—"}
                </p>
                <p className="mt-0.5 text-[0.68rem] text-slate-400">{count} trade{count !== 1 ? "s" : ""}</p>
                <p className={`mt-0.5 text-[0.68rem] ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {pnl >= 0 ? "+" : ""}£{Math.abs(pnl).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          {verdictRows.length < 4 && (
            <p className="mt-2 text-[0.68rem] text-slate-600">
              More verdict tiers will appear as Siggi closes more trades with AI scoring.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
