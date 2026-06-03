import { NextResponse } from "next/server";
import { parseCreateMarketEventInput } from "@/app/_lib/server/request-parsers";
import { createMarketEvent, listMarketEvents } from "@/app/_lib/server/repositories/market-events";

export async function GET() {
  const marketEvents = await listMarketEvents();
  return NextResponse.json({ marketEvents });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateMarketEventInput(body);
    const marketEvent = await createMarketEvent(input);

    return NextResponse.json({ marketEvent }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

