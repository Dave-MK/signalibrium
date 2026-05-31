import { listWatchlists } from "@/app/_lib/server/repositories/watchlists";
import AssetsPageClient from "./assets-page-client";

export default async function AssetsPage() {
  const watchlists = await listWatchlists();

  return <AssetsPageClient initialWatchlists={watchlists} />;
}
