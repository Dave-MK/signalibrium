import { NextResponse } from "next/server";
import { getMarketDataMeshSummary } from "@/app/_lib/server/market-data/provider-architecture";

export async function GET() {
  return NextResponse.json({
    summary: getMarketDataMeshSummary(),
  });
}
