import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listWatchlists } from "@/app/_lib/server/repositories/watchlists";
import AssetsPageClient from "./assets-page-client";

export default async function AssetsPage() {
  const [watchlists, assets] = await Promise.all([listWatchlists(), listAssets()]);

  return <AssetsPageClient initialWatchlists={watchlists} initialAssets={assets} />;
}
