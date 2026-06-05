import { roundPriceValue } from "@/app/_lib/market-prices";
import type { LiveCandleSeries, SupportedChartInterval } from "./provider-types";

export function buildFallbackChart(
  symbol: string,
  name: string,
  priceSeries: number[],
  fetchedAt: string,
  interval: SupportedChartInterval = "1h",
  note?: string,
) {
  const usableSeries = priceSeries.filter((value) => Number.isFinite(value) && value > 0);
  const closes =
    usableSeries.length >= 2
      ? usableSeries
      : [usableSeries[0] ?? 0, usableSeries[0] ?? 0].filter(Boolean);
  const endTime = Date.parse(fetchedAt);
  const safeEndTime = Number.isFinite(endTime) ? endTime : Date.now();

  const candles = closes.map((close, index) => {
    const previousClose = closes[index - 1] ?? close;
    const open = previousClose;
    const spread = Math.max(Math.abs(close - open) * 0.45, close * 0.0035);
    const high = Math.max(open, close) + spread;
    const low = Math.max(0.0001, Math.min(open, close) - spread);
    const timestamp = new Date(
      safeEndTime - (closes.length - index - 1) * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    return {
      datetime: timestamp,
      open: roundPriceValue(open),
      high: roundPriceValue(high),
      low: roundPriceValue(low),
      close: roundPriceValue(close),
      volume: null,
    };
  });

  return {
    symbol,
    providerSymbol: symbol,
    interval,
    currency: "USD",
    candles,
    fetchedAt: new Date(safeEndTime).toISOString(),
    chartNote:
      note ??
      `${name} opened with a locally reconstructed candle view from the latest synced close series while the next live OHLC refresh warms up.`,
  } satisfies LiveCandleSeries;
}
