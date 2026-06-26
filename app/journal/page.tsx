import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import { JournalClient } from "./journal-client";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const [entries, scannerResults, predictionHistory, siggiAccount] = await Promise.all([
    listJournalEntries(),
    listScannerResults(),
    listPredictionHistory(),
    getSiggiAccount(),
  ]);

  // Build a deduplicated, sorted list of instrument symbols the user has seen
  const symbolSet = new Set<string>();
  for (const r of scannerResults)            symbolSet.add(r.symbol);
  for (const p of predictionHistory)         symbolSet.add(p.symbol);
  for (const t of siggiAccount.openTrades)   symbolSet.add(t.symbol);
  for (const t of siggiAccount.closedTrades) symbolSet.add(t.symbol);
  const availableSymbols = [...symbolSet].sort();

  // Build list of unreviewed closed trades and resolved predictions (for bulk review mode)
  const reviewedTradeIds  = new Set(entries.filter((e) => e.tradeId).map((e) => e.tradeId!));
  const reviewedPredIds   = new Set(entries.filter((e) => e.predictionId).map((e) => e.predictionId!));

  const unreviewedTrades = siggiAccount.closedTrades
    .filter((t) => !reviewedTradeIds.has(t.id))
    .slice(0, 30)
    .map((t) => ({
      id: t.id,
      symbol: t.symbol,
      instrumentName: t.instrumentName,
      side: t.side,
      status: t.status as string,
      entryPrice: t.entryPrice,
      stopPrice: t.stopPrice,
      targetPrice: t.targetPrice,
      realizedPnlGbp: t.realizedPnlGbp ?? 0,
      openedAt: t.openedAt,
      closedAt: t.closedAt ?? null,
      type: "trade" as const,
    }));

  const unreviewedSignals = predictionHistory
    .filter((p) => p.monitoringStatus === "Resolved" && !reviewedPredIds.has(p.id))
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      symbol: p.symbol,
      instrumentName: p.instrumentName,
      side: p.actionAtCall as string,
      status: p.outcome,
      entryPrice: p.priceAtCall,
      stopPrice: p.stopPriceAtCall,
      targetPrice: p.targetPriceAtCall,
      realizedPnlGbp: 0,
      openedAt: p.calledAt,
      closedAt: p.resolvedAt,
      type: "signal" as const,
    }));

  const unreviewedItems = [...unreviewedTrades, ...unreviewedSignals];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      {/* Page header */}
      <div>
        <h1 className="text-[1.15rem] font-bold text-white">Trade Journal</h1>
        <p className="mt-0.5 text-[0.78rem] text-slate-500">
          Review your calls, understand your decisions, and track what you’d do differently.
        </p>
      </div>

      {/* Client-side list + create */}
      <JournalClient
        initialEntries={entries}
        availableSymbols={availableSymbols}
        unreviewedItems={unreviewedItems}
      />
    </div>
  );
}
