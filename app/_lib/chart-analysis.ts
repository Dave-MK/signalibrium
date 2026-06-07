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

function computeBollingerBands(values: number[], period = 20, standardDeviations = 2) {
  const middle: Array<number | null> = Array(values.length).fill(null);
  const upper: Array<number | null> = Array(values.length).fill(null);
  const lower: Array<number | null> = Array(values.length).fill(null);

  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    const average = window.reduce((sum, value) => sum + value, 0) / period;
    const variance =
      window.reduce((sum, value) => sum + (value - average) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);

    middle[index] = average;
    upper[index] = average + deviation * standardDeviations;
    lower[index] = average - deviation * standardDeviations;
  }

  return { lower, middle, upper };
}

function computeStochasticSeries(candles: LiveCandle[], period = 14) {
  const series: Array<number | null> = Array(candles.length).fill(null);

  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const highestHigh = Math.max(...window.map((candle) => candle.high));
    const lowestLow = Math.min(...window.map((candle) => candle.low));
    const range = highestHigh - lowestLow;

    series[index] =
      range <= 0 ? 50 : ((candles[index].close - lowestLow) / range) * 100;
  }

  return series;
}

function computeRateOfChangeSeries(values: number[], period = 10) {
  return values.map((value, index) => {
    if (index < period || values[index - period] === 0) {
      return null;
    }

    return ((value - values[index - period]) / values[index - period]) * 100;
  });
}

function computeVwapSeries(candles: LiveCandle[]) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  return candles.map((candle) => {
    if (!Number.isFinite(candle.volume) || candle.volume === null || candle.volume <= 0) {
      return null;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    if (cumulativeVolume <= 0) {
      return null;
    }

    return cumulativePriceVolume / cumulativeVolume;
  });
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
  ema200: number | null;
  rsi: number | null;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  symbol: string;
  name: string;
}) {
  const aboveEma20 = input.ema20 !== null && input.close > input.ema20;
  const aboveEma50 = input.ema50 !== null && input.close > input.ema50;
  const aboveEma200 = input.ema200 !== null && input.close > input.ema200;
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

  // Short-term bullish checklist passes but price is below EMA 200 — this is a
  // counter-trend recovery in a broader downtrend, not a clean continuation.
  if (aboveEma20 && aboveEma50 && emaStackBullish && rsiBullish && macdBullish && input.ema200 !== null && !aboveEma200) {
    return {
      bias: "Bear market bounce",
      signal: "neutral" as const,
      summary: `${input.symbol} passes the short-term bullish checklist but is still trading below the 200-period average. That means this is a counter-trend recovery, not a clean trend continuation — Siggi treats it with more caution than a full bull signal.`,
    };
  }

  if (aboveEma20 && aboveEma50 && emaStackBullish && rsiBullish && macdBullish && (input.ema200 === null || aboveEma200)) {
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
  const ema200 = computeEmaSeries(closes, 200);
  const rsi = computeRsiSeries(closes, 14);
  const macdSeries = computeMacdSeries(closes);
  const bollingerBands = computeBollingerBands(closes, 20, 2);
  const stochastic = computeStochasticSeries(candles, 14);
  const roc10 = computeRateOfChangeSeries(closes, 10);
  const vwap = computeVwapSeries(candles);

  const latestClose = closes.at(-1) ?? 0;
  const latestEma20 = getLatestDefinedValue(ema20);
  const latestEma50 = getLatestDefinedValue(ema50);
  const latestEma200 = getLatestDefinedValue(ema200);
  const latestRsi = getLatestDefinedValue(rsi);
  const latestMacd = getLatestDefinedValue(macdSeries.macd);
  const latestSignal = getLatestDefinedValue(macdSeries.signal);
  const latestHistogram = getLatestDefinedValue(macdSeries.histogram);
  const latestBollingerUpper = getLatestDefinedValue(bollingerBands.upper);
  const latestBollingerLower = getLatestDefinedValue(bollingerBands.lower);
  const latestStochastic = getLatestDefinedValue(stochastic);
  const latestRoc10 = getLatestDefinedValue(roc10);
  const latestVwap = getLatestDefinedValue(vwap);
  const overall = buildOverallRead({
    close: latestClose,
    ema20: latestEma20,
    ema50: latestEma50,
    ema200: latestEma200,
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
    ema200,
    macd: macdSeries.macd,
    macdHistogram: macdSeries.histogram,
    macdSignal: macdSeries.signal,
    overall,
    rsi,
    vwap,
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
        explanation: latestEma200 === null
          ? "Not enough candles yet. EMA 200 needs 200 bars to initialise."
          : latestClose >= latestEma200
            ? "Price is above the 200-period average — the broad trend backdrop is constructive and Siggi can trust continuation reads more."
            : "Price is below the 200-period average — the broad trend backdrop is still defensive. Bullish entries need extra confirmation here.",
        label: "EMA 200",
        signal: latestEma200 === null ? "neutral" : latestClose >= latestEma200 ? "bullish" : "bearish",
        tone: latestEma200 === null ? "Balanced" : latestClose >= latestEma200 ? "Constructive" : "Soft",
        value: latestEma200,
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
      {
        explanation:
          latestBollingerUpper === null || latestBollingerLower === null
            ? "Not enough candles yet."
            : latestClose >= latestBollingerUpper
              ? "Price is pressing the upper band and strength is extended."
              : latestClose <= latestBollingerLower
                ? "Price is pressing the lower band and weakness is stretched."
                : "Price is trading inside the Bollinger envelope without an extreme stretch.",
        label: "Bollinger",
        signal:
          latestBollingerUpper === null || latestBollingerLower === null
            ? "neutral"
            : latestClose >= latestBollingerUpper
              ? "bullish"
              : latestClose <= latestBollingerLower
                ? "bearish"
                : "neutral",
        tone:
          latestBollingerUpper === null || latestBollingerLower === null
            ? "Balanced"
            : formatSignalTone(
                latestClose >= latestBollingerUpper
                  ? "bullish"
                  : latestClose <= latestBollingerLower
                    ? "bearish"
                    : "neutral",
              ),
        value: latestBollingerUpper ?? latestBollingerLower,
      },
      {
        explanation:
          latestVwap === null
            ? "Volume-weighted trend read is unavailable because this feed does not expose usable intraday volume."
            : latestClose >= latestVwap
              ? "Price is holding above VWAP, which supports intraday continuation rather than immediate fade risk."
              : "Price is trading below VWAP, so intraday control is still soft.",
        label: "VWAP",
        signal:
          latestVwap === null
            ? "neutral"
            : latestClose >= latestVwap
              ? "bullish"
              : "bearish",
        tone:
          latestVwap === null
            ? "Balanced"
            : formatSignalTone(latestClose >= latestVwap ? "bullish" : "bearish"),
        value: latestVwap,
      },
      {
        explanation:
          latestStochastic === null
            ? "Not enough candles yet."
            : latestStochastic >= 70
              ? "Fast momentum is pushing into the upper range."
              : latestStochastic <= 30
                ? "Fast momentum is pressing the lower range."
                : "Fast momentum is balanced.",
        label: "Stochastic",
        signal:
          latestStochastic === null
            ? "neutral"
            : latestStochastic >= 60
              ? "bullish"
              : latestStochastic <= 40
                ? "bearish"
                : "neutral",
        tone:
          latestStochastic === null
            ? "Balanced"
            : formatSignalTone(
                latestStochastic >= 60
                  ? "bullish"
                  : latestStochastic <= 40
                    ? "bearish"
                    : "neutral",
              ),
        value: latestStochastic,
      },
      {
        explanation:
          latestRoc10 === null
            ? "Not enough candles yet."
            : latestRoc10 >= 2.5
              ? "Ten-bar momentum is expanding positively."
              : latestRoc10 <= -2.5
                ? "Ten-bar momentum is deteriorating."
                : "Ten-bar momentum is near flat.",
        label: "ROC 10",
        signal:
          latestRoc10 === null
            ? "neutral"
            : latestRoc10 >= 2
              ? "bullish"
              : latestRoc10 <= -2
                ? "bearish"
                : "neutral",
        tone:
          latestRoc10 === null
            ? "Balanced"
            : formatSignalTone(
                latestRoc10 >= 2 ? "bullish" : latestRoc10 <= -2 ? "bearish" : "neutral",
              ),
        value: latestRoc10,
      },
    ] as const,
  };
}
