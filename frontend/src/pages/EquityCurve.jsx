import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries, CrosshairMode } from 'lightweight-charts';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

export default function EquityCurve() {
  const { user } = useAuth();
  const chartContainerRef = useRef();
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clear previous content
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
    });

    const newSeries = chart.addSeries(AreaSeries, {
      lineColor: '#2962FF',
      topColor: '#2962FF',
      bottomColor: 'rgba(41, 98, 255, 0.28)',
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = newSeries;

    const handleResize = () => {
        if (chartContainerRef.current) {
            chart.applyOptions({ 
                width: chartContainerRef.current.clientWidth,
                height: chartContainerRef.current.clientHeight
            });
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

  const lastDataTimeRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    
    isFirstLoad.current = true;
    lastDataTimeRef.current = 0;

    const fetchData = async () => {
        try {
            const res = await axios.get(`${API_URL}/accounts/${user.id}/equity-history`);
            
            const rawData = res.data.map(item => ({
                time: new Date(item.timestamp).getTime() / 1000,
                value: item.equity
            }));
            
            rawData.sort((a, b) => a.time - b.time);

            const uniqueData = [];
            if (rawData.length > 0) {
                uniqueData.push(rawData[0]);
                for (let i = 1; i < rawData.length; i++) {
                    if (rawData[i].time > uniqueData[uniqueData.length - 1].time) {
                        uniqueData.push(rawData[i]);
                    } else {
                        uniqueData[uniqueData.length - 1].value = rawData[i].value;
                    }
                }
            }

            if (seriesRef.current && uniqueData.length > 0) {
                if (isFirstLoad.current) {
                    seriesRef.current.setData(uniqueData);
                    lastDataTimeRef.current = uniqueData[uniqueData.length - 1].time;
                    
                    if (chartRef.current) {
                        chartRef.current.timeScale().fitContent();
                    }
                    isFirstLoad.current = false;
                } else {
                    // Incremental update
                    const newPoints = uniqueData.filter(d => d.time >= lastDataTimeRef.current);
                    
                    if (newPoints.length > 0) {
                        newPoints.forEach(point => {
                            seriesRef.current.update(point);
                        });
                        lastDataTimeRef.current = newPoints[newPoints.length - 1].time;
                    }
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-[calc(100vh-64px)] flex flex-col">
      <h2 className="text-xl font-semibold mb-4">Account Equity Over Time</h2>
      <div className="flex-grow relative" ref={chartContainerRef} />
    </div>
  );
}
