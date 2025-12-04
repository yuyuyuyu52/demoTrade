import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, History, LineChart, Calendar, BarChart2 } from 'lucide-react';

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();

  const navigation = [
    { name: 'Trading', href: '/', icon: LayoutDashboard },
    { name: 'History', href: '/history', icon: History },
    { name: 'Equity Curve', href: '/equity', icon: LineChart },
    { name: 'Calendar', href: '/calendar', icon: Calendar },
    { name: 'Statistics', href: '/statistics', icon: BarChart2 },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-indigo-600">DemoTrade</h1>
        </div>
        <nav className="flex-1 px-4 pb-4 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
