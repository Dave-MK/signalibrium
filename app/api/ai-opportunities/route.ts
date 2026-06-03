import { NextResponse } from "next/server";
import { parseCreateAiOpportunityInput } from "@/app/_lib/server/request-parsers";
import { createAiOpportunity, listAiOpportunities } from "@/app/_lib/server/repositories/ai-opportunities";

export async function GET() {
  const aiOpportunities = await listAiOpportunities();
  return NextResponse.json({ aiOpportunities });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateAiOpportunityInput(body);
    const aiOpportunity = await createAiOpportunity(input);

    return NextResponse.json({ aiOpportunity }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
