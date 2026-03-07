"use client";

import { useEffect, useRef } from "react";

export function CryptoLiveChart() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && !containerRef.current.querySelector("script")) {
      const script = document.createElement("script");
      script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
      script.async = true;
      script.innerHTML = JSON.stringify({
        symbols: [
          ["Bitcoin", "BITSTAMP:BTCUSD|1D"],
          ["Ethereum", "BITSTAMP:ETHUSD|1D"],
          ["Solana", "BINANCE:SOLUSD|1D"],
          ["BNB", "BINANCE:BNBUSD|1D"],
          ["XRP", "BITSTAMP:XRPUSD|1D"],
          ["Cardano", "BINANCE:ADAUSD|1D"],
        ],
        chartOnly: false,
        width: "100%",
        height: "500",
        locale: "en",
        colorTheme: "dark",
        autosize: true,
        showVolume: false,
        hideDateRanges: false,
        scalePosition: "right",
        scaleMode: "Normal",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
        fontSize: "10",
        noTimeScale: false,
        valuesTracking: "1",
        changeMode: "price-and-percent",
        chartType: "area",
        maLineColor: "#2962FF",
        maLineWidth: 1,
        maLength: 9,
        lineWidth: 2,
        lineType: 0,
        dateRanges: [
          "1d|1",
          "1m|30",
          "3m|60",
          "12m|1D",
          "60m|1W",
          "all|1M",
        ],
      });
      containerRef.current.appendChild(script);
    }
  }, []);

  return (
    <div className="tradingview-widget-container" ref={containerRef}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}
