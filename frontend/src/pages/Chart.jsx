import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, LineStyle } from 'lightweight-charts';
import { useAuth } from '../context/AuthContext';

export default function Chart() {
  const { user } = useAuth();
  const chartContainerRef = useRef();
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const chartRef = useRef(null);
  
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [error, setError] = useState(null);
  const [draggingLine, setDraggingLine] = useState(null);

  // Helper to clear all price lines
  const clearPriceLines = () => {
    if (seriesRef.current && priceLinesRef.current.length > 0) {
      priceLinesRef.current.forEach(item => {
        seriesRef.current.removePriceLine(item.line);
      });
      priceLinesRef.current = [];
    }
  };

  // Helper to add a price line
  const addPriceLine = (price, title, color, style = LineStyle.Solid, draggableInfo = null) => {
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
    
    // Store line with metadata
    priceLinesRef.current.push({
        line,
        price: priceVal,
        draggableInfo // { type: 'TP' | 'SL', positionId: number }
    });
  };

  // Fetch Account & Orders Data
  const updateOverlayData = useCallback(async () => {
    if (!user || draggingLineRef.current) return; // Don't update if dragging
    
    try {
      // 1. Fetch Account (Positions)
      const accRes = await fetch(`/api/accounts/${user.id}`);
      if (accRes.ok) {
        const accData = await accRes.json();
        
        // Check if chart is still mounted/valid
        if (!seriesRef.current) return;

        // Clear existing lines before adding new ones
        clearPriceLines();

        // Add Position Lines
        if (accData.positions && Array.isArray(accData.positions)) {
          accData.positions.forEach(pos => {
            if (pos.symbol === symbol) {
              // Entry Price
              const pnlText = pos.unrealized_pnl ? ` (PNL: ${parseFloat(pos.unrealized_pnl).toFixed(2)})` : '';
              addPriceLine(pos.entry_price, `Pos: ${pos.quantity}${pnlText}`, '#2962FF', LineStyle.Solid);
              
              // SL/TP
              if (pos.stop_loss_price) {
                  addPriceLine(pos.stop_loss_price, 'SL', '#ef5350', LineStyle.Dashed, { type: 'SL', positionId: pos.id });
              }
              if (pos.take_profit_price) {
                  addPriceLine(pos.take_profit_price, 'TP', '#26a69a', LineStyle.Dashed, { type: 'TP', positionId: pos.id });
              }
            }
          });
        }
      }

      // 2. Fetch Open Orders
      const ordersRes = await fetch(`/api/orders/?account_id=${user.id}`);
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        
        // Check if chart is still mounted/valid
        if (!seriesRef.current) return;

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

  const draggingLineRef = useRef(null);

  // ... existing code ...

  // Handle Dragging Logic (Separate Effect for Event Listeners using Refs)
  useEffect(() => {
      const container = chartContainerRef.current;
      if (!container) return;

      const handleMouseDown = (e) => {
          if (!seriesRef.current || !chartRef.current) return;
          const rect = container.getBoundingClientRect();
          const y = e.clientY - rect.top;
          
          // Convert y to price
          const price = seriesRef.current.coordinateToPrice(y);
          if (price === null) return;

          // Find closest line
          let closestLine = null;
          let minDiff = Infinity;
          
          priceLinesRef.current.forEach(item => {
              if (!item.draggableInfo) return;
              
              const lineY = seriesRef.current.priceToCoordinate(item.price);
              if (lineY === null) return;
              
              const diff = Math.abs(y - lineY);
              if (diff < 10) { // 10px threshold
                  if (diff < minDiff) {
                      minDiff = diff;
                      closestLine = item;
                  }
              }
          });

          if (closestLine) {
              draggingLineRef.current = closestLine;
              setDraggingLine(closestLine); // Trigger re-render if needed, or just for UI state
              
              // Disable chart scrolling
              chartRef.current.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: false });
              chartRef.current.applyOptions({ handleScroll: false, handleScale: false });
          }
      };

      const handleMouseMove = (e) => {
          if (!seriesRef.current) return;
          const rect = container.getBoundingClientRect();
          const y = e.clientY - rect.top;
          
          const currentDraggingLine = draggingLineRef.current;

          if (currentDraggingLine) {
              container.style.cursor = 'ns-resize';
              const newPrice = seriesRef.current.coordinateToPrice(y);
              if (newPrice !== null) {
                  // Update line visually
                  currentDraggingLine.line.applyOptions({ price: newPrice });
                  currentDraggingLine.price = newPrice; 
              }
          } else {
              // Hover effect
              let hovering = false;
              priceLinesRef.current.forEach(item => {
                  if (!item.draggableInfo) return;
                  const lineY = seriesRef.current.priceToCoordinate(item.price);
                  if (lineY !== null && Math.abs(y - lineY) < 10) {
                      hovering = true;
                  }
              });
              container.style.cursor = hovering ? 'ns-resize' : 'default';
          }
      };

      const handleMouseUp = async () => {
          const currentDraggingLine = draggingLineRef.current;
          if (currentDraggingLine) {
              // Commit change
              const { type, positionId } = currentDraggingLine.draggableInfo;
              const newPrice = currentDraggingLine.price;
              
              try {
                  const payload = {};
                  if (type === 'TP') payload.take_profit_price = newPrice;
                  if (type === 'SL') payload.stop_loss_price = newPrice;
                  
                  await fetch(`/api/positions/${positionId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                  });
                  console.log(`Updated ${type} for position ${positionId} to ${newPrice}`);
              } catch (err) {
                  console.error("Failed to update position", err);
              }

              draggingLineRef.current = null;
              setDraggingLine(null);
              
              // Re-enable chart interactions
              if (chartRef.current) {
                  chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
              }
              // Refresh data
              updateOverlayData();
          }
      };

      container.addEventListener('mousedown', handleMouseDown);
      container.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
          container.removeEventListener('mousedown', handleMouseDown);
          container.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [updateOverlayData]); // Only re-bind if updateOverlayData changes (which depends on user/symbol)

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
    
    chartRef.current = chart;

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
        if (seriesRef.current) {
            newSeries.setData(cdata);
        }

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
          if (seriesRef.current) {
              newSeries.update(candle);
          }
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
      
      // Clean up chart
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
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
        style={{ height: '600px', width: '100%', backgroundColor: '#eee', cursor: draggingLine ? 'ns-resize' : 'default' }}
        className="border rounded-lg shadow-md relative"
      />
    </div>
  );
}
