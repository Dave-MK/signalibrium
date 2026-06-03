"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Script from "next/script";
import type { SupportedChartInterval } from "@/app/_lib/server/market-data/provider-types";
import { createTradingViewDatafeed } from "@/app/_lib/tradingview-datafeed";

type TradingViewWidgetInstance = {
  activeChart?: () => {
    setResolution?: (resolution: string, callback?: () => void) => void;
  };
  onChartReady?: (callback: () => void) => void;
  remove?: () => void;
};

type TradingViewLibraryWindow = Window & {
  TradingView?: {
    widget: new (options: Record<string, unknown>) => TradingViewWidgetInstance;
  };
};

const intervalMap: Record<SupportedChartInterval, string> = {
  "15min": "15",
  "1h": "60",
  "4h": "240",
  "1day": "1D",
};

export function TradingViewChartingLibraryWorkspace({
  symbol,
  displaySymbol,
  libraryPath = "/charting_library/",
  selectedInterval,
  heightClassName = "h-[460px] sm:h-[560px] lg:h-[680px] xl:h-[760px]",
}: {
  symbol: string;
  displaySymbol: string;
  libraryPath?: string;
  selectedInterval: SupportedChartInterval;
  heightClassName?: string;
}) {
  const widgetId = useId().replace(/:/g, "_");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<TradingViewWidgetInstance | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const datafeed = useMemo(() => createTradingViewDatafeed(), []);

  useEffect(() => {
    const host = containerRef.current;

    if (!scriptReady || !host) {
      return;
    }

    const tradingViewWindow = window as TradingViewLibraryWindow;

    if (!tradingViewWindow.TradingView?.widget) {
      const missingLibraryTimeoutId = window.setTimeout(() => {
        setError("TradingView Charting Library is not available in this environment.");
        setIsLoading(false);
      }, 0);

      return () => {
        window.clearTimeout(missingLibraryTimeoutId);
      };
    }

    const loadingStateTimeoutId = window.setTimeout(() => {
      setError(null);
      setIsLoading(true);
    }, 0);
    host.innerHTML = "";

    const widget = new tradingViewWindow.TradingView.widget({
      container: host,
      library_path: libraryPath,
      datafeed,
      symbol,
      interval: intervalMap[selectedInterval],
      locale: "en",
      timezone: "Europe/London",
      autosize: true,
      theme: "dark",
      fullscreen: false,
      allow_symbol_change: true,
      save_image: true,
      details: false,
      calendar: false,
      withdateranges: true,
      enabled_features: [
        "display_market_status",
        "show_spread_operators",
        "symbol_search_hot_key",
        "study_templates",
      ],
      disabled_features: [
        "header_saveload",
        "use_localstorage_for_settings",
        "volume_force_overlay",
      ],
      loading_screen: {
        backgroundColor: "#0b1220",
        foregroundColor: "#22d3ee",
      },
      overrides: {
        "paneProperties.background": "#0b1220",
        "paneProperties.backgroundType": "solid",
        "paneProperties.vertGridProperties.color": "rgba(148, 163, 184, 0.07)",
        "paneProperties.horzGridProperties.color": "rgba(148, 163, 184, 0.07)",
        "paneProperties.crossHairProperties.color": "rgba(34, 211, 238, 0.22)",
        "mainSeriesProperties.candleStyle.upColor": "#22d3ee",
        "mainSeriesProperties.candleStyle.downColor": "#f87171",
        "mainSeriesProperties.candleStyle.borderUpColor": "#22d3ee",
        "mainSeriesProperties.candleStyle.borderDownColor": "#f87171",
        "mainSeriesProperties.candleStyle.wickUpColor": "#22d3ee",
        "mainSeriesProperties.candleStyle.wickDownColor": "#f87171",
      },
      studies_overrides: {
        "volume.volume.color.0": "rgba(248, 113, 113, 0.65)",
        "volume.volume.color.1": "rgba(34, 211, 238, 0.65)",
      },
      custom_css_url: "/charting_library/signalibrium-chart.css",
    });

    widgetRef.current = widget;
    widget.onChartReady?.(() => {
      setIsLoading(false);
    });

    return () => {
      widgetRef.current?.remove?.();
      widgetRef.current = null;
      window.clearTimeout(loadingStateTimeoutId);
      host.innerHTML = "";
    };
  }, [datafeed, libraryPath, scriptReady, selectedInterval, symbol]);

  useEffect(() => {
    const activeChart = widgetRef.current?.activeChart?.();

    if (!activeChart?.setResolution) {
      return;
    }

    activeChart.setResolution(intervalMap[selectedInterval], () => {
      setIsLoading(false);
    });
  }, [selectedInterval]);

  return (
    <div className="relative">
      <Script
        id={`tradingview-charting-library-${widgetId}`}
        src={`${libraryPath}charting_library.js`}
        strategy="afterInteractive"
        onReady={() => {
          setScriptReady(true);
        }}
        onError={() => {
          setError("TradingView Charting Library failed to load.");
          setIsLoading(false);
        }}
      />

      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[0.46rem] bg-[rgba(8,12,20,0.46)] backdrop-blur-[1px]">
          <div className="signal-surface-soft rounded-[0.4rem] px-3 py-2 text-[0.78rem] text-slate-200">
            Loading {displaySymbol} chart workspace...
          </div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={`signal-surface overflow-hidden rounded-[0.46rem] p-0.5 ${heightClassName}`}
        aria-label={`${displaySymbol} charting library workspace`}
      />

      {error ? (
        <div className="signal-warning-surface mt-[5px] rounded-[0.4rem] p-3">
          <p className="text-[0.82rem] font-semibold text-amber-100">Chart workspace unavailable</p>
          <p className="mt-1 text-[0.78rem] leading-5 text-slate-300">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
