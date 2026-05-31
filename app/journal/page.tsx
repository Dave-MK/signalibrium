import { listJournalEntries } from "@/app/_lib/server/repositories/journal-entries";
import JournalPageClient from "./journal-page-client";

export default async function JournalPage() {
  const journalEntries = await listJournalEntries();

  return <JournalPageClient initialJournalEntries={journalEntries} />;
}
