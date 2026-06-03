import { NextResponse } from "next/server";
import { supportedChartIntervals } from "@/app/_lib/market-data-contract";
import { buildFallbackChart } from "@/app/_lib/server/market-data/fallback-chart";
import { fetchLiveCandlesForSymbol } from "@/app/_lib/server/market-data/market-data";
import { getAssetBySymbol } from "@/app/_lib/server/repositories/assets";
import type { SupportedChartInterval } from "@/app/_lib/server/market-data/provider-types";

function resolveInterval(value: string | null): SupportedChartInterval {
  if (value && supportedChartIntervals.includes(value as SupportedChartInterval)) {
    return value as SupportedChartInterval;
  }

  return "1h";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const interval = resolveInterval(searchParams.get("interval"));
  const outputsizeValue = Number(searchParams.get("outputsize") ?? "48");
  const outputsize = Number.isFinite(outputsizeValue)
    ? Math.min(120, Math.max(24, Math.round(outputsizeValue)))
    : 48;

  try {
    const chart = await fetchLiveCandlesForSymbol(symbol, interval, outputsize);
    return NextResponse.json({ chart });
  } catch (error) {
    const asset = await getAssetBySymbol(symbol);

    if (asset) {
      const chart = buildFallbackChart(
        asset.symbol,
        asset.name,
        asset.sparkline,
        asset.lastSyncedAt,
        interval,
        `${asset.name} is temporarily showing a reconstructed candle view from the latest synced close series while the live provider allowance cools down.`,
      );
      return NextResponse.json({ chart });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load live chart data.",
      },
      { status: 502 },
    );
  }
}
