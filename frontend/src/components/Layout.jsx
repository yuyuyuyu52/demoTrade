import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, History, LineChart, Calendar, BarChart2, TrendingUp, Menu, ChevronLeft, ChevronRight } from 'lucide-react';

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
      {/* Sidebar */}
      <div
        className={`bg-white shadow-md flex flex-col transition-all duration-300 ease-in-out border-r z-20 ${isSidebarOpen ? 'w-64' : 'w-20'
          }`}
      >
        {/* Sidebar Header */}
        <div className={`h-16 flex items-center flex-shrink-0 border-b px-4 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {isSidebarOpen && (
            <h1 className="text-xl font-bold text-indigo-600 whitespace-nowrap overflow-hidden">DemoTrade</h1>
          )}
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={isSidebarOpen ? "Collapse" : "Expand"}
          >
            {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 py-4 flex flex-col space-y-1 overflow-y-auto overflow-x-hidden">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                title={!isSidebarOpen ? item.name : ''}
                className={`flex items-center mx-2 px-2 py-2 rounded-md transition-colors ${isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  } ${isSidebarOpen ? '' : 'justify-center'}`}
              >
                <Icon size={22} className={`flex-shrink-0 ${isSidebarOpen ? 'mr-3' : ''}`} />
                {isSidebarOpen && (
                  <span className="text-sm font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200">
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto transition-all duration-300">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
