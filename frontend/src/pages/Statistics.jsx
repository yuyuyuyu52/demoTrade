import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, TrendingDown, Activity, Percent, DollarSign, BarChart2 } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000';

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

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_URL}/accounts/${user.id}/statistics`);
      setStats(res.data);
    } catch (error) {
      console.error("Failed to fetch statistics", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading statistics...</div>;
  if (!stats) return <div className="p-8 text-center">No statistics available.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Trading Performance</h1>
      
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
          subtext={stats.profit_factor > 1.5 ? "Excellent" : stats.profit_factor > 1 ? "Profitable" : "Unprofitable"}
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
