import { NextResponse } from "next/server";
import { pulseExternalMarketData } from "@/app/_lib/server/market-data/sync-market-data";

export async function POST() {
  try {
    const summary = await pulseExternalMarketData();
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to pulse live market data.",
      },
      { status: 502 },
    );
  }
}
