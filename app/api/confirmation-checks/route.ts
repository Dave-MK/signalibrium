import { NextResponse } from "next/server";
import { parseCreateConfirmationCheckInput } from "@/app/_lib/server/request-parsers";
import {
  createConfirmationCheck,
  listConfirmationChecks,
} from "@/app/_lib/server/repositories/confirmation-checks";

export async function GET() {
  const confirmationChecks = await listConfirmationChecks();
  return NextResponse.json({ confirmationChecks });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateConfirmationCheckInput(body);
    const confirmationCheck = await createConfirmationCheck(input);

    return NextResponse.json({ confirmationCheck }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

