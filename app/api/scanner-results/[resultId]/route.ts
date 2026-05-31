import { NextResponse } from "next/server";
import { parseUpdateScannerResultInput } from "@/app/_lib/server/request-parsers";
import {
  deleteScannerResult,
  getScannerResultById,
  updateScannerResult,
} from "@/app/_lib/server/repositories/scanner-results";

export async function GET(
  _request: Request,
  context: { params: Promise<{ resultId: string }> },
) {
  const { resultId } = await context.params;
  const scannerResult = await getScannerResultById(resultId);

  if (!scannerResult) {
    return NextResponse.json({ error: "Scanner result not found" }, { status: 404 });
  }

  return NextResponse.json({ scannerResult });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ resultId: string }> },
) {
  try {
    const { resultId } = await context.params;
    const body = await request.json();
    const input = parseUpdateScannerResultInput(body);
    const scannerResult = await updateScannerResult(resultId, input);

    if (!scannerResult) {
      return NextResponse.json({ error: "Scanner result not found" }, { status: 404 });
    }

    return NextResponse.json({ scannerResult });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ resultId: string }> },
) {
  const { resultId } = await context.params;
  const removed = await deleteScannerResult(resultId);

  if (!removed) {
    return NextResponse.json({ error: "Scanner result not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
