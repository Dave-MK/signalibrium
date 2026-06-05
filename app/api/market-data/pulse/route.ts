import { NextResponse } from "next/server";
import { getConfiguredProviderName } from "@/app/_lib/server/market-data/market-data";
import { pulseExternalMarketData } from "@/app/_lib/server/market-data/sync-market-data";
import { readWorkspaceData } from "@/app/_lib/server/workspace-store";

export async function POST() {
  try {
    const summary = await pulseExternalMarketData();
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("[market-data/pulse] failed; serving cached snapshot", error);

    try {
      const data = await readWorkspaceData();

      return NextResponse.json({
        summary: {
          provider: getConfiguredProviderName(),
          pulsedAt: data.syncState.pricePulseLastSyncedAt || new Date().toISOString(),
          pulsedSymbols: [],
          skippedSymbols: [],
          warnings: [
            {
              symbol: "SYSTEM",
              message:
                error instanceof Error
                  ? `Live pulse skipped this cycle: ${error.message}`
                  : "Live pulse skipped this cycle, so Signalibrium kept the last successful market snapshot.",
            },
          ],
          assets: data.assets,
          marketSnapshot: data.marketSnapshot,
        },
      });
    } catch (fallbackError) {
      console.error("[market-data/pulse] cached fallback failed", fallbackError);

      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : "Unable to pulse live market data.",
        },
        { status: 502 },
      );
    }

  }
}
