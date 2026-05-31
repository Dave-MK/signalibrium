import { NextResponse } from "next/server";
import { parseUpdateMarketSnapshotInput } from "@/app/_lib/server/request-parsers";
import {
  getMarketSnapshot,
  updateMarketSnapshot,
} from "@/app/_lib/server/repositories/market-snapshot";

export async function GET() {
  const marketSnapshot = await getMarketSnapshot();
  return NextResponse.json({ marketSnapshot });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const input = parseUpdateMarketSnapshotInput(body);
    const marketSnapshot = await updateMarketSnapshot(input);

    return NextResponse.json({ marketSnapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
