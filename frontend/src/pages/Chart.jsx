import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, LineStyle } from 'lightweight-charts';
import { useAuth } from '../context/AuthContext';

export default function Chart() {
  const { user } = useAuth();
  const chartContainerRef = useRef();
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [error, setError] = useState(null);

  // Helper to clear all price lines
  const clearPriceLines = () => {
    if (seriesRef.current && priceLinesRef.current.length > 0) {
      priceLinesRef.current.forEach(line => {
        seriesRef.current.removePriceLine(line);
      });
      priceLinesRef.current = [];
    }
  };

  // Helper to add a price line
  const addPriceLine = (price, title, color, style = LineStyle.Solid) => {
    if (!seriesRef.current) return;
    const priceVal = parseFloat(price);
    if (isNaN(priceVal)) return;

    const line = seriesRef.current.createPriceLine({
      price: priceVal,
      color: color,
      lineWidth: 1,
      lineStyle: style,
      axisLabelVisible: true,
      title: title,
    });
    priceLinesRef.current.push(line);
  };

  // Fetch Account & Orders Data
  const updateOverlayData = useCallback(async () => {
    if (!user) return;
    
    try {
      // 1. Fetch Account (Positions)
      const accRes = await fetch(`/api/accounts/${user.id}`);
      if (accRes.ok) {
        const accData = await accRes.json();
        
        // Clear existing lines before adding new ones
        clearPriceLines();

        // Add Position Lines
        if (accData.positions && Array.isArray(accData.positions)) {
          accData.positions.forEach(pos => {
            if (pos.symbol === symbol) {
              // Entry Price
              addPriceLine(pos.entry_price, `Pos: ${pos.quantity}`, '#2962FF', LineStyle.Solid);
              
              // SL/TP
              if (pos.stop_loss_price) {
                  addPriceLine(pos.stop_loss_price, 'SL', '#ef5350', LineStyle.Dashed);
              }
              if (pos.take_profit_price) {
                  addPriceLine(pos.take_profit_price, 'TP', '#26a69a', LineStyle.Dashed);
              }
            }
          });
        }
      }

      // 2. Fetch Open Orders
      const ordersRes = await fetch(`/api/orders/?account_id=${user.id}`);
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        if (Array.isArray(ordersData)) {
          ordersData.forEach(order => {
            if (order.symbol === symbol && order.status === 'NEW') {
               // Limit Order Price
               if (order.limit_price) {
                   addPriceLine(order.limit_price, `Order: ${order.side} ${order.quantity}`, '#FF9800', LineStyle.Dotted);
               }
            }
          });
        }
      }

    } catch (err) {
      console.error("Failed to fetch overlay data", err);
    }
  }, [user, symbol]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    console.log("Initializing chart...");
    // Clear previous content
    chartContainerRef.current.innerHTML = '';

    // Create Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: chartContainerRef.current.clientWidth || 800,
      height: 600,
      grid: {
        vertLines: { color: '#f0f3fa' },
        horzLines: { color: '#f0f3fa' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const newSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    
    seriesRef.current = newSeries;

    let ws = null;

    const fetchData = async () => {
      try {
        setError(null);
        // Use proxy for Binance API to avoid CORS
        const response = await fetch(
          `/api/market/klines?symbol=${symbol}&interval=${timeframe}&limit=1000`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error("Invalid data format");
        }

        const cdata = data.map(d => ({
          time: d[0] / 1000,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));

        cdata.sort((a, b) => a.time - b.time);
        newSeries.setData(cdata);

        // Initial overlay update
        updateOverlayData();

        // WebSocket
        const wsSymbol = symbol.toLowerCase();
        const wsUrl = `wss://stream.binance.com:9443/ws/${wsSymbol}@kline_${timeframe}`;
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to Binance WS');
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          const kline = message.k;
          const candle = {
            time: kline.t / 1000,
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
          };
          newSeries.update(candle);
        };

        ws.onerror = (err) => {
            console.error('WS Error:', err);
        };

      } catch (err) {
        console.error("Chart Error:", err);
        setError(err.message);
      }
    };

    fetchData();

    // Poll for overlay updates every 5 seconds
    const overlayInterval = setInterval(updateOverlayData, 5000);

    const handleResize = () => {
        if (chartContainerRef.current) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(overlayInterval);
      if (ws) ws.close();
      chart.remove();
      seriesRef.current = null;
    };
  }, [symbol, timeframe, user, updateOverlayData]); // Re-run if user changes

  return (
    <div className="p-6">
      <div className="mb-4 flex gap-4">
        <select 
          value={symbol} 
          onChange={(e) => setSymbol(e.target.value)}
          className="p-2 border rounded shadow-sm"
        >
          <option value="BTCUSDT">BTC/USDT</option>
          <option value="ETHUSDT">ETH/USDT</option>
          <option value="BNBUSDT">BNB/USDT</option>
          <option value="SOLUSDT">SOL/USDT</option>
        </select>
        
        <select 
          value={timeframe} 
          onChange={(e) => setTimeframe(e.target.value)}
          className="p-2 border rounded shadow-sm"
        >
          <option value="1m">1 Minute</option>
          <option value="15m">15 Minutes</option>
          <option value="1h">1 Hour</option>
          <option value="4h">4 Hours</option>
          <option value="1d">1 Day</option>
        </select>
      </div>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
            Error: {error}. Please check your connection or try a different symbol.
        </div>
      )}

      <div 
        ref={chartContainerRef} 
        style={{ height: '600px', width: '100%', backgroundColor: '#eee' }}
        className="border rounded-lg shadow-md relative"
      />
    </div>
  );
}
