import type { LiveCandle } from "./server/market-data/provider-types";

function computeEmaSeries(values: number[], period: number) {
  const multiplier = 2 / (period + 1);
  const series: Array<number | null> = [];
  let ema: number | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (!Number.isFinite(value)) {
      series.push(null);
      continue;
    }

    if (ema === null) {
      ema = value;
    } else {
      ema = value * multiplier + ema * (1 - multiplier);
    }

    series.push(index >= period - 1 ? ema : null);
  }

  return series;
}

function computeRsiSeries(values: number[], period = 14) {
  const series: Array<number | null> = Array(values.length).fill(null);

  if (values.length <= period) {
    return series;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  series[period] =
    averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    series[index] =
      averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }

  return series;
}

function computeMacdSeries(values: number[]) {
  const fastEma = computeEmaSeries(values, 12);
  const slowEma = computeEmaSeries(values, 26);
  const macd = values.map((_, index) => {
    const fast = fastEma[index];
    const slow = slowEma[index];
    return fast !== null && slow !== null ? fast - slow : null;
  });

  const signalInput = macd.map((value) => value ?? 0);
  const rawSignal = computeEmaSeries(signalInput, 9);
  const signal = rawSignal.map((value, index) => (macd[index] === null ? null : value));
  const histogram = macd.map((value, index) => {
    const signalValue = signal[index];
    return value !== null && signalValue !== null ? value - signalValue : null;
  });

  return {
    histogram,
    macd,
    signal,
  };
}

function getLatestDefinedValue(series: Array<number | null>) {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function formatSignalTone(signal: "bullish" | "bearish" | "neutral") {
  if (signal === "bullish") {
    return "Constructive";
  }

  if (signal === "bearish") {
    return "Soft";
  }

  return "Balanced";
}

function buildOverallRead(input: {
  close: number;
  ema20: number | null;
  ema50: number | null;
  rsi: number | null;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  symbol: string;
  name: string;
}) {
  const aboveEma20 = input.ema20 !== null && input.close > input.ema20;
  const aboveEma50 = input.ema50 !== null && input.close > input.ema50;
  const emaStackBullish =
    input.ema20 !== null && input.ema50 !== null && input.ema20 > input.ema50;
  const emaStackBearish =
    input.ema20 !== null && input.ema50 !== null && input.ema20 < input.ema50;
  const rsiBullish = input.rsi !== null && input.rsi >= 58;
  const rsiBearish = input.rsi !== null && input.rsi <= 42;
  const macdBullish =
    input.macd !== null &&
    input.signal !== null &&
    input.histogram !== null &&
    input.macd > input.signal &&
    input.histogram >= 0;
  const macdBearish =
    input.macd !== null &&
    input.signal !== null &&
    input.histogram !== null &&
    input.macd < input.signal &&
    input.histogram <= 0;

  if (aboveEma20 && aboveEma50 && emaStackBullish && rsiBullish && macdBullish) {
    return {
      bias: "Bullish continuation",
      signal: "bullish" as const,
      summary: `${input.symbol} is trading above both trend averages, RSI is supporting the move, and MACD is still expanding. That combination points to continuation pressure rather than exhaustion right now.`,
    };
  }

  if (!aboveEma20 && !aboveEma50 && emaStackBearish && rsiBearish && macdBearish) {
    return {
      bias: "Bearish pressure",
      signal: "bearish" as const,
      summary: `${input.symbol} is sitting below both trend averages with weak RSI and a negative MACD posture. That keeps the market in defensive mode until price can reclaim short-term structure.`,
    };
  }

  if (aboveEma50 && !aboveEma20 && macdBearish) {
    return {
      bias: "Bull trend, short-term pullback",
      signal: "neutral" as const,
      summary: `${input.symbol} still holds its broader trend reference, but short-term momentum has cooled. This usually reads more like a pullback phase than a clean impulse leg.`,
    };
  }

  if (!aboveEma50 && aboveEma20 && macdBullish) {
    return {
      bias: "Recovery attempt",
      signal: "neutral" as const,
      summary: `${input.symbol} is trying to stabilize above the faster trend average, but the broader structure still needs work. Momentum is improving, though it has not fully rebuilt trend control yet.`,
    };
  }

  return {
    bias: "Mixed tape",
    signal: "neutral" as const,
    summary: `${input.name} is showing mixed confirmation across trend and momentum. The market is tradable, but conviction is not as clean as a full alignment phase.`,
  };
}

export function deriveChartAnalysis(candles: LiveCandle[], symbol: string, name: string) {
  const closes = candles.map((candle) => candle.close);
  const ema20 = computeEmaSeries(closes, 20);
  const ema50 = computeEmaSeries(closes, 50);
  const rsi = computeRsiSeries(closes, 14);
  const macdSeries = computeMacdSeries(closes);

  const latestClose = closes.at(-1) ?? 0;
  const latestEma20 = getLatestDefinedValue(ema20);
  const latestEma50 = getLatestDefinedValue(ema50);
  const latestRsi = getLatestDefinedValue(rsi);
  const latestMacd = getLatestDefinedValue(macdSeries.macd);
  const latestSignal = getLatestDefinedValue(macdSeries.signal);
  const latestHistogram = getLatestDefinedValue(macdSeries.histogram);
  const overall = buildOverallRead({
    close: latestClose,
    ema20: latestEma20,
    ema50: latestEma50,
    histogram: latestHistogram,
    macd: latestMacd,
    name,
    rsi: latestRsi,
    signal: latestSignal,
    symbol,
  });

  return {
    ema20,
    ema50,
    macd: macdSeries.macd,
    macdHistogram: macdSeries.histogram,
    macdSignal: macdSeries.signal,
    overall,
    rsi,
    signalCards: [
      {
        explanation:
          latestEma20 === null
            ? "Not enough candles yet."
            : latestClose >= latestEma20
              ? "Price is holding above the fast trend average."
              : "Price is trading below the fast trend average.",
        label: "EMA 20",
        signal:
          latestEma20 === null
            ? "neutral"
            : latestClose >= latestEma20
              ? "bullish"
              : "bearish",
        tone:
          latestEma20 === null
            ? "Balanced"
            : latestClose >= latestEma20
              ? "Constructive"
              : "Soft",
        value: latestEma20,
      },
      {
        explanation:
          latestEma20 === null || latestEma50 === null
            ? "Not enough candles yet."
            : latestEma20 >= latestEma50
              ? "The shorter trend is stacked above the medium trend."
              : "The shorter trend is still below the medium trend.",
        label: "EMA 50",
        signal:
          latestEma20 === null || latestEma50 === null
            ? "neutral"
            : latestEma20 >= latestEma50
              ? "bullish"
              : "bearish",
        tone:
          latestEma20 === null || latestEma50 === null
            ? "Balanced"
            : latestEma20 >= latestEma50
              ? "Constructive"
              : "Soft",
        value: latestEma50,
      },
      {
        explanation:
          latestRsi === null
            ? "Not enough candles yet."
            : latestRsi >= 70
              ? "Momentum is strong and stretched."
              : latestRsi >= 55
                ? "Momentum is supportive without being extreme."
                : latestRsi <= 30
                  ? "Momentum is washed out and very weak."
                  : latestRsi <= 45
                    ? "Momentum is soft and still defensive."
                    : "Momentum is neutral.",
        label: "RSI 14",
        signal:
          latestRsi === null
            ? "neutral"
            : latestRsi >= 55
              ? "bullish"
              : latestRsi <= 45
                ? "bearish"
                : "neutral",
        tone:
          latestRsi === null
            ? "Balanced"
            : formatSignalTone(
                latestRsi >= 55 ? "bullish" : latestRsi <= 45 ? "bearish" : "neutral",
              ),
        value: latestRsi,
      },
      {
        explanation:
          latestMacd === null || latestSignal === null || latestHistogram === null
            ? "Not enough candles yet."
            : latestMacd > latestSignal && latestHistogram >= 0
              ? "Momentum spread is positive and expanding."
              : latestMacd < latestSignal && latestHistogram <= 0
                ? "Momentum spread is negative and still leaning lower."
                : "Momentum spread is mixed and flattening.",
        label: "MACD",
        signal:
          latestMacd === null || latestSignal === null || latestHistogram === null
            ? "neutral"
            : latestMacd > latestSignal && latestHistogram >= 0
              ? "bullish"
              : latestMacd < latestSignal && latestHistogram <= 0
                ? "bearish"
                : "neutral",
        tone:
          latestMacd === null || latestSignal === null || latestHistogram === null
            ? "Balanced"
            : formatSignalTone(
                latestMacd > latestSignal && latestHistogram >= 0
                  ? "bullish"
                  : latestMacd < latestSignal && latestHistogram <= 0
                    ? "bearish"
                    : "neutral",
              ),
        value: latestHistogram,
      },
    ] as const,
  };
}
