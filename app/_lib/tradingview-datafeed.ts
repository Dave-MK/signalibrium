import { fetchMarketChart } from "./workspace-api";
import {
  getTradingViewSymbolDefinition,
  listTradingViewSymbolDefinitions,
} from "./tradingview-symbols";
import type {
  LiveCandle,
  SupportedChartInterval,
} from "./server/market-data/provider-types";

type TradingViewSearchSymbolResult = {
  description: string;
  exchange: string;
  full_name: string;
  symbol: string;
  ticker: string;
  type: "crypto" | "stock";
};

type TradingViewLibrarySymbolInfo = {
  data_status: "streaming";
  description: string;
  exchange: string;
  format: "price";
  has_daily: true;
  has_intraday: true;
  has_weekly_and_monthly: true;
  minmov: number;
  name: string;
  pricescale: number;
  session: string;
  supported_resolutions: string[];
  ticker: string;
  timezone: string;
  type: "crypto" | "stock";
  visible_plots_set: "ohlcv";
  volume_precision: number;
};

type TradingViewBar = {
  close: number;
  high: number;
  low: number;
  open: number;
  time: number;
  volume?: number;
};

type TradingViewHistoryMetadata = {
  noData: boolean;
};

type TradingViewSubscriber = {
  interval: SupportedChartInterval;
  lastBarTime: number | null;
  symbol: string;
  timerId: number;
};

const supportedResolutions = ["15", "60", "240", "1D"] as const;
const subscribers = new Map<string, TradingViewSubscriber>();

function parseWidgetSymbol(widgetSymbol: string) {
  const [exchange = "", ticker = widgetSymbol] = widgetSymbol.split(":");
  return { exchange, ticker };
}

function mapResolutionToInterval(resolution: string): SupportedChartInterval {
  switch (resolution) {
    case "15":
      return "15min";
    case "240":
      return "4h";
    case "D":
    case "1D":
      return "1day";
    case "60":
    default:
      return "1h";
  }
}

function getPollIntervalMs(interval: SupportedChartInterval) {
  switch (interval) {
    case "15min":
      return 30_000;
    case "1h":
      return 45_000;
    case "4h":
      return 60_000;
    case "1day":
    default:
      return 75_000;
  }
}

function getOutputsizeForInterval(interval: SupportedChartInterval, countBack: number) {
  const baseline = interval === "15min" ? 64 : 48;
  return Math.min(120, Math.max(baseline, countBack, 2));
}

function toTradingViewTimestamp(candle: LiveCandle) {
  const normalized = candle.datetime.includes("T")
    ? candle.datetime
    : `${candle.datetime.replace(" ", "T")}Z`;

  return Date.parse(normalized);
}

function toTradingViewBars(candles: LiveCandle[]) {
  return candles
    .map<TradingViewBar | null>((candle) => {
      const time = toTradingViewTimestamp(candle);

      if (!Number.isFinite(time)) {
        return null;
      }

      return {
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? undefined,
      };
    })
    .filter((bar): bar is TradingViewBar => Boolean(bar))
    .sort((left, right) => left.time - right.time);
}

function getSearchResults() {
  return listTradingViewSymbolDefinitions().map<TradingViewSearchSymbolResult>((item) => {
    const { exchange, ticker } = parseWidgetSymbol(item.widgetSymbol);

    return {
      symbol: item.symbol,
      full_name: `${exchange}:${ticker}`,
      description: item.name,
      exchange,
      ticker: item.symbol,
      type: item.assetType,
    };
  });
}

function getSymbolInfo(symbolName: string): TradingViewLibrarySymbolInfo | null {
  const directDefinition = getTradingViewSymbolDefinition(symbolName);
  const searchMatch = getSearchResults().find((item) => {
    const normalizedInput = symbolName.trim().toUpperCase();
    return (
      item.symbol.toUpperCase() === normalizedInput ||
      item.full_name.toUpperCase() === normalizedInput ||
      item.ticker.toUpperCase() === normalizedInput
    );
  });
  const definition =
    directDefinition ??
    (searchMatch ? getTradingViewSymbolDefinition(searchMatch.symbol) : null);

  if (!definition) {
    return null;
  }

  const { exchange } = parseWidgetSymbol(definition.widgetSymbol);

  return {
    ticker: definition.symbol,
    name: definition.symbol,
    description: definition.name,
    type: definition.assetType,
    session: definition.assetType === "crypto" ? "24x7" : "0930-1600",
    timezone: definition.assetType === "crypto" ? "Etc/UTC" : "America/New_York",
    exchange,
    minmov: 1,
    pricescale: definition.priceScale,
    has_intraday: true,
    has_daily: true,
    visible_plots_set: "ohlcv",
    has_weekly_and_monthly: true,
    supported_resolutions: [...supportedResolutions],
    volume_precision: 2,
    data_status: "streaming",
    format: "price",
  };
}

async function loadBars(symbol: string, resolution: string, countBack: number) {
  const interval = mapResolutionToInterval(resolution);
  const chart = await fetchMarketChart(
    symbol,
    interval,
    getOutputsizeForInterval(interval, countBack),
  );
  return toTradingViewBars(chart.candles);
}

export function createTradingViewDatafeed() {
  return {
    onReady(callback: (configuration: Record<string, unknown>) => void) {
      queueMicrotask(() => {
        callback({
          supports_search: true,
          supports_group_request: false,
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: false,
          supported_resolutions: [...supportedResolutions],
          exchanges: [
            { value: "", name: "All Exchanges", desc: "" },
            { value: "AMEX", name: "AMEX", desc: "American Stock Exchange" },
            { value: "BYBIT", name: "BYBIT", desc: "Bybit" },
            { value: "COINBASE", name: "COINBASE", desc: "Coinbase" },
            { value: "KUCOIN", name: "KUCOIN", desc: "KuCoin" },
          ],
          symbols_types: [
            { name: "All types", value: "" },
            { name: "Crypto", value: "crypto" },
            { name: "Stock", value: "stock" },
          ],
        });
      });
    },

    searchSymbols(
      userInput: string,
      exchange: string,
      symbolType: string,
      onResultReadyCallback: (results: TradingViewSearchSymbolResult[]) => void,
    ) {
      const normalizedInput = userInput.trim().toUpperCase();
      const results = getSearchResults().filter((item) => {
        const matchesInput =
          normalizedInput.length === 0 ||
          item.symbol.toUpperCase().includes(normalizedInput) ||
          item.description.toUpperCase().includes(normalizedInput) ||
          item.full_name.toUpperCase().includes(normalizedInput);
        const matchesExchange =
          !exchange || item.exchange.toUpperCase() === exchange.toUpperCase();
        const matchesType = !symbolType || item.type === symbolType;

        return matchesInput && matchesExchange && matchesType;
      });

      onResultReadyCallback(results);
    },

    resolveSymbol(
      symbolName: string,
      onSymbolResolvedCallback: (symbolInfo: TradingViewLibrarySymbolInfo) => void,
      onResolveErrorCallback: (message: string) => void,
    ) {
      const symbolInfo = getSymbolInfo(symbolName);

      if (!symbolInfo) {
        onResolveErrorCallback("unknown_symbol");
        return;
      }

      queueMicrotask(() => {
        onSymbolResolvedCallback(symbolInfo);
      });
    },

    async getBars(
      symbolInfo: TradingViewLibrarySymbolInfo,
      resolution: string,
      periodParams: { countBack: number },
      onHistoryCallback: (bars: TradingViewBar[], meta: TradingViewHistoryMetadata) => void,
      onErrorCallback: (message: string) => void,
    ) {
      try {
        const bars = await loadBars(
          symbolInfo.ticker,
          resolution,
          periodParams.countBack,
        );

        onHistoryCallback(bars, { noData: bars.length === 0 });
      } catch (error) {
        onErrorCallback(
          error instanceof Error ? error.message : "Unable to load market history.",
        );
      }
    },

    subscribeBars(
      symbolInfo: TradingViewLibrarySymbolInfo,
      resolution: string,
      onRealtimeCallback: (bar: TradingViewBar) => void,
      subscriberUID: string,
    ) {
      const interval = mapResolutionToInterval(resolution);

      const pollLatestBar = async () => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          return;
        }

        try {
          const bars = await loadBars(symbolInfo.ticker, resolution, 2);
          const latestBar = bars[bars.length - 1];

          if (!latestBar) {
            return;
          }

          const current = subscribers.get(subscriberUID);

          if (!current) {
            return;
          }

          if (current.lastBarTime === null || latestBar.time >= current.lastBarTime) {
            current.lastBarTime = latestBar.time;
            onRealtimeCallback(latestBar);
          }
        } catch {
          // Keep the chart mounted even if one polling cycle fails.
        }
      };

      void pollLatestBar();

      const timerId = window.setInterval(() => {
        void pollLatestBar();
      }, getPollIntervalMs(interval));

      subscribers.set(subscriberUID, {
        symbol: symbolInfo.ticker,
        interval,
        lastBarTime: null,
        timerId,
      });
    },

    unsubscribeBars(subscriberUID: string) {
      const subscriber = subscribers.get(subscriberUID);

      if (!subscriber) {
        return;
      }

      window.clearInterval(subscriber.timerId);
      subscribers.delete(subscriberUID);
    },
  };
}
