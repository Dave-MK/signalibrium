import { NextResponse } from "next/server";
import { syncMarketIntelligence } from "@/app/_lib/server/market-intelligence/sync-market-intelligence";

export async function POST() {
  try {
    const summary = await syncMarketIntelligence();
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to sync market intelligence.",
      },
      { status: 502 },
    );
  }
}
