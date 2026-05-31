import { NextResponse } from "next/server";
import { parseCreateWatchlistInput } from "@/app/_lib/server/request-parsers";
import { createWatchlist, listWatchlists } from "@/app/_lib/server/repositories/watchlists";

export async function GET() {
  const watchlists = await listWatchlists();
  return NextResponse.json({ watchlists });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateWatchlistInput(body);
    const watchlist = await createWatchlist(input);

    return NextResponse.json({ watchlist }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 },
    );
  }
}
