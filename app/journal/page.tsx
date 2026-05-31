import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import { listTradeTickets } from "@/app/_lib/server/repositories/trade-tickets";
import JournalPageClient from "./journal-page-client";

export default async function JournalPage() {
  const [journalEntries, tradeTickets, assets] = await Promise.all([
    listJournalEntries(),
    listTradeTickets(),
    listAssets(),
  ]);

  return (
    <JournalPageClient
      initialJournalEntries={journalEntries}
      tradeTickets={tradeTickets}
      assets={assets}
    />
  );
}
