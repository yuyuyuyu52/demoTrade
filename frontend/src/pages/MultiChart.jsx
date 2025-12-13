import React, { useState, useEffect } from 'react';
import Chart from './Chart';
import { LayoutGrid, Square, Columns, Rows, Plus } from 'lucide-react';

export default function MultiChart() {
    // Layout modes: '1x1', '2x1' (2 vertical cols), '1x2' (2 horizontal rows), '2x2'
    const [layout, setLayout] = useState('1x1');
    const [activeChartId, setActiveChartId] = useState(0);

    // We maintain a list of chart IDs. 
    // In a real advanced app we might allow adding/removing dynamic charts.
    // For this fixed layout manager, we can map layout to number of charts.
    const [charts, setCharts] = useState([0]);

    // Update charts array when layout changes
    useEffect(() => {
        let count = 1;
        switch (layout) {
            case '1x1': count = 1; break;
            case '2x1': count = 2; break; // 2 Columns
            case '1x2': count = 2; break; // 2 Rows
            case '2x2': count = 4; break;
            default: count = 1;
        }

        setCharts(prev => {
            if (prev.length === count) return prev;
            if (prev.length < count) {
                // Add new charts with unique IDs based on max existing + 1
                const newCharts = [...prev];
                let nextId = Math.max(...prev, -1) + 1;
                while (newCharts.length < count) {
                    newCharts.push(nextId++);
                }
                return newCharts;
            } else {
                // Reduce charts (keep the first N)
                return prev.slice(0, count);
            }
        });

        // Ensure active chart is valid
        setActiveChartId(prev => {
            // If the active chart is removed, default to 0 (or first available)
            // We'll handle this in the rendering or state update logic simply.
            return prev;
        });

    }, [layout]);


    const getGridClass = () => {
        switch (layout) {
            case '1x1': return 'grid-cols-1 grid-rows-1';
            case '2x1': return 'grid-cols-2 grid-rows-1'; // 2 Columns
            case '1x2': return 'grid-cols-1 grid-rows-2'; // 2 Rows
            case '2x2': return 'grid-cols-2 grid-rows-2';
            default: return 'grid-cols-1 grid-rows-1';
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-100">
            {/* Layout Toolbar */}
            <div className="h-10 bg-white border-b flex items-center px-4 justify-between flex-shrink-0">
                <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-gray-500 mr-2">Layout:</span>
                    <button
                        onClick={() => setLayout('1x1')}
                        className={`p-1 rounded ${layout === '1x1' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                        title="Single View"
                    >
                        <Square size={18} />
                    </button>
                    <button
                        onClick={() => setLayout('2x1')}
                        className={`p-1 rounded ${layout === '2x1' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                        title="2 Columns"
                    >
                        <Columns size={18} />
                    </button>
                    <button
                        onClick={() => setLayout('1x2')}
                        className={`p-1 rounded ${layout === '1x2' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                        title="2 Rows"
                    >
                        <Rows size={18} />
                    </button>
                    <button
                        onClick={() => setLayout('2x2')}
                        className={`p-1 rounded ${layout === '2x2' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                        title="Grid 2x2"
                    >
                        <LayoutGrid size={18} />
                    </button>
                </div>

                <div className="text-xs text-gray-400">
                    Active: Chart #{activeChartId}
                </div>
            </div>

            {/* Grid Container */}
            <div className={`flex-1 grid gap-1 p-1 ${getGridClass()}`}>
                {charts.map(id => (
                    <div key={id} className="relative overflow-hidden bg-white rounded shadow-sm">
                        <Chart
                            chartId={id}
                            isActive={activeChartId === id}
                            onActivate={() => setActiveChartId(id)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
