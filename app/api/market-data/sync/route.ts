import { NextResponse } from "next/server";
import { syncExternalMarketData } from "@/app/_lib/server/market-data/sync-market-data";

export async function POST() {
  const redisUrl = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();

  if (process.env.VERCEL && !redisUrl) {
    throw new Error("FATAL: UPSTASH_REDIS_REST_URL not set. Refusing to run on ephemeral storage.");
  }

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
