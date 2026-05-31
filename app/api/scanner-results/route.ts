import { NextResponse } from "next/server";
import { parseCreateScannerResultInput } from "@/app/_lib/server/request-parsers";
import {
  createScannerResult,
  listScannerResults,
} from "@/app/_lib/server/repositories/scanner-results";

export async function GET() {
  const scannerResults = await listScannerResults();
  return NextResponse.json({ scannerResults });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateScannerResultInput(body);
    const scannerResult = await createScannerResult(input);

    return NextResponse.json({ scannerResult }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
