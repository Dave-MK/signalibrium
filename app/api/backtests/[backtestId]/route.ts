import { NextResponse } from "next/server";
import { parseUpdateBacktestInput } from "@/app/_lib/server/request-parsers";
import {
  deleteBacktest,
  getBacktestById,
  updateBacktest,
} from "@/app/_lib/server/repositories/backtests";

export async function GET(
  _request: Request,
  context: { params: Promise<{ backtestId: string }> },
) {
  const { backtestId } = await context.params;
  const backtest = await getBacktestById(backtestId);

  if (!backtest) {
    return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
  }

  return NextResponse.json({ backtest });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ backtestId: string }> },
) {
  try {
    const { backtestId } = await context.params;
    const body = await request.json();
    const input = parseUpdateBacktestInput(body);
    const backtest = await updateBacktest(backtestId, input);

    if (!backtest) {
      return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
    }

    return NextResponse.json({ backtest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ backtestId: string }> },
) {
  const { backtestId } = await context.params;
  const removed = await deleteBacktest(backtestId);

  if (!removed) {
    return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
