import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CandlestickSeries, LineStyle, CrosshairMode, createSeriesMarkers } from 'lightweight-charts';
import { CountdownPrimitive } from '../plugins/CountdownPrimitive';
import { DrawingsPrimitive } from '../plugins/DrawingsPrimitive';
import { FVGPrimitive } from '../plugins/FVGPrimitive';
import { useAuth } from '../context/AuthContext';
import { Pencil, Square, TrendingUp, ArrowUpCircle, ArrowDownCircle, Trash2, MousePointer2, Settings } from 'lucide-react';

export default function Chart() {
  const { user } = useAuth();
  const chartContainerRef = useRef();
  const seriesRef = useRef(null);
  const markersPrimitiveRef = useRef(null);
  const countdownPrimitiveRef = useRef(null);
  const drawingsPrimitiveRef = useRef(null);
  const fvgPrimitiveRef = useRef(null);
  const priceLinesRef = useRef([]);
  const chartRef = useRef(null);
  const lastPriceRef = useRef(null);
  const crosshairPriceRef = useRef(null);
  const draggingLineRef = useRef(null);
  const labelsContainerRef = useRef(null); // Container for custom HTML labels
  const allDataRef = useRef([]); // Store all loaded data
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  
  // Drawing Tools State
  const [activeTool, setActiveTool] = useState('cursor'); // cursor, line, rect, fib, long, short
  const [drawings, setDrawings] = useState([]);
  const currentDrawingRef = useRef(null);

  // Chart Settings
  const [showSettings, setShowSettings] = useState(false);
  const [showFVG, setShowFVG] = useState(false);
  const [chartOptions, setChartOptions] = useState({
      upColor: '#00C853',
      downColor: '#FF5252',
      wickUpColor: '#00C853',
      wickDownColor: '#FF5252',
      borderVisible: false,
  });

  // Initialize state from localStorage if available
  const [symbol, setSymbol] = useState(() => localStorage.getItem('chart_symbol') || 'BTCUSDT');
  const [timeframe, setTimeframe] = useState(() => localStorage.getItem('chart_timeframe') || '1h');
  const [quantity, setQuantity] = useState(() => {
      const saved = localStorage.getItem('chart_quantity');
      return saved ? parseFloat(saved) : 0.01;
  });
  const [error, setError] = useState(null);
  const [draggingLine, setDraggingLine] = useState(null);
  
  // Real-time Price State
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceColor, setPriceColor] = useState('text-gray-800');

  // Save settings to localStorage whenever they change
  useEffect(() => {
      localStorage.setItem('chart_symbol', symbol);
      localStorage.setItem('chart_timeframe', timeframe);
      localStorage.setItem('chart_quantity', quantity);
  }, [symbol, timeframe, quantity]);

  // Apply Chart Options
  useEffect(() => {
      if (seriesRef.current) {
          seriesRef.current.applyOptions({
              upColor: chartOptions.upColor,
              downColor: chartOptions.downColor,
              wickUpColor: chartOptions.wickUpColor,
              wickDownColor: chartOptions.wickDownColor,
              borderVisible: chartOptions.borderVisible,
          });
      }
  }, [chartOptions]);

  // FVG Calculation
  const calculateFVGs = useCallback((data) => {
      if (!data || data.length < 3) return [];
      const fvgs = [];
      let filledCount = 0;
      
      for (let i = 2; i < data.length; i++) {
          const curr = data[i];
          const prev2 = data[i-2];

          // Bullish FVG: Low[i] > High[i-2]
          if (curr.low > prev2.high) {
              const top = curr.low;
              const bottom = prev2.high;
              
              // Check if filled by SUBSEQUENT candles
              let filled = false;
              for (let j = i + 1; j < data.length; j++) {
                  // Only body can fill FVG
                  const bodyLow = Math.min(data[j].open, data[j].close);
                  if (bodyLow <= bottom) {
                      filled = true;
                      break;
                  }
              }
              
              if (!filled) {
                  fvgs.push({
                      time: prev2.time,
                      top,
                      bottom,
                      type: 'bullish'
                  });
              } else {
                  filledCount++;
              }
          }

          // Bearish FVG: High[i] < Low[i-2]
          if (curr.high < prev2.low) {
              const top = prev2.low;
              const bottom = curr.high;
              
              let filled = false;
              for (let j = i + 1; j < data.length; j++) {
                  // Only body can fill FVG
                  const bodyHigh = Math.max(data[j].open, data[j].close);
                  if (bodyHigh >= top) {
                      filled = true;
                      break;
                  }
              }
              
              if (!filled) {
                  fvgs.push({
                      time: prev2.time,
                      top,
                      bottom,
                      type: 'bearish'
                  });
              } else {
                  filledCount++;
              }
          }
      }
      console.log(`Calculated FVGs: ${fvgs.length} active, ${filledCount} filled`);
      return fvgs;
  }, []);

  // Update FVGs
  const updateFVGs = useCallback(() => {
      if (!fvgPrimitiveRef.current) return;
      
      if (!showFVG) {
          fvgPrimitiveRef.current.setFVGs([]);
          return;
      }

      const fvgs = calculateFVGs(allDataRef.current);
      fvgPrimitiveRef.current.setFVGs(fvgs);
  }, [showFVG, calculateFVGs]);

  // Update FVGs when data changes or toggle changes
  useEffect(() => {
      updateFVGs();
  }, [updateFVGs, showFVG]); // Note: allDataRef is a ref, so it doesn't trigger effect. We need to call updateFVGs manually when data loads.

  // Fetch Drawings from Backend
  const fetchDrawings = useCallback(async () => {
      if (!user) return;
      try {
          const res = await fetch(`/api/drawings/?account_id=${user.id}&symbol=${symbol}`);
          if (res.ok) {
              const data = await res.json();
              const loadedDrawings = data.map(d => ({
                  id: d.id,
                  type: d.type,
                  p1: d.data.p1,
                  p2: d.data.p2
              }));
              setDrawings(loadedDrawings);
              if (drawingsPrimitiveRef.current) {
                  drawingsPrimitiveRef.current.setDrawings(loadedDrawings);
              }
          }
      } catch (err) {
          console.error("Failed to fetch drawings", err);
      }
  }, [user, symbol]);

  useEffect(() => {
      fetchDrawings();
  }, [fetchDrawings]);

  // Save Drawing to Backend
  const saveDrawing = async (drawing) => {
      if (!user) return;
      try {
          const payload = {
              account_id: user.id,
              symbol: symbol,
              type: drawing.type,
              data: { p1: drawing.p1, p2: drawing.p2 }
          };
          const res = await fetch('/api/drawings/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          if (res.ok) {
              const saved = await res.json();
              setDrawings(prev => {
                  return prev.map(d => {
                      if (d === drawing) {
                          return { ...d, id: saved.id };
                      }
                      return d;
                  });
              });
          }
      } catch (err) {
          console.error("Failed to save drawing", err);
      }
  };

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
                        addPriceLine(priceVal, type, color, LineStyle.Solid, { type, positionId: draggableInfo.positionId });
                        
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
                  const slPrice = parseFloat(pos.stop_loss_price);
                  const qty = parseFloat(pos.quantity);
                  const entry = parseFloat(pos.entry_price);
                  const pnl = (slPrice - entry) * qty;
                  const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
                  
                  addPriceLine(pos.stop_loss_price, `SL ${pnlStr}`, '#ef5350', LineStyle.Solid, { type: 'SL', positionId: pos.id });
              }
              if (pos.take_profit_price) {
                  const tpPrice = parseFloat(pos.take_profit_price);
                  const qty = parseFloat(pos.quantity);
                  const entry = parseFloat(pos.entry_price);
                  const pnl = (tpPrice - entry) * qty;
                  const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;

                  addPriceLine(pos.take_profit_price, `TP ${pnlStr}`, '#26a69a', LineStyle.Solid, { type: 'TP', positionId: pos.id });
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
                   addPriceLine(order.limit_price, `${order.side} ${order.quantity}`, '#FF9800', LineStyle.Solid, { type: 'ORDER', orderId: order.id });
               }
            }
          });

          // Add Markers for Filled Orders (History)
          const markers = ordersData
              .filter(o => o.symbol === symbol && o.status === 'FILLED')
              .map(o => {
                  const originalTime = new Date(o.created_at).getTime() / 1000;
                  let interval = 3600; // Default 1h
                  if (timeframe === '1m') interval = 60;
                  else if (timeframe === '15m') interval = 15 * 60;
                  else if (timeframe === '1h') interval = 60 * 60;
                  else if (timeframe === '4h') interval = 4 * 60 * 60;
                  else if (timeframe === '1d') interval = 24 * 60 * 60;
                  
                  // Normalize time to the start of the candle
                  const normalizedTime = Math.floor(originalTime / interval) * interval;

                  return {
                      time: normalizedTime,
                      position: o.side === 'BUY' ? 'belowBar' : 'aboveBar',
                      color: o.side === 'BUY' ? '#2196F3' : '#E91E63',
                      shape: o.side === 'BUY' ? 'arrowUp' : 'arrowDown',
                      text: `${o.quantity} @ ${o.price}`
                  };
              });
           
           // Sort markers by time
           markers.sort((a, b) => a.time - b.time);
           
           if (seriesRef.current) {
               if (!markersPrimitiveRef.current) {
                   markersPrimitiveRef.current = createSeriesMarkers(seriesRef.current, markers);
               } else {
                   markersPrimitiveRef.current.setMarkers(markers);
               }
           }
        }
      }

    } catch (err) {
      console.error("Failed to fetch overlay data", err);
    }
  }, [user, symbol, timeframe]);

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
          
          // Drawing Logic
          if (activeTool !== 'cursor') {
              const rect = container.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              
              const price = seriesRef.current.coordinateToPrice(y);
              const time = chartRef.current.timeScale().coordinateToTime(x);
              
              if (price !== null && time !== null) {
                  if (!currentDrawingRef.current) {
                      // First Click: Start Drawing
                      currentDrawingRef.current = {
                          type: activeTool,
                          p1: { time, price },
                          p2: { time, price } // Initially p2 = p1
                      };
                      // Disable chart scrolling while drawing
                      chartRef.current.applyOptions({ handleScroll: false, handleScale: false });
                  } else {
                      // Second Click: Finish Drawing
                      const newDrawing = {
                          ...currentDrawingRef.current,
                          p2: { time, price }
                      };
                      
                      // Save to Backend
                      saveDrawing(newDrawing);

                      setDrawings(prev => {
                          const updated = [...prev, newDrawing];
                          if (drawingsPrimitiveRef.current) {
                              drawingsPrimitiveRef.current.setDrawings(updated);
                          }
                          return updated;
                      });
                      
                      currentDrawingRef.current = null;
                      setActiveTool('cursor'); // Reset tool
                      
                      // Re-enable chart interactions
                      chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
                  }
              }
              return;
          }

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
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          
          // Drawing Logic
          if (currentDrawingRef.current) {
              const price = seriesRef.current.coordinateToPrice(y);
              const time = chartRef.current.timeScale().coordinateToTime(x);
              
              if (price !== null && time !== null) {
                  currentDrawingRef.current.p2 = { time, price };
                  
                  // Update primitive
                  if (drawingsPrimitiveRef.current) {
                      drawingsPrimitiveRef.current.setDrawings([...drawings, currentDrawingRef.current]);
                  }
              }
              return;
          }

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
              
              if (activeTool !== 'cursor') {
                  container.style.cursor = 'crosshair';
              }
          }
      };

      const handleMouseUp = async () => {
          // Drawing Logic handled in MouseDown (Two Clicks)

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
  }, [updateOverlayData, activeTool, drawings]); // Re-bind when activeTool or drawings change

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let isDisposed = false;

    console.log("Initializing chart...");
    // Clear previous content
    chartContainerRef.current.innerHTML = '';

    // Create Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#f5f5f5' },
        textColor: 'black',
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
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
      upColor: '#00C853',
      downColor: '#000000',
      borderVisible: true,
      borderColor: '#000000',
      wickUpColor: '#000000',
      wickDownColor: '#000000',
    });
    
    seriesRef.current = newSeries;

    // Add Countdown Primitive
    const countdownPrimitive = new CountdownPrimitive({ timeframe });
    newSeries.attachPrimitive(countdownPrimitive);
    countdownPrimitiveRef.current = countdownPrimitive;

    // Add Drawings Primitive
    const drawingsPrimitive = new DrawingsPrimitive();
    newSeries.attachPrimitive(drawingsPrimitive);
    drawingsPrimitiveRef.current = drawingsPrimitive;
    // Restore drawings if any (though state is reset on mount usually, but if we persisted it...)
    drawingsPrimitive.setDrawings(drawings);

    // Add FVG Primitive
    const fvgPrimitive = new FVGPrimitive();
    newSeries.attachPrimitive(fvgPrimitive);
    fvgPrimitiveRef.current = fvgPrimitive;

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
      if (isLoadingRef.current || isDisposed) return;
      if (endTime && !hasMoreRef.current) return;

      console.log(`Loading data... endTime=${endTime}, symbol=${symbol}, timeframe=${timeframe}`);
      isLoadingRef.current = true;

      try {
        setError(null);
        // Use proxy for Binance API to avoid CORS
        let url = `/api/market/klines?symbol=${symbol}&interval=${timeframe}&limit=1000`;
        if (endTime) {
            url += `&endTime=${endTime}`;
        }

        const response = await fetch(url);
        
        if (isDisposed) return; // Check again after await

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (isDisposed) return; // Check again after await

        if (!Array.isArray(data)) {
            throw new Error("Invalid data format");
        }
        
        console.log(`Loaded ${data.length} candles`);

        const cdata = data.map(d => ({
          time: d[0] / 1000,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));

        // Dedup cdata internally
        const uniqueCData = [];
        const seenTimes = new Set();
        for (const item of cdata) {
            if (!seenTimes.has(item.time)) {
                seenTimes.add(item.time);
                uniqueCData.push(item);
            }
        }
        
        if (uniqueCData.length === 0) {
            if (endTime) hasMoreRef.current = false;
        } else {
            if (endTime) {
                // Prepend data
                // Filter out duplicates based on time
                const existingTimes = new Set(allDataRef.current.map(d => d.time));
                const uniqueNewData = uniqueCData.filter(d => !existingTimes.has(d.time));
                
                if (uniqueNewData.length === 0) {
                    hasMoreRef.current = false;
                } else {
                    // Merge and Sort
                    allDataRef.current = [...uniqueNewData, ...allDataRef.current].sort((a, b) => a.time - b.time);
                    
                    // Double check for duplicates after merge (paranoid check)
                    const finalData = [];
                    const finalTimes = new Set();
                    for (const item of allDataRef.current) {
                        if (!finalTimes.has(item.time)) {
                            finalTimes.add(item.time);
                            finalData.push(item);
                        }
                    }
                    allDataRef.current = finalData;
                }
            } else {
                // Initial load
                allDataRef.current = uniqueCData;
                hasMoreRef.current = true;
            }

            // Check if series is still valid before setting data
            if (seriesRef.current && chartRef.current && !isDisposed) {
                seriesRef.current.setData(allDataRef.current);
                // Ensure visible range is set correctly for initial load
                if (!endTime) {
                    chartRef.current.timeScale().fitContent();
                }
            }
            
            if (!endTime && cdata.length > 0) {
                const lastClose = cdata[cdata.length - 1].close;
                lastPriceRef.current = lastClose;
                setCurrentPrice(lastClose);
            }
        }

        // Update FVGs
        updateFVGs();

        // Initial overlay update (only on first load)
        if (!endTime && !isDisposed) {
            updateOverlayData();
        }

      } catch (err) {
        if (isDisposed) return;
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
        if (scrollTimeout || isDisposed) return; // Throttle

        scrollTimeout = setTimeout(() => {
            scrollTimeout = null;
            if (isDisposed) return;
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
    
    let wsTimeout = setTimeout(() => {
        if (isDisposed) return;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to WS Proxy');
        };

        ws.onmessage = (event) => {
          if (isDisposed) return;
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
            
            // Update Price Display
            if (lastPriceRef.current) {
                if (close > lastPriceRef.current) {
                    setPriceColor('text-green-600');
                } else if (close < lastPriceRef.current) {
                    setPriceColor('text-red-600');
                }
            }
            setCurrentPrice(close);
            lastPriceRef.current = close;
            
            // Check validity before update
            if (seriesRef.current && chartRef.current && !isDisposed) {
                newSeries.update(candle);
                
                // Update internal data for FVG calculation
                // We need to update the last candle in allDataRef or append if new
                const lastData = allDataRef.current[allDataRef.current.length - 1];
                if (lastData && lastData.time === candle.time) {
                    allDataRef.current[allDataRef.current.length - 1] = candle;
                } else {
                    allDataRef.current.push(candle);
                }
                
                // Throttle FVG updates? Or just update.
                // For now, update every time.
                updateFVGs();
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
    }, 100); // Delay WS connection slightly

    // Poll for overlay updates every 5 seconds
    const overlayInterval = setInterval(updateOverlayData, 5000);

    const handleResize = () => {
        if (isDisposed) return;
        if (chartContainerRef.current && chartRef.current) {
            try {
                chartRef.current.applyOptions({ 
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            } catch (e) {
                // Ignore resize errors during disposal
            }
        }
    };
    window.addEventListener('resize', handleResize);

    // Sync labels loop
    let animationFrameId;

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
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (wsTimeout) clearTimeout(wsTimeout);
      
      if (ws) {
          // Avoid "WebSocket is closed before the connection is established" if possible
          if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
              ws.close();
          }
      }
      
      // Clean up chart
      // Important: Remove series first, then chart
      try {
          if (seriesRef.current) {
              if (countdownPrimitiveRef.current) {
                  seriesRef.current.detachPrimitive(countdownPrimitiveRef.current);
              }
              if (markersPrimitiveRef.current) {
                  // markersPrimitiveRef.current is the primitive instance
                  seriesRef.current.detachPrimitive(markersPrimitiveRef.current);
              }
              if (drawingsPrimitiveRef.current) {
                  seriesRef.current.detachPrimitive(drawingsPrimitiveRef.current);
              }
          }

          if (chart) {
              chart.remove();
          }
      } catch (e) {
          console.error("Error removing chart", e);
      }
      
      seriesRef.current = null;
      markersPrimitiveRef.current = null;
      countdownPrimitiveRef.current = null;
      drawingsPrimitiveRef.current = null;
      chartRef.current = null;
      
      // Reset loading state to allow new fetches on remount
      isLoadingRef.current = false;
      
      // Clear labels
      if (labelsContainerRef.current) {
          labelsContainerRef.current.innerHTML = '';
      }
    };
  }, [symbol, timeframe, user, updateOverlayData]); // Re-run if user changes

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] p-4">
      <div className="mb-4 flex justify-between items-center flex-shrink-0">
        {/* Left Side: Price & Timeframes */}
        <div className="flex items-center gap-6">
            <div className={`text-2xl font-bold font-mono ${priceColor} min-w-[120px]`}>
                {currentPrice ? currentPrice.toFixed(2) : '---'}
            </div>

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
        </div>

        {/* Right Side: Symbols, Qty, Tools */}
        <div className="flex items-center gap-4">
            {/* Symbol Buttons */}
            <div className="flex border rounded shadow-sm overflow-hidden">
                {['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'].map((sym) => (
                    <button
                        key={sym}
                        onClick={() => setSymbol(sym)}
                        className={`px-3 py-2 text-sm font-medium transition-colors ${
                            symbol === sym
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        {sym}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Qty:</span>
                <input 
                    type="number" 
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="p-2 border rounded shadow-sm w-24"
                    step="0.001"
                />
            </div>

            {/* Drawing Tools Toolbar */}
            <div className="flex border rounded shadow-sm overflow-hidden bg-white">
                <button 
                    onClick={() => setActiveTool('cursor')}
                    className={`p-2 ${activeTool === 'cursor' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                    title="Cursor"
                >
                    <MousePointer2 size={18} />
                </button>
                <button 
                    onClick={() => setActiveTool('line')}
                    className={`p-2 ${activeTool === 'line' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                    title="Trend Line"
                >
                    <Pencil size={18} />
                </button>
                <button 
                    onClick={() => setActiveTool('rect')}
                    className={`p-2 ${activeTool === 'rect' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                    title="Rectangle"
                >
                    <Square size={18} />
                </button>
                <button 
                    onClick={() => setActiveTool('fib')}
                    className={`p-2 ${activeTool === 'fib' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                    title="Fibonacci Retracement"
                >
                    <TrendingUp size={18} />
                </button>
                <button 
                    onClick={() => setActiveTool('long')}
                    className={`p-2 ${activeTool === 'long' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                    title="Long Position"
                >
                    <ArrowUpCircle size={18} />
                </button>
                <button 
                    onClick={() => setActiveTool('short')}
                    className={`p-2 ${activeTool === 'short' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                    title="Short Position"
                >
                    <ArrowDownCircle size={18} />
                </button>
                <button 
                    onClick={() => {
                        setDrawings([]);
                        if (drawingsPrimitiveRef.current) {
                            drawingsPrimitiveRef.current.setDrawings([]);
                        }
                    }}
                    className="p-2 text-red-600 hover:bg-red-50"
                    title="Clear All Drawings"
                >
                    <Trash2 size={18} />
                </button>
                <button 
                    onClick={() => setShowSettings(true)}
                    className="p-2 text-gray-600 hover:bg-gray-50"
                    title="Chart Settings"
                >
                    <Settings size={18} />
                </button>
            </div>
        </div>
      </div>
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-80">
                <h3 className="text-lg font-bold mb-4">Chart Settings</h3>
                
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Show FVG</label>
                        <input 
                            type="checkbox" 
                            checked={showFVG} 
                            onChange={(e) => setShowFVG(e.target.checked)}
                            className="h-4 w-4"
                        />
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="text-sm font-semibold mb-2">Colors</h4>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Up Color</label>
                                <input 
                                    type="color" 
                                    value={chartOptions.upColor}
                                    onChange={(e) => setChartOptions({...chartOptions, upColor: e.target.value})}
                                    className="w-full h-8 p-0 border-0"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Down Color</label>
                                <input 
                                    type="color" 
                                    value={chartOptions.downColor}
                                    onChange={(e) => setChartOptions({...chartOptions, downColor: e.target.value})}
                                    className="w-full h-8 p-0 border-0"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Wick Up</label>
                                <input 
                                    type="color" 
                                    value={chartOptions.wickUpColor}
                                    onChange={(e) => setChartOptions({...chartOptions, wickUpColor: e.target.value})}
                                    className="w-full h-8 p-0 border-0"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Wick Down</label>
                                <input 
                                    type="color" 
                                    value={chartOptions.wickDownColor}
                                    onChange={(e) => setChartOptions({...chartOptions, wickDownColor: e.target.value})}
                                    className="w-full h-8 p-0 border-0"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={() => setShowSettings(false)}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}

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
