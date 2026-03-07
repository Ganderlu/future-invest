"use client";

import { useEffect, useRef } from "react";

export function CryptoTicker() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && !containerRef.current.querySelector("script")) {
      const script = document.createElement("script");
      script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
      script.async = true;
      script.innerHTML = JSON.stringify({
        symbols: [
          {
            proName: "BITSTAMP:BTCUSD",
            title: "Bitcoin",
          },
          {
            proName: "BITSTAMP:ETHUSD",
            title: "Ethereum",
          },
          {
            description: "Solana",
            proName: "BINANCE:SOLUSD",
          },
          {
            description: "BNB",
            proName: "BINANCE:BNBUSD",
          },
          {
            description: "XRP",
            proName: "BITSTAMP:XRPUSD",
          },
          {
            description: "Cardano",
            proName: "BINANCE:ADAUSD",
          },
          {
            description: "Dogecoin",
            proName: "BINANCE:DOGEUSD",
          },
          {
            description: "Polkadot",
            proName: "BINANCE:DOTUSD",
          },
        ],
        showSymbolLogo: true,
        colorTheme: "dark",
        isTransparent: false,
        displayMode: "adaptive",
        locale: "en",
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
