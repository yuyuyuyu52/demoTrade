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
  const [monthlyPnl, setMonthlyPnl] = useState(0);

  useEffect(() => {
    if (user) {
      fetchDailyPnl();
    }
  }, [user, currentDate]);

  const getCalendarRange = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) to 6 (Sat)
    
    // Calculate start date (Sunday of the first week)
    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - startDayOfWeek);
    
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const endDayOfWeek = lastDayOfMonth.getDay();
    
    // Calculate end date (Saturday of the last week)
    const endDate = new Date(lastDayOfMonth);
    endDate.setDate(endDate.getDate() + (6 - endDayOfWeek));
    
    return { startDate, endDate };
  };

  const fetchDailyPnl = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getCalendarRange();
      
      // Format dates as YYYY-MM-DD
      const formatDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      const res = await axios.get(`${API_URL}/accounts/${user.id}/daily-pnl`, {
        params: {
          start_date: startStr,
          end_date: endStr
        }
      });
      
      const pnlMap = {};
      res.data.forEach(item => {
        pnlMap[item.date] = item.pnl;
      });

      // Pre-fill every day in range with 0 so missing days show 0
      const iter = new Date(startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      while (iter <= endDate) {
        const y = iter.getFullYear();
        const m = String(iter.getMonth() + 1).padStart(2, '0');
        const d = String(iter.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${d}`;
        // Only backfill days up to today; future days stay empty
        if (!(key in pnlMap) && iter <= today) {
          pnlMap[key] = 0;
        }
        iter.setDate(iter.getDate() + 1);
      }
      setDailyPnl(pnlMap);

      // Calculate Monthly PNL (only for days in the current month)
      let mPnl = 0;
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();
      
      res.data.forEach(item => {
        const itemDate = new Date(item.date);
        if (itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear) {
          mPnl += item.pnl;
        }
      });
      setMonthlyPnl(mPnl);

    } catch (error) {
      console.error("Failed to fetch daily PNL", error);
    } finally {
      setLoading(false);
    }
  };

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

  // Generate calendar grid data
  const generateCalendarWeeks = () => {
    const { startDate, endDate } = getCalendarRange();
    const weeks = [];
    let currentWeek = [];
    let iterDate = new Date(startDate);

    while (iterDate <= endDate) {
      const dateStr = `${iterDate.getFullYear()}-${String(iterDate.getMonth() + 1).padStart(2, '0')}-${String(iterDate.getDate()).padStart(2, '0')}`;
      
      currentWeek.push({
        date: new Date(iterDate),
        dateStr: dateStr,
        day: iterDate.getDate(),
        isCurrentMonth: iterDate.getMonth() === currentDate.getMonth(),
        pnl: dailyPnl[dateStr]
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      
      iterDate.setDate(iterDate.getDate() + 1);
    }
    return weeks;
  };

  const weeks = generateCalendarWeeks();

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Trading Calendar</h2>
        
        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-sm text-gray-500">Monthly PNL</div>
            <div className={`text-xl font-bold ${getPnlColor(monthlyPnl)}`}>
              {monthlyPnl >= 0 ? '+' : ''}{formatNumber(monthlyPnl)}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-lg font-medium w-40 text-center">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-px bg-gray-200 border border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Weekly'].map(day => (
          <div key={day} className={`bg-gray-50 p-2 text-center text-sm font-medium ${day === 'Weekly' ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>
            {day}
          </div>
        ))}
        
        {weeks.map((week, weekIndex) => {
          const weeklyPnl = week.reduce((sum, day) => sum + (day.pnl || 0), 0);
          
          return (
            <React.Fragment key={weekIndex}>
              {week.map((day, dayIndex) => (
                <div 
                  key={`${weekIndex}-${dayIndex}`} 
                  className={`h-32 p-2 border-t border-l border-gray-100 flex flex-col justify-between ${getBgColor(day.pnl)} ${!day.isCurrentMonth ? 'opacity-50 bg-gray-50' : ''} hover:bg-gray-50 transition-colors`}
                >
                  <span className={`text-sm font-medium ${day.isCurrentMonth ? 'text-gray-700' : 'text-gray-400'}`}>
                    {day.day}
                  </span>
                  {day.pnl !== undefined && (
                    <div className="text-right">
                      <div className={`text-lg font-bold ${getPnlColor(day.pnl)}`}>
                        {day.pnl >= 0 ? '+' : ''}{formatNumber(day.pnl)}
                      </div>
                      <div className="text-xs text-gray-500">PNL</div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Weekly Summary Column */}
              <div className="h-32 p-2 border-t border-l border-gray-100 flex flex-col justify-center items-center bg-blue-50">
                <div className="text-xs text-blue-500 font-medium mb-1">Weekly PNL</div>
                <div className={`text-lg font-bold ${getPnlColor(weeklyPnl)}`}>
                  {weeklyPnl >= 0 ? '+' : ''}{formatNumber(weeklyPnl)}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
