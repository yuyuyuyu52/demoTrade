import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, LineStyle, CrosshairMode } from 'lightweight-charts';
import { useAuth } from '../context/AuthContext';

export default function Chart() {
  const { user } = useAuth();
  const chartContainerRef = useRef();
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const chartRef = useRef(null);
  const lastPriceRef = useRef(null);
  const crosshairPriceRef = useRef(null);
  const draggingLineRef = useRef(null);
  const labelsContainerRef = useRef(null); // Container for custom HTML labels
  const allDataRef = useRef([]); // Store all loaded data
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  
  // Initialize state from localStorage if available
  const [symbol, setSymbol] = useState(() => localStorage.getItem('chart_symbol') || 'BTCUSDT');
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('chart_timeframe') || '1h');
  const [quantity, setQuantity] = useState(() => {
      const saved = localStorage.getItem('chart_quantity');
      return saved ? parseFloat(saved) : 0.01;
  });
  const [error, setError] = useState(null);
  const [draggingLine, setDraggingLine] = useState(null);

  // Save settings to localStorage whenever they change
  useEffect(() => {
      localStorage.setItem('chart_symbol', symbol);
      localStorage.setItem('chart_timeframe', timeframe);
      localStorage.setItem('chart_quantity', quantity);
  }, [symbol, timeframe, quantity]);

  // Helper to clear all price lines and labels
  const clearPriceLines = () => {
    if (seriesRef.current && priceLinesRef.current.length > 0) {
      priceLinesRef.current.forEach(item => {
        seriesRef.current.removePriceLine(item.line);
        if (item.labelElement) {
            item.labelElement.remove();
        }
      });
      priceLinesRef.current = [];
    }
  };

  // Helper to add a price line with custom label
  const addPriceLine = (price, title, color, style = LineStyle.Solid, draggableInfo = null) => {
    if (!seriesRef.current) return;
    const priceVal = parseFloat(price);
    if (isNaN(priceVal)) return;

    const line = seriesRef.current.createPriceLine({
      price: priceVal,
      color: color,
      lineWidth: 1,
      lineStyle: style,
      axisLabelVisible: false, // Disable built-in axis label
      title: '', // No title for built-in line
    });
    
    // Create custom HTML label
    let labelElement = null;
    if (labelsContainerRef.current) {
        labelElement = document.createElement('div');
        labelElement.style.position = 'absolute';
        labelElement.style.right = '90px'; // Move further left
        labelElement.style.backgroundColor = color;
        labelElement.style.color = '#fff';
        labelElement.style.padding = '1px 4px';
        labelElement.style.fontSize = '10px';
        labelElement.style.borderRadius = '2px';
        labelElement.style.pointerEvents = 'none'; // Let clicks pass through
        labelElement.style.zIndex = '10';
        labelElement.style.transform = 'translateY(-50%)'; // Center vertically
        labelElement.style.whiteSpace = 'nowrap'; // Prevent wrapping
        labelElement.style.display = 'flex';
        labelElement.style.alignItems = 'center';
        labelElement.style.gap = '4px';

        // Add Buttons for Position Line
        if (draggableInfo && draggableInfo.type === 'POS') {
            const createBtn = (text, type) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.style.pointerEvents = 'auto';
                btn.style.cursor = 'pointer';
                btn.style.border = 'none';
                btn.style.borderRadius = '2px';
                btn.style.padding = '1px 3px';
                btn.style.fontSize = '9px';
                btn.style.fontWeight = 'bold';
                btn.style.color = 'white';
                btn.style.backgroundColor = type === 'TP' ? '#26a69a' : '#ef5350';
                btn.style.lineHeight = '1';
                
                btn.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    // Find existing line or create new one
                    let targetLine = priceLinesRef.current.find(
                        item => item.draggableInfo && item.draggableInfo.type === type && item.draggableInfo.positionId === draggableInfo.positionId
                    );

                    if (!targetLine) {
                        // Create new line starting at current position price
                        const color = type === 'TP' ? '#26a69a' : '#ef5350';
                        // Recursively call addPriceLine to create the line
                        // Note: We pass the same draggableInfo but with the specific type (TP/SL)
                        addPriceLine(priceVal, type, color, LineStyle.Dashed, { type, positionId: draggableInfo.positionId });
                        
                        // The new line is the last one added
                        targetLine = priceLinesRef.current[priceLinesRef.current.length - 1];
                    }

                    if (targetLine) {
                        draggingLineRef.current = targetLine;
                        setDraggingLine(targetLine);
                        
                        // Disable chart scrolling
                        if (chartRef.current) {
                            chartRef.current.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: false });
                            chartRef.current.applyOptions({ handleScroll: false, handleScale: false });
                        }
                    }
                };
                return btn;
            };

            labelElement.appendChild(createBtn('TP', 'TP'));
            labelElement.appendChild(createBtn('SL', 'SL'));
        }

        // Add Title Text
        const textSpan = document.createElement('span');
        textSpan.innerHTML = title;
        labelElement.appendChild(textSpan);

        // Add Close/Cancel Button (X)
        if (draggableInfo) {
            const closeBtn = document.createElement('button');
            closeBtn.innerText = '×';
            closeBtn.style.pointerEvents = 'auto';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.border = 'none';
            closeBtn.style.borderRadius = '2px';
            closeBtn.style.padding = '0px 4px';
            closeBtn.style.fontSize = '12px';
            closeBtn.style.fontWeight = 'bold';
            closeBtn.style.color = 'white';
            closeBtn.style.backgroundColor = 'rgba(0,0,0,0.2)'; // Semi-transparent
            closeBtn.style.marginLeft = '4px';
            closeBtn.style.lineHeight = '1';
            closeBtn.title = draggableInfo.type === 'POS' ? 'Close Position' : 'Cancel';

            closeBtn.onmouseover = () => { closeBtn.style.backgroundColor = 'rgba(0,0,0,0.5)'; };
            closeBtn.onmouseout = () => { closeBtn.style.backgroundColor = 'rgba(0,0,0,0.2)'; };

            closeBtn.onclick = async (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                if (!confirm('Are you sure?')) return;

                try {
                    if (draggableInfo.type === 'POS') {
                        // Close Position: Send Market Order
                        const side = draggableInfo.quantity > 0 ? 'SELL' : 'BUY';
                        const qty = Math.abs(draggableInfo.quantity);
                        
                        const payload = {
                            account_id: user.id,
                            symbol: symbol,
                            side: side,
                            order_type: 'MARKET',
                            quantity: qty,
                            leverage: 20 // Should ideally come from position info
                        };
                        
                        await fetch('/api/orders/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                    } else if (draggableInfo.type === 'ORDER') {
                        // Cancel Order
                        await fetch(`/api/orders/${draggableInfo.orderId}`, {
                            method: 'DELETE'
                        });
                    } else if (draggableInfo.type === 'TP' || draggableInfo.type === 'SL') {
                        // Cancel TP/SL
                        const payload = {};
                        if (draggableInfo.type === 'TP') payload.take_profit_price = null;
                        if (draggableInfo.type === 'SL') payload.stop_loss_price = null;
                        
                        await fetch(`/api/positions/${draggableInfo.positionId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                    }
                    updateOverlayData();
                } catch (err) {
                    console.error("Failed to action", err);
                    alert("Action failed");
                }
            };
            labelElement.appendChild(closeBtn);
        }

        labelsContainerRef.current.appendChild(labelElement);
    }

    // Store line with metadata
    priceLinesRef.current.push({
        line,
        price: priceVal,
        draggableInfo, // { type: 'TP' | 'SL', positionId: number }
        labelElement
    });
  };

  // Fetch Account & Orders Data
  const updateOverlayData = useCallback(async () => {
    if (!user || (draggingLineRef.current)) return; // Don't update if dragging
    
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
              let pnlHtml = '';
              if (pos.unrealized_pnl) {
                  const pnl = parseFloat(pos.unrealized_pnl);
                  const pnlColor = pnl >= 0 ? '#00E676' : '#FF5252'; // Green or Red
                  const sign = pnl >= 0 ? '+' : '';
                  pnlHtml = ` <span style="color: ${pnlColor}; font-weight: bold;">${sign}${pnl.toFixed(2)}</span>`;
              }
              
              addPriceLine(pos.entry_price, `Pos ${pos.quantity}${pnlHtml}`, '#2962FF', LineStyle.Solid, { 
                  type: 'POS', 
                  positionId: pos.id, 
                  quantity: parseFloat(pos.quantity) 
              });
              
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
                   addPriceLine(order.limit_price, `${order.side} ${order.quantity}`, '#FF9800', LineStyle.Dotted, { type: 'ORDER', orderId: order.id });
               }
            }
          });
        }
      }

    } catch (err) {
      console.error("Failed to fetch overlay data", err);
    }
  }, [user, symbol]);

  // Keyboard Shortcuts for Trading
  useEffect(() => {
    const placeOrder = async (side, type) => {
        if (!user) {
            alert("Please login first");
            return;
        }
        
        let price = lastPriceRef.current;
        if (type === 'LIMIT') {
            if (crosshairPriceRef.current) {
                price = crosshairPriceRef.current;
            }
        }

        if (!price) {
            alert("Price data not available yet");
            return;
        }

        try {
            const payload = {
                account_id: user.id,
                symbol: symbol,
                side: side,
                order_type: type,
                quantity: parseFloat(quantity),
                price: type === 'LIMIT' ? price : null,
                leverage: 20 // Default leverage
            };
            
            const res = await fetch('/api/orders/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                console.log(`${type} ${side} order placed successfully`);
                updateOverlayData(); // Refresh lines
            } else {
                const err = await res.json();
                alert(`Order failed: ${err.detail}`);
            }
        } catch (e) {
            console.error("Order error", e);
            alert("Failed to place order");
        }
    };

    const handleKeyDown = (e) => {
        // Shift + B -> Market Buy
        if (e.shiftKey && e.code === 'KeyB' && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            placeOrder('BUY', 'MARKET');
        }
        // Opt + Shift + B -> Limit Buy
        if (e.shiftKey && e.code === 'KeyB' && e.altKey) {
            e.preventDefault();
            placeOrder('BUY', 'LIMIT');
        }
        // Shift + S -> Market Sell
        if (e.shiftKey && e.code === 'KeyS' && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            placeOrder('SELL', 'MARKET');
        }
        // Opt + Shift + S -> Limit Sell
        if (e.shiftKey && e.code === 'KeyS' && e.altKey) {
            e.preventDefault();
            placeOrder('SELL', 'LIMIT');
        }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, symbol, quantity, updateOverlayData]);

  // Handle Dragging Logic (Separate Effect for Event Listeners using Refs)
  useEffect(() => {
      const container = chartContainerRef.current;
      if (!container) return;

      const handleMouseDown = (e) => {
          if (!seriesRef.current || !chartRef.current) return;
          // If already dragging/placing, don't select another line
          if (draggingLineRef.current) return;

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
              // Prevent dragging for Position lines
              if (closestLine.draggableInfo.type === 'POS') return;

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
                  // Label will be updated by syncLabels loop
              }
          } else {
              // Hover effect
              let hovering = false;
              priceLinesRef.current.forEach(item => {
                  if (!item.draggableInfo) return;
                  // Skip hover effect for POS lines
                  if (item.draggableInfo.type === 'POS') return;

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
              const { type, positionId, orderId } = currentDraggingLine.draggableInfo;
              const newPrice = currentDraggingLine.price;
              
              try {
                  if (type === 'TP' || type === 'SL') {
                      const payload = {};
                      if (type === 'TP') payload.take_profit_price = newPrice;
                      if (type === 'SL') payload.stop_loss_price = newPrice;
                      
                      await fetch(`/api/positions/${positionId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload)
                      });
                      console.log(`Updated ${type} for position ${positionId} to ${newPrice}`);
                  } else if (type === 'ORDER') {
                      await fetch(`/api/orders/${orderId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ price: newPrice })
                      });
                      console.log(`Updated Order ${orderId} price to ${newPrice}`);
                  }
              } catch (err) {
                  console.error("Failed to update", err);
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
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      grid: {
        vertLines: { color: '#f0f3fa' },
        horzLines: { color: '#f0f3fa' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        horzLine: {
            labelVisible: true,
        },
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

    // Subscribe to crosshair move to capture mouse price
    chart.subscribeCrosshairMove((param) => {
        if (param.point && seriesRef.current) {
            const price = seriesRef.current.coordinateToPrice(param.point.y);
            crosshairPriceRef.current = price;
        } else {
            crosshairPriceRef.current = null;
        }
    });

    let ws = null;

    const loadData = async (endTime = null) => {
      if (isLoadingRef.current) return;
      if (endTime && !hasMoreRef.current) return;

      isLoadingRef.current = true;

      try {
        setError(null);
        // Use proxy for Binance API to avoid CORS
        let url = `/api/market/klines?symbol=${symbol}&interval=${timeframe}&limit=1000`;
        if (endTime) {
            url += `&endTime=${endTime}`;
        }

        const response = await fetch(url);
        
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
        
        if (cdata.length === 0) {
            if (endTime) hasMoreRef.current = false;
        } else {
            if (endTime) {
                // Prepend data
                // Filter out duplicates based on time
                const existingTimes = new Set(allDataRef.current.map(d => d.time));
                const uniqueNewData = cdata.filter(d => !existingTimes.has(d.time));
                
                if (uniqueNewData.length === 0) {
                    hasMoreRef.current = false;
                } else {
                    allDataRef.current = [...uniqueNewData, ...allDataRef.current];
                }
            } else {
                // Initial load
                allDataRef.current = cdata;
                hasMoreRef.current = true;
            }

            // Check if series is still valid before setting data
            if (seriesRef.current && chartRef.current) {
                seriesRef.current.setData(allDataRef.current);
            }
            
            if (!endTime && cdata.length > 0) {
                lastPriceRef.current = cdata[cdata.length - 1].close;
            }
        }

        // Initial overlay update (only on first load)
        if (!endTime) {
            updateOverlayData();
        }

      } catch (err) {
        console.error("Chart Error:", err);
        setError(err.message);
      } finally {
        isLoadingRef.current = false;
      }
    };

    // Initial load
    loadData();

    // Subscribe to visible logical range change for infinite scrolling
    let scrollTimeout = null;
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (scrollTimeout) return; // Throttle

        scrollTimeout = setTimeout(() => {
            scrollTimeout = null;
            if (range && range.from < 10 && !isLoadingRef.current && hasMoreRef.current) {
                 const firstData = allDataRef.current[0];
                 if (firstData) {
                     // Binance API expects milliseconds for endTime
                     // We want data BEFORE this candle.
                     loadData(firstData.time * 1000 - 1);
                 }
            }
        }, 200); // Check every 200ms
    });

    // WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Use local proxy to avoid CORS/Network issues
    const wsUrl = `${protocol}//${host}/api/market/ws/klines/${symbol}/${timeframe}`;
    
    ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to WS Proxy');
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (!message.k) return;
            
            const kline = message.k;
            const open = parseFloat(kline.o);
            const high = parseFloat(kline.h);
            const low = parseFloat(kline.l);
            const close = parseFloat(kline.c);

            // Filter out invalid prices (0 or NaN) which can happen with fstream
            if (!open || !high || !low || !close || open <= 0 || high <= 0 || low <= 0 || close <= 0) {
                return;
            }

            const candle = {
              time: kline.t / 1000,
              open: open,
              high: high,
              low: low,
              close: close,
            };
            
            lastPriceRef.current = close;
            
            // Check validity before update
            if (seriesRef.current && chartRef.current) {
                newSeries.update(candle);
            }
          } catch (e) {
            console.error("WS Message Error:", e);
          }
        };

        ws.onerror = (err) => {
            // Ignore errors if we are disposing/unmounting
            if (isDisposed) return;
            console.error('WS Error:', err);
        };

    // Poll for overlay updates every 5 seconds
    const overlayInterval = setInterval(updateOverlayData, 5000);

    const handleResize = () => {
        if (chartContainerRef.current) {
            chart.applyOptions({ 
                width: chartContainerRef.current.clientWidth,
                height: chartContainerRef.current.clientHeight
            });
        }
    };
    window.addEventListener('resize', handleResize);

    // Sync labels loop
    let animationFrameId;
    let isDisposed = false; // Flag to track disposal

    const syncLabels = () => {
        if (isDisposed) return; // Stop if disposed

        if (seriesRef.current && priceLinesRef.current.length > 0) {
            priceLinesRef.current.forEach(item => {
                if (item.labelElement) {
                    // Check if series is still valid before accessing
                    try {
                        // Double check chart existence
                        if (!chartRef.current) return;
                        
                        const y = seriesRef.current.priceToCoordinate(item.price);
                        if (y === null) {
                            item.labelElement.style.display = 'none';
                        } else {
                            item.labelElement.style.display = 'flex'; // Changed to flex for buttons
                            item.labelElement.style.top = `${y}px`;
                        }
                    } catch (e) {
                        // Series might be disposed
                    }
                }
            });
        }
        animationFrameId = requestAnimationFrame(syncLabels);
    };
    syncLabels();

    return () => {
      isDisposed = true; // Mark as disposed
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      clearInterval(overlayInterval);
      if (ws) ws.close();
      
      // Clean up chart
      // Important: Remove series first, then chart
      try {
          if (seriesRef.current && chartRef.current) {
             // No need to remove series explicitly if removing chart, but good practice
             // chartRef.current.removeSeries(seriesRef.current);
          }
          if (chartRef.current) {
              chartRef.current.remove();
          }
      } catch (e) {
          console.error("Error removing chart", e);
      }
      
      seriesRef.current = null;
      chartRef.current = null;
      
      // Clear labels
      if (labelsContainerRef.current) {
          labelsContainerRef.current.innerHTML = '';
      }
    };
  }, [symbol, timeframe, user, updateOverlayData]); // Re-run if user changes

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] p-4">
      <div className="mb-4 flex gap-4 flex-shrink-0">
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
        
        <div className="flex border rounded shadow-sm overflow-hidden">
          {['1m', '15m', '1h', '4h', '1d'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-4">
            <span className="text-sm font-medium text-gray-700">Qty:</span>
            <input 
                type="number" 
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="p-2 border rounded shadow-sm w-24"
                step="0.001"
            />
        </div>
      </div>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded flex-shrink-0">
            Error: {error}. Please check your connection or try a different symbol.
        </div>
      )}

      <div className="flex-grow relative border rounded-lg shadow-md overflow-hidden">
        <div 
            ref={chartContainerRef} 
            style={{ height: '100%', width: '100%', backgroundColor: '#eee', cursor: draggingLine ? 'ns-resize' : 'default' }}
        />
        <div ref={labelsContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 10 }} />
      </div>
    </div>
  );
}
