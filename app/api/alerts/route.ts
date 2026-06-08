import { NextResponse } from "next/server";
import { listAlerts, upsertAlert } from "@/app/_lib/server/repositories/alerts";

export async function GET() {
  const alerts = await listAlerts();
  return NextResponse.json(alerts);
}

export async function POST(request: Request) {
  const body = await request.json() as {
    id?: string;
    symbol: string;
    label: string;
    condition: "above" | "below";
    targetPrice: number;
    enabled?: boolean;
  };

  if (
    !body.symbol ||
    !body.label ||
    (body.condition !== "above" && body.condition !== "below") ||
    typeof body.targetPrice !== "number" ||
    !Number.isFinite(body.targetPrice)
  ) {
    return NextResponse.json({ error: "Invalid alert payload" }, { status: 400 });
  }

  const alert = await upsertAlert({
    id: body.id,
    symbol: body.symbol,
    label: body.label,
    condition: body.condition,
    targetPrice: body.targetPrice,
    enabled: body.enabled ?? true,
  });

  return NextResponse.json(alert, { status: body.id ? 200 : 201 });
}
