"use client";

import { useEffect, useRef } from "react";

export function CryptoMarketTable() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && !containerRef.current.querySelector("script")) {
      const script = document.createElement("script");
      script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-screener.js";
      script.async = true;
      script.innerHTML = JSON.stringify({
        width: "100%",
        height: "500",
        defaultColumn: "overview",
        screener_type: "crypto_mkt",
        displayCurrency: "USD",
        colorTheme: "dark",
        locale: "en",
        isTransparent: true,
        market: "crypto",
        enableForex: false,
        enableCFD: false,
        enableStock: false,
        enableIndex: false,
        enableFutures: false,
        enableCrypto: true,
        showToolbar: false,
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
