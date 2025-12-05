import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const API_URL = '/api';

export default function Calendar() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dailyPnl, setDailyPnl] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchDailyPnl();
    }
  }, [user, currentDate]);

  const fetchDailyPnl = async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const res = await axios.get(`${API_URL}/accounts/${user.id}/daily-pnl?year=${year}&month=${month}`);
      
      // Convert array to object for easier lookup: { "2023-10-01": 123.45 }
      const pnlMap = {};
      res.data.forEach(item => {
        pnlMap[item.date] = item.pnl;
      });
      setDailyPnl(pnlMap);
    } catch (error) {
      console.error("Failed to fetch daily PNL", error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { days, firstDay };
  };

  const { days, firstDay } = getDaysInMonth(currentDate);
  const daysArray = Array.from({ length: days }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const formatNumber = (num) => {
    return num ? Number(num).toFixed(2) : '0.00';
  };

  const getPnlColor = (pnl) => {
    if (!pnl) return 'text-gray-400';
    return pnl >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const getBgColor = (pnl) => {
    if (!pnl) return 'bg-white';
    return pnl >= 0 ? 'bg-green-50' : 'bg-red-50';
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Trading Calendar</h2>
        <div className="flex items-center space-x-4">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-lg font-medium">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="bg-gray-50 p-2 text-center text-sm font-medium text-gray-500">
            {day}
          </div>
        ))}
        
        {blanks.map((_, i) => (
          <div key={`blank-${i}`} className="bg-white h-32" />
        ))}

        {daysArray.map(day => {
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const pnl = dailyPnl[dateStr];
          
          return (
            <div key={day} className={`h-32 p-2 border-t border-l border-gray-100 flex flex-col justify-between ${getBgColor(pnl)} hover:bg-gray-50 transition-colors`}>
              <span className="text-sm font-medium text-gray-700">{day}</span>
              {pnl !== undefined && (
                <div className="text-right">
                  <div className={`text-lg font-bold ${getPnlColor(pnl)}`}>
                    {pnl >= 0 ? '+' : ''}{formatNumber(pnl)}
                  </div>
                  <div className="text-xs text-gray-500">PNL</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
