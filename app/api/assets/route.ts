import { NextResponse } from "next/server";
import { parseCreateAssetInput } from "@/app/_lib/server/request-parsers";
import { createAsset, listAssets } from "@/app/_lib/server/repositories/assets";

export async function GET() {
  const assets = await listAssets();
  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateAssetInput(body);
    const asset = await createAsset(input);

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
