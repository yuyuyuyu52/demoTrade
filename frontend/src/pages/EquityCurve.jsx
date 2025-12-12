import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, ColorType, AreaSeries, CrosshairMode } from 'lightweight-charts';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

export default function EquityCurve() {
  const { user } = useAuth();
  const chartContainerRef = useRef();
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  const [allData, setAllData] = useState([]);
  const [timeRange, setTimeRange] = useState('ALL');

  const ranges = [
    { label: '全部', value: 'ALL', duration: null },
    { label: '一年', value: '1Y', duration: 365 * 24 * 60 * 60 * 1000 },
    { label: '一月', value: '1M', duration: 30 * 24 * 60 * 60 * 1000 },
    { label: '一周', value: '1W', duration: 7 * 24 * 60 * 60 * 1000 },
    { label: '一日', value: '1D', duration: 24 * 60 * 60 * 1000 },
  ];

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartContainerRef.current.innerHTML = '';

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
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
      handleScale: false, // Prevent zooming to keep "no scrolling" view by default if desired, but user might want to zoom. 
      // User said "best not to scroll to see all". fitContent handles that. 
      // I'll leave scaling enabled but enforce fitContent on update.
    });

    const newSeries = chart.addSeries(AreaSeries, {
      lineColor: '#2962FF',
      topColor: '#2962FF',
      bottomColor: 'rgba(41, 98, 255, 0.28)',
      crosshairMarkerVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = newSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
        chartRef.current.timeScale().fitContent();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Fetch Data
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/accounts/${user.id}/equity-history`);

        // Normalize data
        const rawData = res.data.map(item => ({
          time: new Date(item.timestamp).getTime() / 1000,
          value: item.equity
        }));

        // Sort
        rawData.sort((a, b) => a.time - b.time);

        // De-duplicate times (keep last value for same second)
        const uniqueData = [];
        if (rawData.length > 0) {
          uniqueData.push(rawData[0]);
          for (let i = 1; i < rawData.length; i++) {
            const last = uniqueData[uniqueData.length - 1];
            const curr = rawData[i];
            if (curr.time > last.time) {
              uniqueData.push(curr);
            } else {
              // same time, update value
              last.value = curr.value;
            }
          }
        }

        setAllData(uniqueData);
      } catch (error) {
        console.error("Failed to fetch equity history", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [user]);

  // Filter and Update Chart
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || allData.length === 0) return;

    let filteredData = allData;
    const selectedRange = ranges.find(r => r.value === timeRange);

    if (selectedRange && selectedRange.duration) {
      const cutoff = (Date.now() / 1000) - (selectedRange.duration / 1000);
      filteredData = allData.filter(d => d.time >= cutoff);
    }

    if (filteredData.length === 0) {
      seriesRef.current.setData([]);
      return;
    }

    // Uniform Sampling (Evenly take data points)
    // Target ~200 points for smoothness without overcrowding
    const TARGET_POINTS = 200;
    let sampledData = filteredData;

    if (filteredData.length > TARGET_POINTS) {
      sampledData = [];
      const step = (filteredData.length - 1) / (TARGET_POINTS - 1);

      for (let i = 0; i < TARGET_POINTS; i++) {
        const index = Math.round(i * step);
        if (index < filteredData.length) {
          sampledData.push(filteredData[index]);
        }
      }
      // Ensure last point is always included to show current equity
      if (sampledData[sampledData.length - 1].time !== filteredData[filteredData.length - 1].time) {
        sampledData.push(filteredData[filteredData.length - 1]);
      }
    }

    seriesRef.current.setData(sampledData);

    // Fit content to view (No scrolling required)
    chartRef.current.timeScale().fitContent();

  }, [allData, timeRange]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-[calc(100vh-64px)] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Account Equity Over Time</h2>

        <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto">
          {ranges.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${timeRange === range.value
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-grow relative" ref={chartContainerRef} />
    </div>
  );
}
