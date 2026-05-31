import { NextResponse } from "next/server";
import { parseUpdateWatchlistInput } from "@/app/_lib/server/request-parsers";
import {
  deleteWatchlist,
  getWatchlistById,
  updateWatchlist,
} from "@/app/_lib/server/repositories/watchlists";

export async function GET(
  _request: Request,
  context: { params: Promise<{ watchlistId: string }> },
) {
  const { watchlistId } = await context.params;
  const watchlist = await getWatchlistById(watchlistId);

  if (!watchlist) {
    return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
  }

  return NextResponse.json({ watchlist });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ watchlistId: string }> },
) {
  try {
    const { watchlistId } = await context.params;
    const body = await request.json();
    const input = parseUpdateWatchlistInput(body);
    const watchlist = await updateWatchlist(watchlistId, input);

    if (!watchlist) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    return NextResponse.json({ watchlist });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ watchlistId: string }> },
) {
  const { watchlistId } = await context.params;
  const removed = await deleteWatchlist(watchlistId);

  if (!removed) {
    return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
