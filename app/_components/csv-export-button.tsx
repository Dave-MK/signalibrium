"use client";

// ─── Generic CSV download helper ─────────────────────────────────────────────

function downloadCsv(filename: string, rows: string[][]) {
  const header = rows[0];
  const body   = rows.slice(1);

  const escape = (v: string) => {
    // RFC 4180: wrap in quotes if it contains comma, quote, or newline
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  const csv = [header, ...body].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Closed trades CSV export ─────────────────────────────────────────────────

type ClosedTrade = {
  symbol: string;
  instrumentName: string;
  side: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  stakeGbp: number;
  realizedPnlGbp: number | null;
  confidenceAtOpen: number;
  narrative: string;
};

export function TradesCsvExportButton({ trades }: { trades: ClosedTrade[] }) {
  function handleExport() {
    const rows: string[][] = [
      ["Symbol", "Instrument", "Side", "Status", "Opened", "Closed", "Entry", "Stop", "Target", "Stake GBP", "P&L GBP", "Confidence %", "Narrative"],
    ];

    for (const t of trades) {
      rows.push([
        t.symbol,
        t.instrumentName,
        t.side,
        t.status,
        t.openedAt,
        t.closedAt ?? "",
        t.entryPrice.toString(),
        t.stopPrice.toString(),
        t.targetPrice.toString(),
        t.stakeGbp.toFixed(2),
        (t.realizedPnlGbp ?? 0).toFixed(2),
        t.confidenceAtOpen.toString(),
        t.narrative,
      ]);
    }

    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`siggi-trades-${date}.csv`, rows);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={trades.length === 0}
      title={trades.length === 0 ? "No closed trades to export" : `Export ${trades.length} closed trades as CSV`}
      className="flex items-center gap-1.5 rounded-[0.34rem] border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[0.70rem] font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 12h10" strokeLinecap="round" />
      </svg>
      Export CSV
    </button>
  );
}

// ─── Journal entries CSV export ───────────────────────────────────────────────

type JournalEntry = {
  asset: string | null | undefined;
  entryType: string;
  taggedOutcome: string | null | undefined;
  rating: number | null | undefined;
  wouldTakeAgain: boolean | null | undefined;
  whatISaw: string | null | undefined;
  reasoning: string | null | undefined;
  improvement: string | null | undefined;
  notes: string | null | undefined;
  tags: string[];
  createdAt: string;
};

export function JournalCsvExportButton({ entries }: { entries: JournalEntry[] }) {
  function handleExport() {
    const rows: string[][] = [
      ["Date", "Symbol", "Type", "Outcome", "Rating", "Would Repeat", "What I Saw", "Reasoning", "Improvement", "Notes", "Tags"],
    ];

    for (const e of entries) {
      rows.push([
        e.createdAt,
        e.asset ?? "",
        e.entryType,
        e.taggedOutcome ?? "",
        e.rating?.toString() ?? "",
        e.wouldTakeAgain === true ? "Yes" : e.wouldTakeAgain === false ? "No" : "",
        e.whatISaw ?? "",
        e.reasoning ?? "",
        e.improvement ?? "",
        e.notes ?? "",
        (e.tags ?? []).join("; "),
      ]);
    }

    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`journal-entries-${date}.csv`, rows);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={entries.length === 0}
      title={entries.length === 0 ? "No journal entries to export" : `Export ${entries.length} entries as CSV`}
      className="flex items-center gap-1.5 rounded-[0.34rem] border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[0.70rem] font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 12h10" strokeLinecap="round" />
      </svg>
      Export CSV
    </button>
  );
}
