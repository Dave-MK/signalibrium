import { NextResponse } from "next/server";
import { parseUpdateAssetInput } from "@/app/_lib/server/request-parsers";
import { getAssetBySymbol, updateAsset } from "@/app/_lib/server/repositories/assets";

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await context.params;
  const asset = await getAssetBySymbol(symbol);

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  return NextResponse.json({ asset });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await context.params;
    const body = await request.json();
    const input = parseUpdateAssetInput(body);
    const asset = await updateAsset(symbol, input);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
