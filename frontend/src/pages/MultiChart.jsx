import React, { useState, useEffect, useCallback } from 'react';
import Chart from './Chart';
import { LayoutGrid, Square, Columns, Rows, Trash2, Settings, MousePointer2, Pencil, TrendingUp, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function MultiChart() {
    const { user } = useAuth();
    // Layout modes: '1x1', '2x1' (2 vertical cols), '1x2' (2 horizontal rows), '2x2'
    const [layout, setLayout] = useState(() => localStorage.getItem('multiChartLayout') || '1x1');
    const [activeChartId, setActiveChartId] = useState(0);
    const [charts, setCharts] = useState([0]);

    // Centralized State for all charts
    // Structure: { [id]: { symbol: 'BTCUSDT', timeframe: '1h', quantity: 0.01, activeTool: 'cursor', ... } }
    const [chartsData, setChartsData] = useState({});

    // Real-time data from active chart (for toolbar display)
    const [activePrice, setActivePrice] = useState(null);
    const [activePriceColor, setActivePriceColor] = useState('text-gray-800');

    // Global Chart Settings (Shared by all charts)
    const [globalSettings, setGlobalSettings] = useState({
        timezone: 'Asia/Shanghai',
        showFVG: false,
        chartOptions: {
            upColor: '#00C853',
            downColor: '#FF5252',
            wickUpColor: '#00C853',
            wickDownColor: '#FF5252',
            borderVisible: false,
            borderColor: '#000000',
        }
    });

    // Fetch Global Settings
    useEffect(() => {
        if (!user) return;
        const fetchSettings = async () => {
            try {
                const res = await fetch(`/api/accounts/${user.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.chart_settings) {
                        const s = data.chart_settings;
                        setGlobalSettings(prev => ({
                            timezone: s.timezone || prev.timezone,
                            showFVG: s.showFVG !== undefined ? s.showFVG : prev.showFVG,
                            chartOptions: { ...prev.chartOptions, ...s.chartOptions }
                        }));
                    }
                }
            } catch (e) {
                console.error("Failed to fetch settings", e);
            }
        };
        fetchSettings();
    }, [user]);

    // Save Global Settings (Debounced)
    useEffect(() => {
        if (!user) return;
        const timer = setTimeout(async () => {
            try {
                await fetch(`/api/accounts/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chart_settings: globalSettings
                    })
                });
            } catch (e) {
                console.error("Failed to save settings", e);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [globalSettings, user]);

    // Handler for updating settings from any chart
    const updateGlobalSettings = useCallback((updates) => {
        setGlobalSettings(prev => {
            // updates can be partial { timezone: ... } or { chartOptions: ... }
            const newSettings = { ...prev, ...updates };
            if (updates.chartOptions) {
                newSettings.chartOptions = { ...prev.chartOptions, ...updates.chartOptions };
            }
            return newSettings;
        });
    }, []);

    // Initialize or get chart data
    const getChartData = (id) => {
        return chartsData[id] || {
            symbol: localStorage.getItem(`chart_${id}_symbol`) || localStorage.getItem('chart_symbol') || 'BTCUSDT',
            timeframe: localStorage.getItem(`chart_${id}_timeframe`) || localStorage.getItem('chart_timeframe') || '1h',
            quantity: parseFloat(localStorage.getItem(`chart_${id}_quantity`) || localStorage.getItem('chart_quantity') || '0.01'),
            activeTool: 'cursor',
        };
    };

    // Update charts array when layout changes
    useEffect(() => {
        localStorage.setItem('multiChartLayout', layout);
        let count = 1;
        switch (layout) {
            case '1x1': count = 1; break;
            case '2x1': count = 2; break;
            case '1x2': count = 2; break;
            case '2x2': count = 4; break;
            default: count = 1;
        }

        setCharts(prev => {
            if (prev.length === count) return prev;
            if (prev.length < count) {
                const newCharts = [...prev];
                let nextId = Math.max(...prev, -1) + 1;
                while (newCharts.length < count) {
                    newCharts.push(nextId++);
                }
                return newCharts;
            } else {
                return prev.slice(0, count);
            }
        });

        // Ensure active chart exists
        setActiveChartId(prev => {
            if (prev >= count) return 0; // Simple fallback
            return prev;
        });

    }, [layout]);

    // Ensure chartsData is populated for visible charts
    useEffect(() => {
        setChartsData(prev => {
            const next = { ...prev };
            let changed = false;
            charts.forEach(id => {
                if (!next[id]) {
                    next[id] = getChartData(id);
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [charts]);

    // Handler to update a specific chart's data
    const updateChartData = useCallback((id, updates) => {
        setChartsData(prev => {
            const current = prev[id] || getChartData(id);
            const nextVal = { ...current, ...updates };

            // Persist to local storage if relevant fields changed
            if (updates.symbol) localStorage.setItem(`chart_${id}_symbol`, updates.symbol);
            if (updates.timeframe) localStorage.setItem(`chart_${id}_timeframe`, updates.timeframe);
            if (updates.quantity) localStorage.setItem(`chart_${id}_quantity`, updates.quantity);

            return { ...prev, [id]: nextVal };
        });
    }, []);

    // Handlers for Toolbar (operating on Active Chart)
    const activeData = chartsData[activeChartId] || getChartData(activeChartId);

    const setSymbol = (sym) => updateChartData(activeChartId, { symbol: sym });
    const setTimeframe = (tf) => updateChartData(activeChartId, { timeframe: tf });
    const setQuantity = (q) => updateChartData(activeChartId, { quantity: q });
    const setActiveTool = (tool) => updateChartData(activeChartId, { activeTool: tool });

    // Trigger clear drawings (we need a signal mechanism, simple counter works or event bus)
    // For simplicity, we can pass a 'clearDrawingsTimestamp' prop.
    const clearDrawings = () => {
        updateChartData(activeChartId, { clearDrawingsTotal: (activeData.clearDrawingsTotal || 0) + 1 });
    };

    // Toggle Settings
    const [showGlobalSettings, setShowGlobalSettings] = useState(false); // If we want global settings
    // Actually settings are per chart usually but can be global. Let's keep per chart via prop?
    // For now let's just trigger the settings modal inside the chart via a prop signal.
    const openSettings = () => {
        updateChartData(activeChartId, { showSettingsTimestamp: Date.now() });
    };


    const getGridClass = () => {
        switch (layout) {
            case '1x1': return 'grid-cols-1 grid-rows-1';
            case '2x1': return 'grid-cols-2 grid-rows-1';
            case '1x2': return 'grid-cols-1 grid-rows-2';
            case '2x2': return 'grid-cols-2 grid-rows-2';
            default: return 'grid-cols-1 grid-rows-1';
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-100">
            {/* Top Toolbar (Shared) */}
            <div className="bg-white border-b p-2 flex flex-wrap items-center gap-2 lg:gap-4 shadow-sm z-10">
                {/* Layout Switcher */}
                <div className="flex items-center space-x-1 border-r pr-4 mr-2">
                    <button onClick={() => setLayout('1x1')} className={`p-1.5 rounded ${layout === '1x1' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`} title="Single View"><Square size={16} /></button>
                    <button onClick={() => setLayout('2x1')} className={`p-1.5 rounded ${layout === '2x1' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`} title="2 Columns"><Columns size={16} /></button>
                    <button onClick={() => setLayout('1x2')} className={`p-1.5 rounded ${layout === '1x2' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`} title="2 Rows"><Rows size={16} /></button>
                    <button onClick={() => setLayout('2x2')} className={`p-1.5 rounded ${layout === '2x2' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`} title="Grid 2x2"><LayoutGrid size={16} /></button>
                </div>

                {/* Active Chart Controls */}
                <div className="flex items-center gap-2 lg:gap-4 flex-1 overflow-x-auto no-scrollbar">
                    {/* Price Display */}
                    <div className={`text-xl font-bold font-mono ${activePriceColor} min-w-[80px]`}>
                        {activePrice ? activePrice.toFixed(2) : '---'}
                    </div>

                    {/* Timeframes */}
                    <div className="flex border rounded shadow-sm overflow-hidden bg-white">
                        {['1m', '5m', '15m', '1h', '4h', '1d', '1w'].map((tf) => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`px-2 py-1 text-xs lg:text-sm font-medium transition-colors ${activeData.timeframe === tf ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>

                    {/* Symbols */}
                    <div className="flex border rounded shadow-sm overflow-hidden bg-white hidden sm:flex">
                        {['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'].map((sym) => (
                            <button
                                key={sym}
                                onClick={() => setSymbol(sym)}
                                className={`px-2 py-1 text-xs lg:text-sm font-medium transition-colors ${activeData.symbol === sym ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                            >
                                {sym.replace('USDT', '')}
                            </button>
                        ))}
                    </div>

                    {/* Qty */}
                    <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-gray-500 hidden lg:inline">Qty:</span>
                        <input
                            type="number"
                            value={activeData.quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="p-1 border rounded shadow-sm w-16 text-sm"
                            step="0.001"
                        />
                    </div>

                    {/* Tools */}
                    <div className="flex border rounded shadow-sm overflow-hidden bg-white ml-auto">
                        <button onClick={() => setActiveTool('cursor')} className={`p-1.5 ${activeData.activeTool === 'cursor' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`} title="Cursor"><MousePointer2 size={16} /></button>
                        <button onClick={() => setActiveTool('line')} className={`p-1.5 ${activeData.activeTool === 'line' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`} title="Trend Line"><Pencil size={16} /></button>
                        <button onClick={() => setActiveTool('rect')} className={`p-1.5 ${activeData.activeTool === 'rect' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`} title="Rectangle"><Square size={16} /></button>
                        <button onClick={() => setActiveTool('fib')} className={`p-1.5 ${activeData.activeTool === 'fib' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`} title="Fibonacci"><TrendingUp size={16} /></button>
                        <button onClick={() => setActiveTool('long')} className={`p-1.5 ${activeData.activeTool === 'long' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`} title="Long Position"><ArrowUpCircle size={16} /></button>
                        <button onClick={() => setActiveTool('short')} className={`p-1.5 ${activeData.activeTool === 'short' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`} title="Short Position"><ArrowDownCircle size={16} /></button>
                        <button onClick={clearDrawings} className="p-1.5 text-red-600 hover:bg-red-50" title="Clear All"><Trash2 size={16} /></button>
                        <button onClick={openSettings} className="p-1.5 text-gray-600 hover:bg-gray-50" title="Settings"><Settings size={16} /></button>
                    </div>
                </div>
            </div>

            {/* Grid Container */}
            <div className={`flex-1 grid gap-1 p-1 overflow-hidden ${getGridClass()}`}>
                {charts.map(id => {
                    const data = chartsData[id] || getChartData(id);
                    return (
                        <div key={id} className="relative overflow-hidden bg-white rounded shadow-sm border border-gray-200">
                            {/* Overlay ID label if needed, or simple active border handled by Chart inner */}
                            <Chart
                                chartId={id}
                                isActive={activeChartId === id}
                                onActivate={() => setActiveChartId(id)}

                                // Controlled Props
                                symbol={data.symbol}
                                timeframe={data.timeframe}
                                quantity={data.quantity}
                                activeTool={data.activeTool}

                                // Signals
                                clearDrawingsTimestamp={data.clearDrawingsTotal}
                                showSettingsTimestamp={data.showSettingsTimestamp}

                                // Callbacks
                                onPriceChange={(price, color) => {
                                    if (activeChartId === id) {
                                        setActivePrice(price);
                                        setActivePriceColor(color);
                                    }
                                }}
                                onToolChange={(tool) => updateChartData(id, { activeTool: tool })}

                                // Shared Settings Props
                                timezone={globalSettings.timezone}
                                showFVG={globalSettings.showFVG}
                                chartOptions={globalSettings.chartOptions}
                                onSettingsChange={updateGlobalSettings}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
