import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, History, LineChart, Calendar, BarChart2, TrendingUp, Menu, ChevronLeft } from 'lucide-react';

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = React.useState(true);

  const navigation = [
    { name: 'Trading', href: '/', icon: LayoutDashboard },
    { name: 'Chart', href: '/chart', icon: TrendingUp },
    { name: 'History', href: '/history', icon: History },
    { name: 'Equity Curve', href: '/equity', icon: LineChart },
    { name: 'Calendar', href: '/calendar', icon: Calendar },
    { name: 'Statistics', href: '/statistics', icon: BarChart2 },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex relative">
      {/* Sidebar Toggle Button (Visible when closed) */}
      {!isSidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md text-gray-600 hover:text-indigo-600 hover:bg-gray-50 ring-1 ring-gray-200"
          title="Open Sidebar"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Sidebar */}
      <div
        className={`bg-white shadow-md flex flex-col transition-all duration-300 ease-in-out relative ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full opacity-0 overflow-hidden'
          }`}
      >
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600 whitespace-nowrap overflow-hidden">DemoTrade</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 pb-4 space-y-2 overflow-y-auto overflow-x-hidden">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto transition-all duration-300">
        <div className={`transition-all duration-300 ${isSidebarOpen ? 'p-8' : 'p-8 pt-16'}`}>
          {/* If sidebar is closed, add top padding so the toggle button doesn't overlap content immediately? 
                Actually, 'absolute' toggle button will float over. 
                Maybe adjusting padding isn't strictly necessary but nice. 
                Let's stick to p-8 but realize the button overlays.
             */}
          <Outlet />
        </div>
      </div>
    </div>
  );
}
