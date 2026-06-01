import { NextResponse } from "next/server";
import { syncExternalMarketData } from "@/app/_lib/server/market-data/sync-market-data";

export async function POST() {
  try {
    const summary = await syncExternalMarketData();
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to sync live market data.",
      },
      { status: 502 },
    );
  }
}
