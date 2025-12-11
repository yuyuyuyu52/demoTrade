import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, ColorType, CandlestickSeries, LineStyle, CrosshairMode, createSeriesMarkers } from 'lightweight-charts';
import { CountdownPrimitive } from '../plugins/CountdownPrimitive';
import { DrawingsPrimitive } from '../plugins/DrawingsPrimitive';
import { FVGPrimitive } from '../plugins/FVGPrimitive';
import { useAuth } from '../context/AuthContext';
import { Pencil, Square, TrendingUp, ArrowUpCircle, ArrowDownCircle, Trash2, MousePointer2, Settings } from 'lucide-react';

const TIMEZONE = 'America/New_York';

const timeframeToSeconds = (tf) => {
    switch (tf) {
        case '1m': return 60;
        case '3m': return 3 * 60;
        case '5m': return 5 * 60;
        case '15m': return 15 * 60;
        case '30m': return 30 * 60;
        case '1h': return 60 * 60;
        case '2h': return 2 * 60 * 60;
        case '4h': return 4 * 60 * 60;
        case '6h': return 6 * 60 * 60;
        case '8h': return 8 * 60 * 60;
        case '12h': return 12 * 60 * 60;
        case '1d': return 24 * 60 * 60;
        case '3d': return 3 * 24 * 60 * 60;
        case '1w': return 7 * 24 * 60 * 60;
        case '1M': return 30 * 24 * 60 * 60;
        default: return 60 * 60; // fallback 1h
    }
};

// 简单的快速时区转换（针对美东时间）
// 美东时间：标准时间 UTC-5，夏令时 UTC-4
// 这里为了性能，简化为直接减去 4 或 5 小时的偏移量
// 注意：这只是一个近似值，用于快速展示，如果需要严格的历史时间准确性（如处理夏令时切换点），仍需更复杂的逻辑
const toNySeconds = (ms) => {
    // 假设当前大部分时间是夏令时 (UTC-4) 或者 标准时间 (UTC-5)
    // 为了极致性能，我们这里简单地判断月份来决定偏移量？
    // 或者直接使用固定偏移量？
    // 更好的方式是使用 Date 对象的时区偏移，但是要考虑到目标时区是 NY
    // 
    // 实测 Intl API 非常慢，每秒只能处理几千次调用，而数学计算每秒可达数百万次。
    // 在 K 线加载场景下（300 - 1000 个点），优化提升明显。

    // 方案：获取当前日期的 NY 偏移量缓存起来？
    // 或者直接用 UTC-4 (14400秒) (夏令时) / UTC-5 (18000秒) (冬令时)
    // 简单的判断规则：3月第二个周日 到 11月第一个周日 是夏令时

    // 如果不追求 100% 的历史准确性（比如几年前的某个具体小时），固定 UTC-4 在大部分交易场景下是可接受的
    // 或者我们可以牺牲一点点启动时间，计算一次当天的偏移量

    const date = new Date(ms);
    const month = date.getUTCMonth(); // 0-11

    // 粗略判断夏令时 (3月-10月肯定在，11月-2月可能不在)
    // 这是一个折中方案
    let offset = -5; // Default Standard Time (Winter)

    // March to November roughly
    if (month > 2 && month < 10) {
        offset = -4;
    } else if (month === 2) {
        // March: approximate check (pass)
        if (date.getUTCDate() > 14) offset = -4;
    } else if (month === 10) {
        // Nov: approximate check
        if (date.getUTCDate() < 7) offset = -4;
    }

    return Math.floor(ms / 1000) + (offset * 3600);
};

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
    const drawingsRef = useRef([]); // Ref to keep track of latest drawings for event handlers
    const [selectedDrawingId, setSelectedDrawingId] = useState(null);
    const selectedDrawingIdRef = useRef(null); // Ref for selected ID
    const currentDrawingRef = useRef(null);
    const dragStateRef = useRef(null);

    // Sync refs with state
    useEffect(() => {
        drawingsRef.current = drawings;
    }, [drawings]);

    useEffect(() => {
        selectedDrawingIdRef.current = selectedDrawingId;
    }, [selectedDrawingId]);

    // Chart Settings
    const [showSettings, setShowSettings] = useState(false);
    const [showFVG, setShowFVG] = useState(false);
    const showFVGRef = useRef(false); // Ref to track latest showFVG for use inside closures
    const isChartReadyRef = useRef(false); // Track if initial data is loaded
    const [chartOptions, setChartOptions] = useState({
        upColor: '#00C853',
        downColor: '#FF5252',
        wickUpColor: '#00C853',
        wickDownColor: '#FF5252',
        borderVisible: false,
        borderColor: '#000000',
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
                borderColor: chartOptions.borderColor,
            });
        }
    }, [chartOptions]);

    // Fetch Settings from Backend
    // FVG Calculation
    // FVG Calculation
    // Incremental FVG Calculation State
    const activeFVGsRef = useRef([]);
    const lastProcessedIndexRef = useRef(0);

    // Reset incremental state when symbol/timeframe changes
    useEffect(() => {
        activeFVGsRef.current = [];
        lastProcessedIndexRef.current = 0;
    }, [symbol, timeframe]);

    const calculateFVGs = useCallback((data, isIncremental = false) => {
        if (!data || data.length < 3) return [];

        let startIndex = 2;
        let activeFVGs = [];

        if (isIncremental) {
            startIndex = Math.max(2, lastProcessedIndexRef.current);
            // Deep copy to avoid mutating the ref state directly if we were in React state (but we are in ref)
            activeFVGs = [...activeFVGsRef.current];
        } else {
            // Full recalc
            activeFVGs = [];
            lastProcessedIndexRef.current = 0;
            startIndex = 2;
        }

        let filledCount = 0;

        for (let i = startIndex; i < data.length; i++) {
            const curr = data[i];
            const prev2 = data[i - 2];

            // 1. Check if current candle fills any active FVGs
            const nextActive = [];
            for (const fvg of activeFVGs) {
                let filled = false;

                // Skip if FVG is from the future (shouldn't happen in sorted data, but safety check)
                if (fvg.time >= curr.time) {
                    nextActive.push(fvg);
                    continue;
                }

                if (fvg.type === 'bullish') {
                    // Bullish FVG: Filled if Price drops below Bottom
                    const bodyLow = Math.min(curr.open, curr.close);
                    if (bodyLow <= fvg.bottom) {
                        filled = true;
                    }
                } else {
                    // Bearish FVG: Filled if Price rises above Top
                    const bodyHigh = Math.max(curr.open, curr.close);
                    if (bodyHigh >= fvg.top) {
                        filled = true;
                    }
                }

                if (!filled) {
                    nextActive.push(fvg);
                } else {
                    fvg.filled = true;
                    filledCount++;
                }
            }
            activeFVGs = nextActive;

            // 2. Detect New FVG

            // Bullish FVG: Low[i] > High[i-2]
            if (curr.low > prev2.high) {
                activeFVGs.push({
                    time: prev2.time,
                    top: curr.low,
                    bottom: prev2.high,
                    type: 'bullish',
                    filled: false
                });
            }

            // Bearish FVG: High[i] < Low[i-2]
            if (curr.high < prev2.low) {
                activeFVGs.push({
                    time: prev2.time,
                    top: prev2.low,
                    bottom: curr.high,
                    type: 'bearish',
                    filled: false
                });
            }
        }

        // Update References
        activeFVGsRef.current = activeFVGs;
        lastProcessedIndexRef.current = data.length; // Mark all as processed

        // console.log(`Calculated FVGs (Incremental=${isIncremental}): ${activeFVGs.length} active`);
        return activeFVGs;
    }, []);

    // Fetch Settings from Backend
    useEffect(() => {
        if (!user) return;
        const fetchSettings = async () => {
            try {
                const res = await fetch(`/api/accounts/${user.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.chart_settings) {
                        const s = data.chart_settings;
                        if (s.showFVG !== undefined) {
                            setShowFVG(s.showFVG);
                            showFVGRef.current = s.showFVG; // Update ref immediately
                            // Force update if data is already loaded
                            if (allDataRef.current.length > 0 && fvgPrimitiveRef.current) {
                                if (s.showFVG) {
                                    const fvgs = calculateFVGs(allDataRef.current);
                                    fvgPrimitiveRef.current.setFVGs(fvgs);
                                } else {
                                    fvgPrimitiveRef.current.setFVGs([]);
                                }
                            }
                        }
                        if (s.chartOptions) setChartOptions(prev => ({ ...prev, ...s.chartOptions }));
                    }
                }
            } catch (e) {
                console.error("Failed to fetch settings", e);
            }
        };
        fetchSettings();
    }, [user, calculateFVGs]); // Added calculateFVGs dependency

    // Save Settings to Backend (Debounced)
    useEffect(() => {
        if (!user) return;
        const settings = {
            showFVG,
            chartOptions
        };

        const timer = setTimeout(async () => {
            try {
                await fetch(`/api/accounts/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chart_settings: settings
                    })
                });
            } catch (e) {
                console.error("Failed to save settings", e);
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [showFVG, chartOptions, user]);

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

        const fvgs = calculateFVGs(allDataRef.current, false); // Manual toggle needs full recalc
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
                    p1: d.data.p1,
                    p2: d.data.p2,
                    p3: d.data.p3,
                    p4: d.data.p4
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
                data: {
                    p1: drawing.p1,
                    p2: drawing.p2,
                    p3: drawing.p3,
                    p4: drawing.p4
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
            const payload = {
                data: {
                    p1: drawing.p1,
                    p2: drawing.p2,
                    p3: drawing.p3,
                    p4: drawing.p4
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
                } else {
                    // Time is in the past but timeToCoordinate failed (maybe zoomed in/out or not exact bar)
                    // Try to find closest bar
                    // Binary search
                    let left = 0;
                    let right = data.length - 1;
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
                            // Use updated_at for FILLED orders to show execution time, shifted to NY time
                            const originalTime = toNySeconds(new Date(o.updated_at).getTime());
                            const interval = timeframeToSeconds(timeframe);
                            // Normalize time to the start of the candle for the current timeframe
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

    // Handle Delete Key for Drawings
    useEffect(() => {
        const handleKeyDown = (e) => {
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
    }, [selectedDrawingId, drawings]);

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

        const handleMouseDown = (e) => {
            if (!seriesRef.current || !chartRef.current) return;

            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Drawing Logic
            if (activeTool !== 'cursor') {
                const price = seriesRef.current.coordinateToPrice(mouseY);
                const time = getTimeFromCoordinate(mouseX);

                if (price !== null && time !== null) {
                    if (activeTool === 'long' || activeTool === 'short') {
                        // Single Click Creation
                        const interval = timeframeToSeconds(timeframe);
                        const widthTime = interval * 30; // 30 bars width
                        const entryPrice = price;
                        const tpPrice = activeTool === 'long' ? (entryPrice * 1.01) : (entryPrice * 0.99);
                        const slPrice = activeTool === 'long' ? (entryPrice * 0.99) : (entryPrice * 1.01);

                        const tempId = `temp_${Date.now()}_${Math.random()}`;
                        const newDrawing = {
                            id: tempId,
                            type: activeTool,
                            p1: { time, price: entryPrice },
                            p2: { time: time + widthTime, price: entryPrice },
                            p3: { time, price: tpPrice },
                            p4: { time, price: slPrice }
                        };

                        const updatedDrawings = [...drawingsRef.current, newDrawing];
                        drawingsRef.current = updatedDrawings;
                        setDrawings(updatedDrawings);
                        if (drawingsPrimitiveRef.current) {
                            drawingsPrimitiveRef.current.setDrawings(updatedDrawings);
                        }

                        selectedDrawingIdRef.current = tempId;
                        setSelectedDrawingId(tempId);
                        if (drawingsPrimitiveRef.current) {
                            drawingsPrimitiveRef.current.setSelectedId(tempId);
                        }

                        saveDrawing(newDrawing);
                        setActiveTool('cursor');
                        return;
                    }

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
                        const tempId = `temp_${Date.now()}_${Math.random()}`;
                        const newDrawing = {
                            ...currentDrawingRef.current,
                            id: tempId,
                            p2: { time, price }
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
                        setActiveTool('cursor'); // Reset tool

                        // Re-enable chart interactions
                        chartRef.current.applyOptions({ handleScroll: true, handleScale: true });
                    }
                }
            } else {

                // If already dragging/placing, don't select another line
                if (draggingLineRef.current) return;

                // Check for Anchor click first (if selected)
                if (selectedDrawingIdRef.current) {
                    const drawing = drawingsRef.current.find(d => d.id === selectedDrawingIdRef.current);
                    if (drawing) {
                        const p1 = getCoordinate(drawing.p1.time, drawing.p1.price);
                        const p2 = getCoordinate(drawing.p2.time, drawing.p2.price);

                        if (p1 && p2) {
                            const anchors = [];
                            if (drawing.type === 'long' || drawing.type === 'short') {
                                // A1: Origin
                                anchors.push({ x: p1.x, y: p1.y, idx: 0 });
                                // A2: Width (Right-Center aligned with Origin Y)
                                anchors.push({ x: p2.x, y: p1.y, idx: 1 });
                                // A3 & A4: Top/Bottom
                                if (drawing.p3 && drawing.p4) {
                                    const y3 = seriesRef.current.priceToCoordinate(drawing.p3.price);
                                    const y4 = seriesRef.current.priceToCoordinate(drawing.p4.price);
                                    if (y3 !== null && y4 !== null) {
                                        const midX = (p1.x + p2.x) / 2;
                                        anchors.push({ x: midX, y: y3, idx: 2 });
                                        anchors.push({ x: midX, y: y4, idx: 3 });
                                    }
                                }
                            } else {
                                anchors.push({ x: p1.x, y: p1.y, idx: 0 }); // p1
                                anchors.push({ x: p2.x, y: p2.y, idx: 1 }); // p2

                                if (['rect'].includes(drawing.type)) {
                                    anchors.push({ x: p1.x, y: p2.y, idx: 2 });
                                    anchors.push({ x: p2.x, y: p1.y, idx: 3 });
                                }
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
            }
        };

        const handleMouseMove = (e) => {
            if (!seriesRef.current) return;
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Drawing Dragging
            if (dragStateRef.current) {
                const price = seriesRef.current.coordinateToPrice(y);
                const time = getTimeFromCoordinate(x);

                if (price !== null && time !== null) {
                    const { drawingId, pointIndex } = dragStateRef.current;

                    setDrawings(prev => {
                        const updated = prev.map(d => {
                            if (d.id !== drawingId) return d;

                            const newD = { ...d };
                            const newPoint = { time, price };

                            if (d.type === 'long' || d.type === 'short') {
                                if (pointIndex === 0) { // Origin: Move Entire Shape
                                    const dt = newPoint.time - d.p1.time;
                                    const dp = newPoint.price - d.p1.price;

                                    newD.p1 = newPoint;
                                    if (d.p2) newD.p2 = { time: d.p2.time + dt, price: d.p2.price }; // Keep price same? p2 usually defines width
                                    if (d.p3) newD.p3 = { time: d.p3.time + dt, price: d.p3.price + dp };
                                    if (d.p4) newD.p4 = { time: d.p4.time + dt, price: d.p4.price + dp };
                                } else if (pointIndex === 1) { // Width: Adjust p2 time
                                    newD.p2 = { ...d.p2, time: newPoint.time };
                                } else if (pointIndex === 2) { // Top: Adjust p3 price
                                    newD.p3 = { ...d.p3, price: newPoint.price };
                                } else if (pointIndex === 3) { // Bottom: Adjust p4 price
                                    newD.p4 = { ...d.p4, price: newPoint.price };
                                }
                            } else {
                                if (pointIndex === 0) { // p1
                                    newD.p1 = newPoint;
                                } else if (pointIndex === 1) { // p2
                                    newD.p2 = newPoint;
                                } else if (pointIndex === 2) { // x1, y2 -> modify p1.x, p2.y
                                    newD.p1 = { ...newD.p1, time: newPoint.time };
                                    newD.p2 = { ...newD.p2, price: newPoint.price };
                                } else if (pointIndex === 3) { // x2, y1 -> modify p2.x, p1.y
                                    newD.p2 = { ...newD.p2, time: newPoint.time };
                                    newD.p1 = { ...newD.p1, price: newPoint.price };
                                }
                            }

                            return newD;
                        });

                        drawingsRef.current = updated; // Update ref immediately for mouseUp

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
                const price = seriesRef.current.coordinateToPrice(y);
                const time = getTimeFromCoordinate(x);

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
    }, [updateOverlayData, activeTool]); // 移除 drawings 和 selectedDrawingId 依赖

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
            localization: {
                locale: 'en-US',
                timezone: TIMEZONE,
                dateFormat: 'yyyy-MM-dd',
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

        // Force FVG update if data exists (fixes initial load issue)
        // Use a timeout to ensure state is settled?
        setTimeout(() => {
            if (allDataRef.current.length > 0 && showFVG && fvgPrimitiveRef.current) {
                const fvgs = calculateFVGs(allDataRef.current);
                fvgPrimitiveRef.current.setFVGs(fvgs);
            }
        }, 100);

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
                let url = `/api/market/klines?symbol=${symbol}&interval=${timeframe}&limit=300`;
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

                const cdata = data.map(d => {
                    const originalMs = d[0];
                    const t = toNySeconds(originalMs);
                    return {
                        time: t,
                        originalTimeMs: originalMs,
                        open: parseFloat(d[1]),
                        high: parseFloat(d[2]),
                        low: parseFloat(d[3]),
                        close: parseFloat(d[4]),
                    };
                });

                // Dedup cdata internally using NY-shifted time (chart key must be strictly increasing)
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
                        // Filter out duplicates based on chart time key (NY shifted)
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
                            isChartReadyRef.current = true; // Mark chart as ready for WS updates
                        }
                    }

                    if (!endTime && cdata.length > 0) {
                        const lastClose = cdata[cdata.length - 1].close;
                        lastPriceRef.current = lastClose;
                        setCurrentPrice(lastClose);
                    }
                }

                // Update FVGs - use ref to get latest showFVG value
                if (fvgPrimitiveRef.current) {
                    if (showFVGRef.current) {
                        // For initial load, use full recalc (isIncremental=false)
                        const fvgs = calculateFVGs(allDataRef.current, false);
                        fvgPrimitiveRef.current.setFVGs(fvgs);
                    } else {
                        fvgPrimitiveRef.current.setFVGs([]);
                    }
                }

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
                        // Binance API expects milliseconds for endTime (exchange time)
                        // Use originalTimeMs to request data before the earliest candle we have.
                        loadData(firstData.originalTimeMs - 1);
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
                // Prevent WS updates before initial history is loaded
                if (!isChartReadyRef.current) return;

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
                        time: toNySeconds(kline.t),
                        originalTimeMs: kline.t,
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
                        } else if (!lastData || candle.time > lastData.time) {
                            allDataRef.current.push(candle);
                        } else {
                            // Out-of-order WS update; ignore to keep ascending time
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
            fvgPrimitiveRef.current = null;
            chartRef.current = null;

            // Reset loading state to allow new fetches on remount
            isLoadingRef.current = false;
            isChartReadyRef.current = false;

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
                        {['1m', '5m', '15m', '1h', '4h', '1d', '1w'].map((tf) => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`px-3 py-2 text-sm font-medium transition-colors ${timeframe === tf
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
                                className={`px-3 py-2 text-sm font-medium transition-colors ${symbol === sym
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
                            onClick={async () => {
                                // Delete all drawings from backend
                                const drawingsToDelete = drawingsRef.current.filter(d => !String(d.id).startsWith('temp_'));
                                await Promise.all(drawingsToDelete.map(d => deleteDrawing(d.id)));

                                // Update FVG incrementally
                                if (showFVGRef.current && fvgPrimitiveRef.current) {
                                    // We pass the full array, but the function will check lastProcessedIndexRef
                                    const fvgs = calculateFVGs(allDataRef.current, true);
                                    fvgPrimitiveRef.current.setFVGs(fvgs);
                                } setSelectedDrawingId(null);
                                selectedDrawingIdRef.current = null;
                                if (drawingsPrimitiveRef.current) {
                                    drawingsPrimitiveRef.current.setDrawings([]);
                                    drawingsPrimitiveRef.current.setSelectedId(null);
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
                                            onChange={(e) => setChartOptions({ ...chartOptions, upColor: e.target.value })}
                                            className="w-full h-8 p-0 border-0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Down Color</label>
                                        <input
                                            type="color"
                                            value={chartOptions.downColor}
                                            onChange={(e) => setChartOptions({ ...chartOptions, downColor: e.target.value })}
                                            className="w-full h-8 p-0 border-0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Wick Up</label>
                                        <input
                                            type="color"
                                            value={chartOptions.wickUpColor}
                                            onChange={(e) => setChartOptions({ ...chartOptions, wickUpColor: e.target.value })}
                                            className="w-full h-8 p-0 border-0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Wick Down</label>
                                        <input
                                            type="color"
                                            value={chartOptions.wickDownColor}
                                            onChange={(e) => setChartOptions({ ...chartOptions, wickDownColor: e.target.value })}
                                            className="w-full h-8 p-0 border-0"
                                        />
                                    </div>
                                    <div className="col-span-2 flex items-center gap-2 mt-2">
                                        <input
                                            type="checkbox"
                                            checked={chartOptions.borderVisible}
                                            onChange={(e) => setChartOptions({ ...chartOptions, borderVisible: e.target.checked })}
                                            className="h-4 w-4"
                                        />
                                        <label className="text-xs text-gray-500">Show Border</label>
                                    </div>
                                    {chartOptions.borderVisible && (
                                        <div className="col-span-2">
                                            <label className="block text-xs text-gray-500 mb-1">Border Color</label>
                                            <input
                                                type="color"
                                                value={chartOptions.borderColor}
                                                onChange={(e) => setChartOptions({ ...chartOptions, borderColor: e.target.value })}
                                                className="w-full h-8 p-0 border-0"
                                            />
                                        </div>
                                    )}
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
