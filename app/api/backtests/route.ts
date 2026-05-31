import { NextResponse } from "next/server";
import { parseCreateBacktestInput } from "@/app/_lib/server/request-parsers";
import { createBacktest, listBacktests } from "@/app/_lib/server/repositories/backtests";

export async function GET() {
  const backtests = await listBacktests();
  return NextResponse.json({ backtests });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateBacktestInput(body);
    const backtest = await createBacktest(input);

    return NextResponse.json({ backtest }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
