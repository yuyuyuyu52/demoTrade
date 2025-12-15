import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CandlestickSeries, LineStyle, CrosshairMode, createSeriesMarkers } from 'lightweight-charts';
import { CountdownPrimitive } from '../plugins/CountdownPrimitive';
import { DrawingsPrimitive } from '../plugins/DrawingsPrimitive';
import { FVGPrimitive } from '../plugins/FVGPrimitive';
import { useAuth } from '../context/AuthContext';
import { Pencil, Square, TrendingUp, ArrowUpCircle, ArrowDownCircle, Trash2, MousePointer2, Settings } from 'lucide-react';

import { TIMEZONE, timeframeToSeconds, toNySeconds, toChartSeconds, toUTCSeconds } from '../utils/time';


export default function Chart({
    chartId = 'default',
    isActive = true,
    onActivate = () => { },
    // Controlled Props
    symbol = 'BTCUSDT',
    timeframe = '1h',
    quantity = 0.01,
    activeTool = 'cursor',
    // Signals
    clearDrawingsTimestamp = 0,
    showSettingsTimestamp = 0,
    // Callbacks
    onPriceChange = () => { },
    onToolChange = () => { },

    // Shared Settings (Controlled from Parent)
    timezone = TIMEZONE,
    showFVG = false,
    chartOptions = {
        upColor: '#00C853',
        downColor: '#FF5252',
        wickUpColor: '#00C853',
        wickDownColor: '#FF5252',
        borderVisible: false,
        borderColor: '#000000',
    },
    onSettingsChange = () => { }
}) {
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
    const lastViewStateRef = useRef(null); // Store visible range/zoom to restore on next load

    // Drawing Tools State (activeTool is prop)
    const [drawings, setDrawings] = useState([]);
    const drawingsRef = useRef([]); // Ref to keep track of latest drawings for event handlers
    const [selectedDrawingId, setSelectedDrawingId] = useState(null);
    const selectedDrawingIdRef = useRef(null); // Ref for selected ID
    const currentDrawingRef = useRef(null);
    const dragStateRef = useRef(null);
    const isMagnetActiveRef = useRef(false);
    const filledOrdersRef = useRef([]); // Store filled orders for click interaction

    // Signal refs
    const prevClearDrawingsRef = useRef(clearDrawingsTimestamp);
    const prevShowSettingsRef = useRef(showSettingsTimestamp);

    // Sync refs with state
    useEffect(() => {
        drawingsRef.current = drawings;
    }, [drawings]);

    useEffect(() => {
        selectedDrawingIdRef.current = selectedDrawingId;
    }, [selectedDrawingId]);

    const [showSettings, setShowSettings] = useState(false);
    const [notification, setNotification] = useState(null); // { text, type: 'success'|'error' }

    // Auto-dismiss notification
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // Handle signals from parent
    useEffect(() => {
        if (clearDrawingsTimestamp > prevClearDrawingsRef.current) {
            // Delete all drawings
            (async () => {
                const drawingsToDelete = drawingsRef.current.filter(d => !String(d.id).startsWith('temp_'));
                await Promise.all(drawingsToDelete.map(d => deleteDrawing(d.id)));
                drawingsRef.current = [];
                setDrawings([]);
                setSelectedDrawingId(null);
                selectedDrawingIdRef.current = null;
                if (drawingsPrimitiveRef.current) {
                    drawingsPrimitiveRef.current.setDrawings([]);
                    drawingsPrimitiveRef.current.setSelectedId(null);
                }
            })();
            prevClearDrawingsRef.current = clearDrawingsTimestamp;
        }
    }, [clearDrawingsTimestamp]);

    useEffect(() => {
        if (showSettingsTimestamp > prevShowSettingsRef.current) {
            setShowSettings(true);
            prevShowSettingsRef.current = showSettingsTimestamp;
        }
    }, [showSettingsTimestamp]);

    // Chart Settings
    // Props are used directly: showFVG, timezone, chartOptions
    const showFVGRef = useRef(showFVG); // Init with prop
    const isChartReadyRef = useRef(false); // Track if initial data is loaded

    const [error, setError] = useState(null);
    const [draggingLine, setDraggingLine] = useState(null);

    // Real-time Price State
    const [currentPrice, setCurrentPrice] = useState(null);
    const [priceColor, setPriceColor] = useState('text-gray-800');

    // Report price back to parent
    useEffect(() => {
        onPriceChange(currentPrice, priceColor);
    }, [currentPrice, priceColor, onPriceChange]);

    // Apply Chart Options (Colors)
    useEffect(() => {
        if (seriesRef.current) {
            seriesRef.current.applyOptions({
                upColor: chartOptions.upColor,
                downColor: chartOptions.downColor,
                wickUpColor: chartOptions.wickUpColor,
                wickDownColor: chartOptions.wickDownColor,
                borderVisible: chartOptions.borderVisible,
                borderColor: chartOptions.borderColor,
                lastValueVisible: false, // Hide default label, replaced by CountdownPrimitive
            });

            // Update CountdownPrimitive colors
            if (countdownPrimitiveRef.current && countdownPrimitiveRef.current.updateOptions) {
                countdownPrimitiveRef.current.updateOptions({
                    colors: { up: chartOptions.upColor, down: chartOptions.downColor }
                });
            }
        }
    }, [chartOptions]);



    // Fetch Settings from Backend
    // FVG Calculation
    const calculateFVGs = useCallback((data) => {
        if (!data || data.length < 3) return [];
        const fvgs = [];
        let filledCount = 0;

        for (let i = 2; i < data.length; i++) {
            const curr = data[i];
            const prev2 = data[i - 2];

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

    // Fetching and Saving Settings is now handled by Parent (MultiChart)
    // Removed local fetch/save effects.

    // Sync showFVG to ref
    useEffect(() => {
        showFVGRef.current = showFVG;
    }, [showFVG]);

    // Update FVGs
    const updateFVGs = useCallback(() => {
        if (!fvgPrimitiveRef.current) return;

        // Use ref to get latest state, avoiding closure staleness in WS callbacks
        if (!showFVGRef.current) {
            fvgPrimitiveRef.current.setFVGs([]);
            return;
        }

        const fvgs = calculateFVGs(allDataRef.current);
        fvgPrimitiveRef.current.setFVGs(fvgs);
    }, [calculateFVGs]); // Removed showFVG dependency to keep function reference stable for WS

    // Update FVGs when toggle changes
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
                    p1: { ...d.data.p1, time: toChartSeconds(d.data.p1.time * 1000, timezone) },
                    p2: { ...d.data.p2, time: toChartSeconds(d.data.p2.time * 1000, timezone) },
                    p3: d.data.p3 ? { ...d.data.p3, time: toChartSeconds(d.data.p3.time * 1000, timezone) } : undefined
                }));
                setDrawings(loadedDrawings);
                if (drawingsPrimitiveRef.current) {
                    drawingsPrimitiveRef.current.setDrawings(loadedDrawings);
                }
            }
        } catch (err) {
            console.error("Failed to fetch drawings", err);
        }
    }, [user, symbol, timezone]);

    useEffect(() => {
        fetchDrawings();
    }, [fetchDrawings]);

    // Save Drawing to Backend
    const saveDrawing = async (drawing) => {
        if (!user) return;
        try {
            const convertPoint = (p) => ({ ...p, time: toUTCSeconds(p.time, timezone) });
            const payload = {
                account_id: user.id,
                symbol: symbol,
                type: drawing.type,
                data: {
                    p1: convertPoint(drawing.p1),
                    p2: convertPoint(drawing.p2),
                    p3: drawing.p3 ? convertPoint(drawing.p3) : undefined
                }
            };
            const res = await fetch('/api/drawings/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const saved = await res.json();
                const tempId = drawing.id;

                console.log('DEBUG: Replacing temp ID', tempId, 'with real ID', saved.id);

                // Replace temp ID with real ID from backend
                const updatedDrawings = drawingsRef.current.map(d => {
                    if (d.id === tempId) {
                        return { ...d, id: saved.id };
                    }
                    return d;
                });
                drawingsRef.current = updatedDrawings;
                setDrawings(updatedDrawings);

                if (drawingsPrimitiveRef.current) {
                    drawingsPrimitiveRef.current.setDrawings(updatedDrawings);
                }

                // Update selected ID if this drawing was selected
                if (selectedDrawingIdRef.current === tempId) {
                    console.log('DEBUG: Updating selectedId from', tempId, 'to', saved.id);
                    selectedDrawingIdRef.current = saved.id;
                    setSelectedDrawingId(saved.id);
                    if (drawingsPrimitiveRef.current) {
                        drawingsPrimitiveRef.current.setSelectedId(saved.id);
                    }
                }
            }
        } catch (err) {
            console.error("Failed to save drawing", err);
        }
    };

    const updateDrawing = async (drawing) => {
        if (!user || !drawing.id) return;
        // Skip API call if it's a temp ID (not saved yet)
        if (String(drawing.id).startsWith('temp_')) return;

        try {
            const convertPoint = (p) => ({ ...p, time: toUTCSeconds(p.time, timezone) });
            const payload = {
                data: {
                    p1: convertPoint(drawing.p1),
                    p2: convertPoint(drawing.p2),
                    p3: drawing.p3 ? convertPoint(drawing.p3) : undefined
                }
            };
            await fetch(`/api/drawings/${drawing.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error("Failed to update drawing", err);
        }
    };

    const deleteDrawing = async (id) => {
        if (!user || !id) return;
        // Skip API call if it's a temp ID (not saved yet)
        if (String(id).startsWith('temp_')) return;

        try {
            await fetch(`/api/drawings/${id}`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.error("Failed to delete drawing", err);
        }
    };

    const pointToLineDistance = (x, y, x1, y1, x2, y2) => {
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const getCoordinate = (time, price) => {
        if (!chartRef.current || !seriesRef.current) return null;
        if (time === null || time === undefined) return null;

        const timeScale = chartRef.current.timeScale();
        let x = null;

        // 1. Try direct conversion
        try {
            x = timeScale.timeToCoordinate(time);
        } catch (e) {
            x = null;
        }

        // 2. Extrapolate if null (e.g. future time)
        if (x === null && allDataRef.current && allDataRef.current.length >= 2) {
            try {
                const data = allDataRef.current;
                const lastBar = data[data.length - 1];
                const lastTime = Number(lastBar.time);
                const tTime = Number(time);

                if (tTime > lastTime) {
                    // FIX: Snap to last bar if within its interval (e.g. current week in 1w)
                    const tfSeconds = timeframeToSeconds(timeframe);
                    if (tTime < lastTime + tfSeconds) {
                        x = timeScale.timeToCoordinate(lastBar.time);
                    } else {
                        const prevBar = data[data.length - 2];
                        const prevTime = Number(prevBar.time);
                        const interval = lastTime - prevTime;

                        if (interval > 0) {
                            const diffBars = (tTime - lastTime) / interval;

                            const lastBarCoord = timeScale.timeToCoordinate(lastBar.time);
                            if (lastBarCoord !== null) {
                                const lastBarLogical = timeScale.coordinateToLogical(lastBarCoord);
                                if (lastBarLogical !== null) {
                                    const targetLogical = lastBarLogical + diffBars;
                                    const targetCoord = timeScale.logicalToCoordinate(targetLogical);
                                    if (targetCoord !== null) {
                                        x = targetCoord;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Time is in the past but timeToCoordinate failed (maybe zoomed in/out or not exact bar)

                    // FIX: Try to find containing bar first (consistent with DrawingsPrimitive)
                    let left = 0;
                    let right = data.length - 1;
                    let floorIndex = -1;

                    while (left <= right) {
                        const mid = Math.floor((left + right) / 2);
                        if (data[mid].time === tTime) {
                            x = timeScale.timeToCoordinate(data[mid].time);
                            break;
                        }
                        if (data[mid].time < tTime) {
                            floorIndex = mid;
                            left = mid + 1;
                        } else {
                            right = mid - 1;
                        }
                    }

                    if (x === null && floorIndex !== -1) {
                        const floorBar = data[floorIndex];
                        const tfSeconds = timeframeToSeconds(timeframe);
                        if (tTime < floorBar.time + tfSeconds) {
                            x = timeScale.timeToCoordinate(floorBar.time);
                        }
                    }

                    // Fallback to closest if still null (e.g. in a gap)
                    if (x === null) {
                        // Binary search for closest
                        left = 0;
                        right = data.length - 1;
                        let closest = data[0];
                        let minDiff = Math.abs(data[0].time - tTime);

                        while (left <= right) {
                            const mid = Math.floor((left + right) / 2);
                            const item = data[mid];
                            const diff = Math.abs(item.time - tTime);

                            if (diff < minDiff) {
                                minDiff = diff;
                                closest = item;
                            }

                            if (item.time < tTime) {
                                left = mid + 1;
                            } else if (item.time > tTime) {
                                right = mid - 1;
                            } else {
                                closest = item;
                                break;
                            }
                        }
                        x = timeScale.timeToCoordinate(closest.time);
                    }
                }
            } catch (e) {
                console.error("Error extrapolating coordinate", e);
            }
        }

        const y = seriesRef.current.priceToCoordinate(price);
        if (x === null || y === null) return null;
        return { x, y };
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

            // Add Buttons for Position Line OR Order Line
            if (draggableInfo && (draggableInfo.type === 'POS' || draggableInfo.type === 'ORDER')) {
                const createBtn = (text, typeName) => {
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
                    btn.style.backgroundColor = typeName.includes('TP') ? '#26a69a' : '#ef5350';
                    btn.style.lineHeight = '1';

                    btn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        // Determine types based on parent (POS or ORDER)
                        const isOrder = draggableInfo.type === 'ORDER';
                        const targetType = isOrder ? (typeName === 'TP' ? 'ORDER_TP' : 'ORDER_SL') : typeName;
                        const targetIdKey = isOrder ? 'orderId' : 'positionId';
                        const targetIdVal = isOrder ? draggableInfo.orderId : draggableInfo.positionId;

                        // Find existing line
                        let targetLine = priceLinesRef.current.find(
                            item => item.draggableInfo && item.draggableInfo.type === targetType && item.draggableInfo[targetIdKey] === targetIdVal
                        );

                        if (!targetLine) {
                            // Create new line starting at current price + offset? or just same price
                            // Let's spawn it slightly offset so user sees it
                            const priceOffset = priceVal * (typeName === 'TP' ? 0.01 : -0.01); // 1% offset?
                            // Actually better to spawn at same price or mouse y? 
                            // Spawn at priceVal so it starts "on top" and they drag it out immediately

                            const color = typeName.includes('TP') ? '#26a69a' : '#ef5350';

                            addPriceLine(priceVal, typeName, color, isOrder ? LineStyle.Dashed : LineStyle.Solid, {
                                type: targetType,
                                [targetIdKey]: targetIdVal
                            });

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

                    // One-click action (No browser confirm)
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
                                leverage: 20
                            };

                            const res = await fetch('/api/orders/', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });

                            if (res.ok) {
                                setNotification({ text: "Position Closed", type: 'success' });
                            } else {
                                const err = await res.json();
                                setNotification({ text: `Failed to close: ${err.detail}`, type: 'error' });
                            }

                        } else if (draggableInfo.type === 'ORDER') {
                            // Cancel Order
                            const res = await fetch(`/api/orders/${draggableInfo.orderId}`, {
                                method: 'DELETE'
                            });
                            if (res.ok) {
                                setNotification({ text: "Order Cancelled", type: 'success' });
                            } else {
                                setNotification({ text: "Failed to cancel order", type: 'error' });
                            }

                        } else if (draggableInfo.type === 'TP' || draggableInfo.type === 'SL') {
                            // Cancel TP/SL
                            const payload = {};
                            if (draggableInfo.type === 'TP') payload.take_profit_price = null;
                            if (draggableInfo.type === 'SL') payload.stop_loss_price = null;

                            const res = await fetch(`/api/positions/${draggableInfo.positionId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });

                            if (res.ok) {
                                setNotification({ text: `${draggableInfo.type} Removed`, type: 'success' });
                            } else {
                                setNotification({ text: "Failed to update position", type: 'error' });
                            }
                        }
                        updateOverlayData();
                        // Retry update after a delay to catch backend processing lag
                        setTimeout(() => updateOverlayData(), 1000);
                    } catch (err) {
                        console.error("Failed to action", err);
                        setNotification({ text: "Action failed", type: 'error' });
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
            // Fetch both Account (Positions) and Orders in parallel to minimize waiting time
            const [accRes, ordersRes] = await Promise.all([
                fetch(`/api/accounts/${user.id}`),
                fetch(`/api/orders/?account_id=${user.id}`)
            ]);

            let accData = null;
            let ordersData = null;

            if (accRes.ok) {
                accData = await accRes.json();
            }
            if (ordersRes.ok) {
                ordersData = await ordersRes.json();
            }

            // Check if chart is still mounted/valid
            if (!seriesRef.current) return;

            // Clear existing lines ONCE, right before we are ready to add new ones
            clearPriceLines();

            // 1. Process Positions
            if (accData && accData.positions && Array.isArray(accData.positions)) {
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

            // 2. Process Orders
            if (ordersData && Array.isArray(ordersData)) {
                ordersData.forEach(order => {
                    if (order.symbol === symbol && order.status === 'NEW') {
                        // Limit Order Price
                        if (order.limit_price) {
                            addPriceLine(order.limit_price, `${order.side} ${order.quantity}`, '#FF9800', LineStyle.Solid, { type: 'ORDER', orderId: order.id });

                            // Limit Order TP/SL Lines
                            if (order.take_profit_price) {
                                const tp = parseFloat(order.take_profit_price);
                                const entry = parseFloat(order.limit_price);
                                const qty = parseFloat(order.quantity);
                                const isBuy = order.side === 'BUY';
                                const pnl = (tp - entry) * qty * (isBuy ? 1 : -1);
                                const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;

                                addPriceLine(tp, `TP (Order) ${pnlStr}`, '#26a69a', LineStyle.Dashed, {
                                    type: 'ORDER_TP',
                                    orderId: order.id
                                });
                            }

                            if (order.stop_loss_price) {
                                const sl = parseFloat(order.stop_loss_price);
                                const entry = parseFloat(order.limit_price);
                                const qty = parseFloat(order.quantity);
                                const isBuy = order.side === 'BUY';
                                const pnl = (sl - entry) * qty * (isBuy ? 1 : -1);
                                const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;

                                addPriceLine(sl, `SL (Order) ${pnlStr}`, '#ef5350', LineStyle.Dashed, {
                                    type: 'ORDER_SL',
                                    orderId: order.id
                                });
                            }
                        }
                    }
                });

                // Add Markers for Filled Orders (History)
                const rawMarkers = ordersData
                    .filter(o => o.symbol === symbol && o.status === 'FILLED')
                    .map(o => {
                        // Use updated_at for FILLED orders
                        const tradeTimeMs = new Date(o.updated_at).getTime();
                        const intervalSeconds = timeframeToSeconds(timeframe);
                        const intervalMs = intervalSeconds * 1000;

                        // Normalize time to the start of the candle in UTC first
                        const normalizedMs = Math.floor(tradeTimeMs / intervalMs) * intervalMs;

                        // Then convert to Chart Seconds (shifted)
                        const normalizedTime = toChartSeconds(normalizedMs, timezone);

                        return {
                            ...o,
                            normalizedTime,
                            originalPrice: parseFloat(o.price)
                        };
                    });

                // Aggregate markers by Time and Side
                const aggregatedMarkersMap = new Map();

                rawMarkers.forEach(o => {
                    const key = `${o.normalizedTime}_${o.side}`;
                    if (!aggregatedMarkersMap.has(key)) {
                        aggregatedMarkersMap.set(key, {
                            time: o.normalizedTime,
                            side: o.side,
                            quantitySum: 0, // Use integer math or high precision if possible, but simplest is multiplied
                            prices: [],
                            count: 0,
                            id: o.id // Use first ID as representative
                        });
                    }
                    const entry = aggregatedMarkersMap.get(key);
                    // Add with multiplier to avoid float dust
                    // Assuming max 8 decimals for crypto
                    const qty = parseFloat(o.quantity);
                    entry.quantitySum += Math.round(qty * 100000000);
                    entry.prices.push(o.originalPrice);
                    entry.count += 1;
                });

                const markers = Array.from(aggregatedMarkersMap.values()).map(m => {
                    const avgPrice = m.prices.reduce((a, b) => a + b, 0) / m.count;
                    // Restore aggregated quantity
                    const totalQty = m.quantitySum / 100000000;

                    return {
                        time: m.time,
                        position: m.side === 'BUY' ? 'belowBar' : 'aboveBar',
                        color: m.side === 'BUY' ? '#2196F3' : '#E91E63',
                        shape: m.side === 'BUY' ? 'arrowUp' : 'arrowDown',
                        text: '', // Text handled by price line on click
                        originalPrice: avgPrice,
                        side: m.side,
                        quantity: totalQty, // Clean number
                        id: m.id
                    };
                });

                // Store markers in ref for click detection
                filledOrdersRef.current = markers;

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

        } catch (err) {
            console.error("Failed to fetch overlay data", err);
        }
    }, [user, symbol, timeframe, timezone]);

    // Handle Delete Key for Drawings
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isActive) return; // Only handle for active chart
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
                const drawing = drawings.find(d => d.id === selectedDrawingId);
                if (drawing) {
                    deleteDrawing(drawing.id);
                    setDrawings(prev => {
                        const updated = prev.filter(d => d.id !== selectedDrawingId);
                        if (drawingsPrimitiveRef.current) {
                            drawingsPrimitiveRef.current.setDrawings(updated);
                        }
                        return updated;
                    });
                    setSelectedDrawingId(null);
                    if (drawingsPrimitiveRef.current) {
                        drawingsPrimitiveRef.current.setSelectedId(null);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedDrawingId, drawings, isActive]);

    // Keyboard Shortcuts for Trading
    useEffect(() => {
        const placeOrder = async (side, type) => {
            if (!user) {
                setNotification({ text: "Please login first", type: 'error' });
                return;
            }

            let price = lastPriceRef.current;
            if (type === 'LIMIT') {
                if (crosshairPriceRef.current) {
                    price = crosshairPriceRef.current;
                }
            }

            if (!price) {
                setNotification({ text: "Price data not available yet", type: 'error' });
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
                    setNotification({ text: `${side} Order Placed`, type: 'success' });
                    updateOverlayData(); // Refresh lines
                    setTimeout(() => updateOverlayData(), 500);
                } else {
                    const err = await res.json();
                    setNotification({ text: `Order failed: ${err.detail}`, type: 'error' });
                }
            } catch (e) {
                console.error("Order error", e);
                setNotification({ text: "Failed to place order", type: 'error' });
            }
        };

        const handleKeyDown = (e) => {
            if (!isActive) return; // Only handle for active chart

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
    }, [user, symbol, quantity, updateOverlayData, isActive]);

    // Handle Dragging Logic (Separate Effect for Event Listeners using Refs)
    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container) return;

        // Helper to get time from coordinate (handling future/whitespace)
        const getTimeFromCoordinate = (x) => {
            if (!chartRef.current || !seriesRef.current) return null;
            const timeScale = chartRef.current.timeScale();

            // 1. Try direct conversion
            const time = timeScale.coordinateToTime(x);
            if (time !== null) return time;

            // 2. Extrapolate for future time
            const logical = timeScale.coordinateToLogical(x);
            if (logical === null) return null;

            const data = seriesRef.current.data();
            if (!data || data.length < 2) return null;

            const lastBar = data[data.length - 1];
            const prevBar = data[data.length - 2];

            const lastTime = Number(lastBar.time);
            const prevTime = Number(prevBar.time);
            const interval = lastTime - prevTime;

            if (interval <= 0) return null;

            const lastBarCoord = timeScale.timeToCoordinate(lastBar.time);
            if (lastBarCoord === null) return null;

            const lastBarLogical = timeScale.coordinateToLogical(lastBarCoord);
            if (lastBarLogical === null) return null;

            const diff = logical - lastBarLogical;
            return lastTime + (diff * interval);
        };

        // Helper to get nearest OHLC data when Command/Ctrl is held
        const getMagnetData = (time, price, useSnap) => {
            if (!allDataRef.current || allDataRef.current.length === 0) {
                return { time, price };
            }

            // If not snapping, just return original
            if (!useSnap) return { time, price };

            // Find the candle at or near this time
            const data = allDataRef.current;
            let closestCandle = null;

            // Binary search for efficiency
            let left = 0;
            let right = data.length - 1;

            // First find closest by index/time
            // Since data is sorted by time
            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const item = data[mid];

                if (item.time === time) {
                    closestCandle = item;
                    break;
                }

                if (item.time < time) {
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }

            if (!closestCandle) {
                // If exact match not found, look around 'right' (insertion point)
                // 'left' is at the first element > time or data.length
                // Candidates are data[left-1] and data[left]
                const c1 = data[left - 1];
                const c2 = data[left];

                if (c1 && c2) {
                    if (Math.abs(c1.time - time) < Math.abs(c2.time - time)) closestCandle = c1;
                    else closestCandle = c2;
                } else if (c1) {
                    closestCandle = c1;
                } else if (c2) {
                    closestCandle = c2;
                }
            }

            if (!closestCandle) return { time, price };

            // Find closest OHLC value
            const ohlc = [
                closestCandle.open,
                closestCandle.high,
                closestCandle.low,
                closestCandle.close
            ];

            let closestPrice = ohlc[0];
            let minPriceDiff = Math.abs(price - ohlc[0]);

            for (const p of ohlc) {
                const diff = Math.abs(price - p);
                if (diff < minPriceDiff) {
                    minPriceDiff = diff;
                    closestPrice = p;
                }
            }

            return { time: closestCandle.time, price: closestPrice };
        };

        const handleMouseDown = (e) => {
            if (!seriesRef.current || !chartRef.current) return;

            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Drawing Logic
            if (activeTool !== 'cursor') {
                let price = seriesRef.current.coordinateToPrice(mouseY);
                let time = getTimeFromCoordinate(mouseX);

                if (price !== null && time !== null) {
                    // Apply OHLC snap if Command/Ctrl is held
                    const magnet = getMagnetData(time, price, e.metaKey || e.ctrlKey);
                    time = magnet.time;
                    price = magnet.price;

                    if (!currentDrawingRef.current) {
                        // Special Case: Long/Short Tools (Single Click Creation)
                        if (activeTool === 'long' || activeTool === 'short') {
                            const tempId = `temp_${Date.now()}_${Math.random()}`;

                            // Calculate default Width (Time)
                            // Use ~60px width or ~5 candles
                            let endTime = getTimeFromCoordinate(mouseX + 50);
                            if (endTime === null) endTime = time; // Fallback

                            // Calculate default SL/TP (Price)
                            const pricePx = seriesRef.current.priceToCoordinate(price);
                            let slPrice, tpPrice;

                            if (activeTool === 'long') {
                                const slPx = pricePx + 40; // 40px down
                                const tpPx = pricePx - 80; // 80px up
                                slPrice = seriesRef.current.coordinateToPrice(slPx);
                                tpPrice = seriesRef.current.coordinateToPrice(tpPx);
                            } else {
                                const slPx = pricePx - 40; // 40px up
                                const tpPx = pricePx + 80; // 80px down
                                slPrice = seriesRef.current.coordinateToPrice(slPx);
                                tpPrice = seriesRef.current.coordinateToPrice(tpPx);
                            }

                            // Fallback if price conversion excluded (e.g. out of view)
                            // Use 1% SL, 2% TP as fallback
                            if (slPrice === null) slPrice = activeTool === 'long' ? price * 0.99 : price * 1.01;
                            if (tpPrice === null) tpPrice = activeTool === 'long' ? price * 1.02 : price * 0.98;

                            const newDrawing = {
                                type: activeTool,
                                id: tempId,
                                p1: { time, price },
                                p2: { time: endTime, price: slPrice },
                                p3: { time: endTime, price: tpPrice }
                            };

                            // Add to state immediately
                            const updatedDrawings = [...drawingsRef.current, newDrawing];
                            drawingsRef.current = updatedDrawings;
                            setDrawings(updatedDrawings);
                            if (drawingsPrimitiveRef.current) {
                                drawingsPrimitiveRef.current.setDrawings(updatedDrawings);
                            }

                            // Select it
                            selectedDrawingIdRef.current = tempId;
                            setSelectedDrawingId(tempId);
                            if (drawingsPrimitiveRef.current) {
                                drawingsPrimitiveRef.current.setSelectedId(tempId);
                            }

                            // Save
                            saveDrawing(newDrawing);

                            onToolChange('cursor');
                            return;
                        }

                        // First Click: Start Drawing (Standard)
                        currentDrawingRef.current = {
                            type: activeTool,
                            p1: { time, price },
                            p2: { time, price } // Initially p2 = p1
                        };
                        // Disable chart scrolling while drawing
                        chartRef.current.applyOptions({ handleScroll: false, handleScale: false });
                    } else {
                        // Second Click: Finish Drawing
                        const tempId = `temp_${Date.now()}_${Math.random()}`;

                        let targetPrice = price;
                        // Shift key for horizontal line
                        if (e.shiftKey) {
                            targetPrice = currentDrawingRef.current.p1.price;
                        }

                        let finalP2 = { time, price: targetPrice }; // from mouse
                        let finalP3 = null; // Target for Long/Short

                        // For Long/Short, calculate initial TP (p3)
                        if (activeTool === 'long' || activeTool === 'short') {
                            const p1 = currentDrawingRef.current.p1;
                            const p2 = finalP2;

                            const y1 = p1.price;
                            const y2 = p2.price;
                            const yDiff = y2 - y1;

                            // Default 2R Target
                            const targetPrice = y1 - yDiff * 2;

                            finalP3 = {
                                time: p2.time, // Share end time
                                price: targetPrice
                            };
                        }

                        const newDrawing = {
                            ...currentDrawingRef.current,
                            id: tempId,
                            p2: finalP2,
                            p3: finalP3
                        };

                        // Add to state immediately with temp ID
                        const updatedDrawings = [...drawingsRef.current, newDrawing];
                        drawingsRef.current = updatedDrawings; // Sync ref immediately
                        setDrawings(updatedDrawings);
                        if (drawingsPrimitiveRef.current) {
                            drawingsPrimitiveRef.current.setDrawings(updatedDrawings);
                        }

                        // Auto-select the newly created drawing
                        console.log('DEBUG: Auto-selecting new drawing', tempId);
                        selectedDrawingIdRef.current = tempId;
                        setSelectedDrawingId(tempId);
                        if (drawingsPrimitiveRef.current) {
                            drawingsPrimitiveRef.current.setSelectedId(tempId);
                        }

                        // Save to Backend (async)
                        saveDrawing(newDrawing);

                        currentDrawingRef.current = null;
                        onToolChange('cursor'); // Reset tool

                        // Re-enable chart interactions
                        chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
                    }
                }
                return;
            }

            // Check for Marker Click (Filled Orders) - cursor mode only
            if (activeTool === 'cursor') {
                const timeScale = chartRef.current.timeScale();
                const clickedTime = timeScale.coordinateToTime(mouseX);

                if (clickedTime !== null && filledOrdersRef.current && filledOrdersRef.current.length > 0) {
                    // Find marker at this time (allow some tolerance)
                    const clickedMarker = filledOrdersRef.current.find(marker => {
                        const markerX = timeScale.timeToCoordinate(marker.time);
                        if (markerX === null) return false;

                        // Check horizontal distance
                        if (Math.abs(markerX - mouseX) >= 15) return false;

                        // Check vertical distance
                        // Find the candle for this marker to know High/Low
                        const candle = allDataRef.current.find(c => c.time === marker.time);
                        if (!candle) return false;

                        let markerY;
                        if (marker.position === 'aboveBar') {
                            const highCoord = seriesRef.current.priceToCoordinate(candle.high);
                            if (highCoord === null) return false;
                            // Marker is above High (lower Y value). Estimate center ~30px above.
                            markerY = highCoord - 30;
                        } else {
                            // belowBar
                            const lowCoord = seriesRef.current.priceToCoordinate(candle.low);
                            if (lowCoord === null) return false;
                            // Marker is below Low (higher Y value). Estimate center ~30px below.
                            markerY = lowCoord + 30;
                        }

                        // Check vertical distance with tolerance
                        return Math.abs(markerY - mouseY) < 30;
                    });

                    if (clickedMarker) {
                        // Toggle price line for this marker
                        const historyLineId = `history_${clickedMarker.id}`;
                        const existingLine = priceLinesRef.current.find(
                            item => item.draggableInfo && item.draggableInfo.id === historyLineId
                        );

                        if (existingLine) {
                            // Remove existing line
                            if (seriesRef.current) {
                                try {
                                    seriesRef.current.removePriceLine(existingLine.line);
                                } catch (e) {
                                    // ignore
                                }
                            }
                            if (existingLine.labelElement) {
                                existingLine.labelElement.remove();
                            }
                            priceLinesRef.current = priceLinesRef.current.filter(item => item !== existingLine);
                        } else {
                            // Create new price line WITHOUT text label
                            const color = clickedMarker.color;
                            // Add quantity to label if available
                            const labelText = clickedMarker.quantity ? `Qty: ${clickedMarker.quantity}` : '';

                            addPriceLine(
                                clickedMarker.originalPrice,
                                labelText, // Show quantity on line
                                color,
                                LineStyle.Dashed,
                                { type: 'HISTORY', id: historyLineId }
                            );
                        }
                        return; // Stop processing other clicks
                    }
                }
            }

            // If already dragging/placing, don't select another line
            if (draggingLineRef.current) return;

            // Check for Anchor click first (if selected)
            if (selectedDrawingIdRef.current) {
                const drawing = drawingsRef.current.find(d => d.id === selectedDrawingIdRef.current);
                if (drawing) {
                    const p1 = getCoordinate(drawing.p1.time, drawing.p1.price);
                    const p2 = getCoordinate(drawing.p2.time, drawing.p2.price);

                    if (p1 && p2) {
                        const anchors = [
                            { x: p1.x, y: p1.y, idx: 0 }, // p1
                            { x: p2.x, y: p2.y, idx: 1 }, // p2
                        ];

                        if (['rect'].includes(drawing.type)) {
                            anchors.push({ x: p1.x, y: p2.y, idx: 2 }); // bottom-left / top-right
                            anchors.push({ x: p2.x, y: p1.y, idx: 3 }); // top-left / bottom-right
                        } else if (['long', 'short'].includes(drawing.type)) {
                            // Anchor 2: Target (p3)
                            if (drawing.p3) {
                                const p3Coord = getCoordinate(drawing.p3.time, drawing.p3.price);
                                if (p3Coord) {
                                    anchors.push({ x: p2.x, y: p3Coord.y, idx: 2 });
                                }
                            } else {
                                // Calculate implicit target if p3 missing
                                const yDiff = p2.y - p1.y;
                                const targetY = p1.y - yDiff * 2;
                                anchors.push({ x: p2.x, y: targetY, idx: 2 });
                            }

                            // Anchor 3: Width Control (Right Entry)
                            anchors.push({ x: p2.x, y: p1.y, idx: 3 });
                        }

                        for (const anchor of anchors) {
                            const dist = Math.hypot(mouseX - anchor.x, mouseY - anchor.y);
                            if (dist < 10) {
                                dragStateRef.current = {
                                    drawingId: drawing.id,
                                    pointIndex: anchor.idx,
                                };
                                chartRef.current.applyOptions({ handleScroll: false, handleScale: false });
                                return;
                            }
                        }
                    }
                }
            }

            // Check for Drawing Body click
            let closestDrawing = null;
            let minDrawDiff = Infinity;

            console.log('DEBUG: Checking', drawingsRef.current.length, 'drawings, activeTool=', activeTool);
            drawingsRef.current.forEach(d => {
                const p1 = getCoordinate(d.p1.time, d.p1.price);
                const p2 = getCoordinate(d.p2.time, d.p2.price);
                if (!p1 || !p2) return;

                let dist = Infinity;

                if (d.type === 'line' || d.type === 'fib') {
                    dist = pointToLineDistance(mouseX, mouseY, p1.x, p1.y, p2.x, p2.y);
                } else if (['rect', 'long', 'short'].includes(d.type)) {
                    const minX = Math.min(p1.x, p2.x);
                    const maxX = Math.max(p1.x, p2.x);
                    const minY = Math.min(p1.y, p2.y);
                    const maxY = Math.max(p1.y, p2.y);

                    if (mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY) {
                        dist = 0;
                    } else {
                        const dx = Math.max(minX - mouseX, 0, mouseX - maxX);
                        const dy = Math.max(minY - mouseY, 0, mouseY - maxY);
                        dist = Math.sqrt(dx * dx + dy * dy);
                    }
                }

                if (dist < 10) {
                    if (dist < minDrawDiff) {
                        minDrawDiff = dist;
                        closestDrawing = d;
                    }
                }
            });

            console.log('DEBUG: closestDrawing=', closestDrawing ? closestDrawing.id : 'none');
            if (closestDrawing) {
                console.log('DEBUG: Selecting drawing', closestDrawing.id);
                setSelectedDrawingId(closestDrawing.id);
                selectedDrawingIdRef.current = closestDrawing.id;
                if (drawingsPrimitiveRef.current) {
                    drawingsPrimitiveRef.current.setSelectedId(closestDrawing.id);
                }
                return;
            }

            // Price Line Logic (Existing)
            const price = seriesRef.current.coordinateToPrice(mouseY);
            if (price === null) {
                // Clicked on empty space and no drawing hit
                console.log('DEBUG: price is null, clearing selection');
                setSelectedDrawingId(null);
                selectedDrawingIdRef.current = null;
                if (drawingsPrimitiveRef.current) {
                    drawingsPrimitiveRef.current.setSelectedId(null);
                }
                return;
            }

            // Find closest line
            let closestLine = null;
            let minDiff = Infinity;

            priceLinesRef.current.forEach(item => {
                if (!item.draggableInfo) return;

                const lineY = seriesRef.current.priceToCoordinate(item.price);
                if (lineY === null) return;

                const diff = Math.abs(mouseY - lineY);
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
            } else {
                // Clicked on chart but hit nothing (no drawing, no price line)
                // Deselect drawing
                console.log('DEBUG: no closestLine, clearing selection');
                setSelectedDrawingId(null);
                selectedDrawingIdRef.current = null;
                if (drawingsPrimitiveRef.current) {
                    drawingsPrimitiveRef.current.setSelectedId(null);
                }
            }
        };

        const handleMouseMove = (e) => {
            if (!seriesRef.current) return;
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Handle Crosshair Snapping (Magnet)
            // Even if not dragging/drawing, snap crosshair if Meta is held
            if (e.metaKey || e.ctrlKey) {
                const hoverPrice = seriesRef.current.coordinateToPrice(y);
                const hoverTime = getTimeFromCoordinate(x);
                if (hoverPrice !== null && hoverTime !== null) {
                    const magnet = getMagnetData(hoverTime, hoverPrice, true);
                    chartRef.current.setCrosshairPosition(magnet.price, magnet.time, seriesRef.current);
                    isMagnetActiveRef.current = true;
                }
            } else {
                if (isMagnetActiveRef.current) {
                    chartRef.current.clearCrosshairPosition();
                    isMagnetActiveRef.current = false;
                }
            }

            // Drawing Dragging
            if (dragStateRef.current) {
                let price = seriesRef.current.coordinateToPrice(y);
                let time = getTimeFromCoordinate(x);

                if (price !== null && time !== null) {
                    // Apply OHLC snap if Command/Ctrl is held
                    const magnet = getMagnetData(time, price, e.metaKey || e.ctrlKey);
                    time = magnet.time;
                    price = magnet.price;

                    const { drawingId, pointIndex } = dragStateRef.current;

                    setDrawings(prev => {
                        const updated = prev.map(d => {
                            if (d.id !== drawingId) return d;

                            const newD = { ...d };
                            const newPoint = { time, price };

                            // Apply Shift key constraint for horizontal locking
                            let constrainedPoint = newPoint;
                            if (e.shiftKey && (pointIndex === 1 || pointIndex === 3)) {
                                // Lock to p1's price for horizontal line
                                constrainedPoint = { time: newPoint.time, price: d.p1.price };
                            }

                            if (pointIndex === 0) { // p1 (Entry)
                                newD.p1 = newPoint;
                                // If Long/Short, moving Entry optionally moves others? 
                                // For now, just moves Entry, changing Risk/Reward dynamics.
                            } else if (pointIndex === 1) { // p2 (SL / End)
                                newD.p2 = constrainedPoint;
                                // Sync p3 time with p2 time for Long/Short
                                if ((d.type === 'long' || d.type === 'short') && newD.p3) {
                                    newD.p3 = { ...newD.p3, time: constrainedPoint.time };
                                }
                            } else if (pointIndex === 2) {
                                if (d.type === 'long' || d.type === 'short') {
                                    // p3 (Target)
                                    // Price is independent, Time synced with p2
                                    let sharedTime = newD.p2.time; // default to existing p2 time
                                    // If we allow dragging Time via Target handle too:
                                    sharedTime = newPoint.time;

                                    newD.p3 = { time: sharedTime, price: newPoint.price };
                                    newD.p2 = { ...newD.p2, time: sharedTime }; // Sync p2
                                } else {
                                    // Rect: x1, y2 -> modify p1.x, p2.y
                                    newD.p1 = { ...newD.p1, time: newPoint.time };
                                    newD.p2 = { ...newD.p2, price: newPoint.price };
                                }
                            } else if (pointIndex === 3) {
                                if (d.type === 'long' || d.type === 'short') {
                                    // Width Control (Right Entry)
                                    // Modify Time (p2.time & p3.time)
                                    // Keep Prices same
                                    const newTime = newPoint.time;
                                    newD.p2 = { ...newD.p2, time: newTime };
                                    if (newD.p3) newD.p3 = { ...newD.p3, time: newTime };
                                } else {
                                    // Rect: x2, y1 -> modify p2.x, p1.y
                                    newD.p1 = { ...newD.p1, price: newPoint.price };
                                    newD.p2 = { ...newD.p2, time: newPoint.time };
                                }
                            }

                            return newD;
                        });

                        if (drawingsPrimitiveRef.current) {
                            drawingsPrimitiveRef.current.setDrawings(updated);
                        }
                        return updated;
                    });
                }
                return;
            }

            // Drawing Logic
            if (currentDrawingRef.current) {
                let price = seriesRef.current.coordinateToPrice(y);
                let time = getTimeFromCoordinate(x);

                if (price !== null && time !== null) {
                    // Apply OHLC snap if Command/Ctrl is held
                    const magnet = getMagnetData(time, price, e.metaKey || e.ctrlKey);
                    time = magnet.time;
                    price = magnet.price;

                    let targetPrice = price;

                    // Shift key for horizontal line
                    if (e.shiftKey) {
                        targetPrice = currentDrawingRef.current.p1.price;
                    }

                    currentDrawingRef.current.p2 = { time, price: targetPrice };

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
            if (dragStateRef.current) {
                const d = drawingsRef.current.find(x => x.id === dragStateRef.current.drawingId);
                if (d) updateDrawing(d);

                dragStateRef.current = null;
                chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
            }

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
                    } else if (type === 'ORDER_TP' || type === 'ORDER_SL') {
                        const payload = {};
                        if (type === 'ORDER_TP') payload.take_profit_price = newPrice;
                        if (type === 'ORDER_SL') payload.stop_loss_price = newPrice;

                        await fetch(`/api/orders/${orderId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        console.log(`Updated ${type} for Order ${orderId} to ${newPrice}`);
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
                setTimeout(() => updateOverlayData(), 500);
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
    }, [updateOverlayData, activeTool]); // 移除 drawings 和 selectedDrawingId 依赖

    // -------------------------------------------------------------------------
    // 1. Chart Instance Lifecycle (Mount Once)
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!chartContainerRef.current) return;

        console.log("Initializing chart instance...");
        chartContainerRef.current.innerHTML = '';

        // Create Chart
        const containerWidth = chartContainerRef.current.clientWidth;
        const containerHeight = chartContainerRef.current.clientHeight;
        const defaultBarSpacing = 6;
        const rightOffset = Math.round((containerWidth / defaultBarSpacing) / 6); // 1/6 of screen width

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#f5f5f5' },
                textColor: 'black',
            },
            width: containerWidth,
            height: containerHeight,
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
                rightOffset: rightOffset,
                barSpacing: defaultBarSpacing,
            },
            localization: {
                locale: 'en-US',
                timezone: timezone, // Use state instead of constant
                dateFormat: 'yyyy-MM-dd',
            },
        });

        chartRef.current = chart;

        const newSeries = chart.addSeries(CandlestickSeries, {
            upColor: chartOptions.upColor,
            downColor: chartOptions.downColor,
            borderVisible: chartOptions.borderVisible,
            borderColor: chartOptions.borderColor,
            wickUpColor: chartOptions.wickUpColor,
            wickDownColor: chartOptions.wickDownColor,
            lastValueVisible: false,
        });

        seriesRef.current = newSeries;

        // Restore Data instantly if available (e.g. after timezone switch)
        if (allDataRef.current && allDataRef.current.length > 0) {
            newSeries.setData(allDataRef.current);
            // Optionally autoScale?
            // chart.timeScale().fitContent();
        }

        // Attach Primitives (Holders)
        const drawingsPrimitive = new DrawingsPrimitive();
        newSeries.attachPrimitive(drawingsPrimitive);
        drawingsPrimitiveRef.current = drawingsPrimitive;

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

        // Resize Observer
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                try {
                    chartRef.current.applyOptions({
                        width: chartContainerRef.current.clientWidth,
                        height: chartContainerRef.current.clientHeight
                    });
                } catch (e) {
                    // Ignore resize errors
                }
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => handleResize());
        });

        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
        }

        // Sync labels loop
        let animationFrameId;

        const syncLabels = () => {
            if (seriesRef.current && priceLinesRef.current.length > 0) {
                priceLinesRef.current.forEach(item => {
                    if (item.labelElement && chartRef.current && seriesRef.current) {
                        try {
                            const y = seriesRef.current.priceToCoordinate(item.price);
                            if (y === null) {
                                item.labelElement.style.display = 'none';
                            } else {
                                item.labelElement.style.display = 'flex';
                                item.labelElement.style.top = `${y}px`;
                            }
                        } catch (e) { }
                    }
                });
            }
            animationFrameId = requestAnimationFrame(syncLabels);
        };
        syncLabels();

        // Restore drawings if any (from initial state)
        if (drawingsRef.current.length > 0) {
            drawingsPrimitive.setDrawings(drawingsRef.current);
        }

        return () => {
            console.log("Destroying chart instance...");
            resizeObserver.disconnect();
            cancelAnimationFrame(animationFrameId);

            if (chartRef.current) {
                chartRef.current.remove();
            }

            // Clear refs
            chartRef.current = null;
            seriesRef.current = null;
            markersPrimitiveRef.current = null;
            countdownPrimitiveRef.current = null;
            drawingsPrimitiveRef.current = null;
            fvgPrimitiveRef.current = null;

            if (labelsContainerRef.current) {
                labelsContainerRef.current.innerHTML = '';
            }
        };
    }, []); // Mount once only

    // -------------------------------------------------------------------------
    // 2. Data & Symbol/Timeframe Logic
    // -------------------------------------------------------------------------
    useEffect(() => {
        // Wait for chart instance
        if (!chartRef.current || !seriesRef.current) return;

        let isCancelled = false;
        let ws = null;
        let wsTimeout = null;
        let scrollTimeout = null;
        let overlayInterval = null;

        // 2.1 Update Timeframe-dependent Primitives
        // Countdown: Detach old, attach new
        if (countdownPrimitiveRef.current) {
            try {
                if (seriesRef.current) seriesRef.current.detachPrimitive(countdownPrimitiveRef.current);
            } catch (e) { console.warn(e); }
        }
        const countdownPrimitive = new CountdownPrimitive({
            timeframe,
            timezone,
            colors: {
                up: chartOptions.upColor,
                down: chartOptions.downColor
            }
        });
        if (seriesRef.current) seriesRef.current.attachPrimitive(countdownPrimitive);
        countdownPrimitiveRef.current = countdownPrimitive;

        // Drawings Interval
        if (drawingsPrimitiveRef.current) {
            drawingsPrimitiveRef.current.setInterval(timeframeToSeconds(timeframe));
        }

        // 2.2 Reset Data buffers
        // We do NOT clear series data immediately to preserve "ghost" data while loading.
        // However, we reset the internal buffer.
        allDataRef.current = [];
        hasMoreRef.current = true;
        isLoadingRef.current = false;
        isChartReadyRef.current = false;

        // 2.3 Load Data Function
        const loadData = async (endTime = null) => {
            if (isLoadingRef.current || isCancelled) return;
            if (endTime && !hasMoreRef.current) return;

            console.log(`Loading data... symbol=${symbol} timeframe=${timeframe}`);
            isLoadingRef.current = true;

            try {
                setError(null);
                let url = `/api/market/klines?symbol=${symbol}&interval=${timeframe}&limit=1000`;
                if (endTime) {
                    url += `&endTime=${endTime}`;
                }

                const response = await fetch(url);
                if (isCancelled) return;

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                if (isCancelled) return;

                if (!Array.isArray(data)) {
                    throw new Error("Invalid data format");
                }

                const cdata = data.map(d => ({
                    time: toChartSeconds(d[0], timezone),
                    originalTimeMs: d[0],
                    open: parseFloat(d[1]),
                    high: parseFloat(d[2]),
                    low: parseFloat(d[3]),
                    close: parseFloat(d[4]),
                }));

                // Deduplicate logic
                const uniqueCData = [];
                const seenTimes = new Set();
                cdata.forEach(item => {
                    if (!seenTimes.has(item.time)) {
                        seenTimes.add(item.time);
                        uniqueCData.push(item);
                    }
                });

                if (uniqueCData.length === 0) {
                    if (endTime) hasMoreRef.current = false;
                } else {
                    if (endTime) {
                        // Merge (Infinite Scroll)
                        const existingTimes = new Set(allDataRef.current.map(d => d.time));
                        const uniqueNewData = uniqueCData.filter(d => !existingTimes.has(d.time));

                        if (uniqueNewData.length === 0) {
                            hasMoreRef.current = false;
                        } else {
                            allDataRef.current = [...uniqueNewData, ...allDataRef.current].sort((a, b) => a.time - b.time);
                        }
                    } else {
                        // Initial Load
                        allDataRef.current = uniqueCData;
                        hasMoreRef.current = true;
                    }

                    // Update Series
                    if (seriesRef.current && chartRef.current && !isCancelled) {
                        seriesRef.current.setData(allDataRef.current);

                        if (!endTime) {
                            isChartReadyRef.current = true;
                            // Since we preserve the instance, auto-scale might be needed if price range differs drastically
                            // seriesRef.current.applyOptions({ autoScale: true }); // Make sure autoScale is on?
                            // Default is usually fine.
                        }
                    }

                    // Update Current Price
                    if (!endTime && cdata.length > 0) {
                        const lastClose = cdata[cdata.length - 1].close;
                        lastPriceRef.current = lastClose;
                        setCurrentPrice(lastClose);
                    }

                    // Update FVGs
                    updateFVGs();

                    // Update Overlay
                    if (!endTime) updateOverlayData();
                }

            } catch (err) {
                if (isCancelled) return;
                console.error("Load Data Error:", err);
                setError(err.message);
            } finally {
                isLoadingRef.current = false;
            }
        };

        // Load Initial Data
        loadData();

        // 2.4 WebSocket Setup
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/market/ws/klines/${symbol}/${timeframe}`;

        wsTimeout = setTimeout(() => {
            if (isCancelled) return;
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('Connected to WS');
            };

            ws.onmessage = (event) => {
                if (isCancelled || !isChartReadyRef.current) return;
                try {
                    const message = JSON.parse(event.data);
                    if (!message.k) return;

                    const kline = message.k;
                    const candle = {
                        time: toChartSeconds(kline.t, timezone),
                        originalTimeMs: kline.t,
                        open: parseFloat(kline.o),
                        high: parseFloat(kline.h),
                        low: parseFloat(kline.l),
                        close: parseFloat(kline.c),
                    };

                    if (candle.open > 0 && seriesRef.current) {
                        seriesRef.current.update(candle);

                        // Update buffer
                        const lastData = allDataRef.current[allDataRef.current.length - 1];
                        if (lastData && lastData.time === candle.time) {
                            allDataRef.current[allDataRef.current.length - 1] = candle;
                        } else if (!lastData || candle.time > lastData.time) {
                            allDataRef.current.push(candle);
                        }

                        // Update Price Display
                        if (lastPriceRef.current) {
                            if (candle.close > lastPriceRef.current) setPriceColor('text-green-600');
                            else if (candle.close < lastPriceRef.current) setPriceColor('text-red-600');
                        }
                        setCurrentPrice(candle.close);
                        lastPriceRef.current = candle.close;

                        updateFVGs();
                    }
                } catch (e) {
                    console.error("WS Error", e);
                }
            };
        }, 500);

        // 2.5 Infinite Scroll Listener
        const handleVisibleRangeChange = (range) => {
            if (scrollTimeout || isCancelled) return;
            scrollTimeout = setTimeout(() => {
                scrollTimeout = null;
                if (isCancelled) return;
                if (range && range.from < 10 && !isLoadingRef.current && hasMoreRef.current) {
                    const firstData = allDataRef.current[0];
                    if (firstData) {
                        loadData(firstData.originalTimeMs - 1);
                    }
                }
            }, 200);
        };

        chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

        // Overlay Interval
        overlayInterval = setInterval(updateOverlayData, 5000);

        return () => {
            isCancelled = true;
            if (ws) ws.close();
            if (wsTimeout) clearTimeout(wsTimeout);
            if (scrollTimeout) clearTimeout(scrollTimeout);
            if (overlayInterval) clearInterval(overlayInterval);

            if (chartRef.current) {
                chartRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
            }
        };
    }, [symbol, timeframe, timezone, user, updateOverlayData, updateFVGs]); // Re-run when symbol/timeframe/timezone changes

    // -------------------------------------------------------------------------
    // 2.5 Apply Timezone Change (Must be after Chart Init)
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!chartRef.current) return;

        console.log(`[Chart] Applying timezone: ${timezone}`);
        try {
            chartRef.current.applyOptions({
                localization: {
                    locale: 'en-US', // Ensure locale is set
                    timezone: timezone,
                    dateFormat: 'yyyy-MM-dd',
                },
            });
            // Force a slight timescale update to ensure labels redraw (hack)
            // chartRef.current.timeScale().fitContent(); 
        } catch (e) {
            console.error("[Chart] Failed to apply timezone", e);
        }
    }, [timezone, isChartReadyRef.current]); // Depend on readiness too? No, just timezone. But make sure chart is valid.

    // -------------------------------------------------------------------------
    // 3. Account WebSocket (User Data Stream)
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!user) return;

        let ws = null;
        let isCancelled = false;

        const initAccountStream = async () => {
            try {
                // Fetch/Create Account to get the correct account_id
                const res = await fetch(`/api/accounts/?user_id=${user.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}) // Empty body as user_id is a query param
                });

                if (!res.ok) {
                    console.error("Failed to fetch account for WS");
                    return;
                }

                const account = await res.json();
                if (isCancelled) return;

                const accountId = account.id;

                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host;
                const wsUrl = `${protocol}//${host}/api/accounts/ws/${accountId}`;

                console.log(`Connecting to Account WS: ${wsUrl}`);

                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    if (isCancelled) {
                        ws.close();
                        return;
                    }
                    console.log("Connected to Account Stream");
                };

                ws.onmessage = (event) => {
                    if (isCancelled) return;
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'ACCOUNT_UPDATE') {
                            // console.log("Received ACCOUNT_UPDATE, refreshing data...");
                            updateOverlayData();
                        }
                    } catch (e) {
                        // console.error("Account WS Decode Error", e);
                    }
                };

                ws.onerror = (e) => {
                    if (isCancelled) return;
                    console.error("Account WS Error", e);
                };

                ws.onclose = () => {
                    if (!isCancelled) {
                        console.log("Account Stream Closed");
                    }
                };
            } catch (err) {
                console.error("Error determining account for WS", err);
            }
        };

        initAccountStream();

        return () => {
            isCancelled = true;
            if (ws) {
                // Remove listeners to prevent "closed before established" errors from triggering user handlers
                ws.onopen = null;
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
                ws.close();
            }
        };
    }, [user, updateOverlayData]);

    return (
        <div
            className="flex flex-col h-full bg-white relative group"
            onMouseDownCapture={onActivate} // Use capture to ensure we get the event before children consume it
        >
            {/* Active/Hover Border Overlay - pointer-events-none so it doesn't block clicks */}
            <div className={`absolute inset-0 pointer-events-none z-20 border-2 transition-colors duration-200 ${isActive ? 'border-blue-500' : 'border-transparent group-hover:border-gray-300'
                }`} />

            {/* Notification Toast */}
            {notification && (
                <div className={`absolute top-16 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg z-50 text-sm font-medium animate-fade-in-down ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                    }`}>
                    {notification.text}
                </div>
            )}

            {showSettings && (
                <div
                    className="absolute top-2 right-2 z-40 bg-white p-4 rounded-lg shadow-2xl border border-gray-200 w-64 ring-1 ring-black ring-opacity-5"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-bold text-gray-800">Chart Settings</h3>
                        <button
                            onClick={() => setShowSettings(false)}
                            className="text-gray-400 hover:text-gray-600 focus:outline-none"
                        >
                            <span className="text-xl">&times;</span>
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Timezone</label>
                            <select
                                value={timezone}
                                onChange={(e) => onSettingsChange({ timezone: e.target.value })}
                                className="w-full text-sm border-gray-300 rounded shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="Asia/Shanghai">Beijing (UTC+8)</option>
                                <option value="America/New_York">New York (UTC-5)</option>
                            </select>
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">Show FVG</label>
                            <input
                                type="checkbox"
                                checked={showFVG}
                                onChange={(e) => onSettingsChange({ showFVG: e.target.checked })}
                                className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                        </div>

                        <div className="border-t pt-4">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Colors</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Up</label>
                                    <input type="color" value={chartOptions.upColor} onChange={(e) => onSettingsChange({ chartOptions: { upColor: e.target.value } })} className="w-full h-8 p-0 border rounded cursor-pointer" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Down</label>
                                    <input type="color" value={chartOptions.downColor} onChange={(e) => onSettingsChange({ chartOptions: { downColor: e.target.value } })} className="w-full h-8 p-0 border rounded cursor-pointer" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Wick Up</label>
                                    <input type="color" value={chartOptions.wickUpColor} onChange={(e) => onSettingsChange({ chartOptions: { wickUpColor: e.target.value } })} className="w-full h-8 p-0 border rounded cursor-pointer" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Wick Down</label>
                                    <input type="color" value={chartOptions.wickDownColor} onChange={(e) => onSettingsChange({ chartOptions: { wickDownColor: e.target.value } })} className="w-full h-8 p-0 border rounded cursor-pointer" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Border</label>
                                    <input type="color" value={chartOptions.borderColor} onChange={(e) => onSettingsChange({ chartOptions: { borderColor: e.target.value } })} className="w-full h-8 p-0 border rounded cursor-pointer" />
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={chartOptions.borderVisible}
                                        onChange={(e) => onSettingsChange({ chartOptions: { borderVisible: e.target.checked } })}
                                        className="h-4 w-4 text-blue-600 rounded mr-2"
                                    />
                                    <label className="text-xs text-gray-500">Border Visible</label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )
            }

            {
                error && (
                    <div className="absolute top-2 left-2 right-2 p-2 bg-red-100 text-red-700 rounded z-20 text-xs text-center border border-red-200 shadow-sm">
                        {error}
                    </div>
                )
            }

            <div className="w-full h-full relative overflow-hidden">
                <div
                    ref={chartContainerRef}
                    style={{ height: '100%', width: '100%', backgroundColor: '#ffffff', cursor: draggingLine ? 'ns-resize' : 'default' }}
                />
                <div ref={labelsContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 10 }} />
            </div>
        </div >
    );
}
