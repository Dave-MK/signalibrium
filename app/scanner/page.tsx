import { existsSync } from "node:fs";
import path from "node:path";
import { listScannerResults } from "@/app/_lib/server/repositories/scanner-results";
import { listAssets } from "@/app/_lib/server/repositories/assets";
import { listBacktests } from "@/app/_lib/server/repositories/backtests";
import { listConfirmationChecks } from "@/app/_lib/server/repositories/confirmation-checks";
import { listMarketEvents } from "@/app/_lib/server/repositories/market-events";
import { listPredictionHistory } from "@/app/_lib/server/repositories/prediction-history";
import { getSiggiAccount } from "@/app/_lib/server/repositories/siggi-account";
import ScannerPageClient from "./scanner-page-client";

export default async function ScannerPage() {
  const [assets, backtests, confirmationChecks, marketEvents, predictionHistory, scannerResults, siggiAccount] = await Promise.all([
    listAssets(),
    listBacktests(),
    listConfirmationChecks(),
    listMarketEvents(),
    listPredictionHistory(),
    listScannerResults(),
    getSiggiAccount(),
  ]);
  const siggiOpenSymbols = siggiAccount.openTrades.map((t) => t.symbol);
  const chartVendor =
    process.env.SIGNALIBRIUM_CHART_VENDOR?.trim().toLowerCase() === "charting_library"
      ? "charting_library"
      : "embed";
  const chartingLibraryAvailable = existsSync(
    path.join(process.cwd(), "public", "charting_library", "charting_library.js"),
  );

  return (
    <ScannerPageClient
      assets={assets}
      backtests={backtests}
      chartVendor={chartVendor}
      chartingLibraryAvailable={chartingLibraryAvailable}
      confirmationChecks={confirmationChecks}
      marketEvents={marketEvents}
      initialScannerResults={scannerResults}
      predictionHistory={predictionHistory}
      siggiOpenSymbols={siggiOpenSymbols}
    />
  );
}
