import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, TrendingDown, Activity, Percent, DollarSign, BarChart2 } from 'lucide-react';

const API_URL = '/api';

const StatCard = ({ title, value, subtext, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">{title}</h3>
      <div className={`p-2 rounded-full ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
    </div>
    <div className="flex items-baseline">
      <span className="text-2xl font-bold text-gray-900">{value}</span>
    </div>
    {subtext && <p className="text-sm text-gray-400 mt-2">{subtext}</p>}
  </div>
);

export default function Statistics() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('ALL');

  const ranges = [
    { label: '全部', value: 'ALL', days: null },
    { label: '一年', value: '1Y', days: 365 },
    { label: '半年', value: '6M', days: 180 },
    { label: '三月', value: '3M', days: 90 },
    { label: '一月', value: '1M', days: 30 },
    { label: '一周', value: '1W', days: 7 },
    { label: '一日', value: '1D', days: 1 },
  ];

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user, timeRange]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const selectedRange = ranges.find(r => r.value === timeRange);
      const params = selectedRange && selectedRange.days ? { days: selectedRange.days } : {};
      const res = await axios.get(`${API_URL}/accounts/${user.id}/statistics`, { params });
      setStats(res.data);
    } catch (error) {
      console.error("Failed to fetch statistics", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) return <div className="p-8 text-center">Loading statistics...</div>;
  if (!stats && !loading) return <div className="p-8 text-center">No statistics available.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4 md:mb-0">Trading Performance</h1>
        
        <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto max-w-full">
          {ranges.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                timeRange === range.value
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
      
      {loading && <div className="mb-4 text-center text-sm text-gray-500">Updating...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Max Drawdown */}
        <StatCard 
          title="Max Drawdown" 
          value={`${(stats.max_drawdown_pct * 100).toFixed(2)}%`}
          subtext={`-$${stats.max_drawdown.toFixed(2)} from peak`}
          icon={TrendingDown}
          color="text-red-500"
        />

        {/* Profit Factor */}
        <StatCard 
          title="Profit Factor" 
          value={stats.profit_factor.toFixed(2)}
          subtext={
            <span className="flex gap-2 text-xs">
              <span>L: {stats.long_profit_factor.toFixed(2)}</span>
              <span>S: {stats.short_profit_factor.toFixed(2)}</span>
            </span>
          }
          icon={BarChart2}
          color="text-blue-500"
        />

        {/* Sharpe Ratio */}
        <StatCard 
          title="Sharpe Ratio" 
          value={stats.sharpe_ratio.toFixed(2)}
          subtext="Risk-adjusted return"
          icon={Activity}
          color="text-purple-500"
        />

        {/* Reward to Risk (R-Multiple) */}
        <StatCard 
          title="Avg R-Multiple" 
          value={stats.reward_to_risk_ratio.toFixed(2)}
          subtext="Avg Win / Avg Loss"
          icon={Activity}
          color="text-orange-500"
        />

        {/* Expectancy */}
        <StatCard 
          title="Expectancy" 
          value={`$${stats.expectancy.toFixed(2)}`}
          subtext="Average value per trade"
          icon={DollarSign}
          color="text-green-500"
        />

        {/* Win Rate */}
        <StatCard 
          title="Win Rate" 
          value={`${(stats.win_rate * 100).toFixed(1)}%`}
          subtext={`${stats.total_trades} Total Trades`}
          icon={Percent}
          color="text-indigo-500"
        />

        {/* Win/Loss Streak */}
        <StatCard 
          title="Max Streak" 
          value={`W: ${stats.max_win_streak} / L: ${stats.max_loss_streak}`}
          subtext="Consecutive Wins / Losses"
          icon={TrendingUp}
          color="text-teal-500"
        />

        {/* CAGR */}
        <StatCard 
          title="CAGR" 
          value={`${(stats.cagr * 100).toFixed(2)}%`}
          subtext="Compound Annual Growth Rate"
          icon={TrendingUp}
          color="text-emerald-500"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Average Trade</h3>
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <span className="text-gray-600">Average Win</span>
                    <span className="text-green-600 font-medium">+${stats.average_win.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-600">Average Loss</span>
                    <span className="text-red-600 font-medium">${stats.average_loss.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t">
                    <span className="text-gray-600">Risk/Reward Ratio</span>
                    <span className="font-medium">
                        {stats.average_loss !== 0 ? Math.abs(stats.average_win / stats.average_loss).toFixed(2) : "N/A"}
                    </span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
