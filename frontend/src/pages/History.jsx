import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '';

export default function History() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [positionHistory, setPositionHistory] = useState([]);

  useEffect(() => {
    if (user) {
      fetchOrders();
      fetchPositionHistory();
      const interval = setInterval(() => {
        fetchOrders();
        fetchPositionHistory();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API_URL}/orders/?account_id=${user.id}`);
      setOrders(res.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (error) {
      console.error(error);
    }
  };

  const fetchPositionHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/accounts/${user.id}/position-history`);
      setPositionHistory(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const formatNumber = (num) => num ? Number(num).toFixed(2) : '0.00';
  const formatQuantity = (num) => num ? parseFloat(Number(num).toFixed(6)) : 0;
  const formatDate = (dateStr) => new Date(dateStr).toLocaleTimeString();

  return (
    <div className="space-y-8">
      {/* Position History */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Position History</h2>
          <button onClick={fetchPositionHistory} className="text-sm text-blue-500 hover:underline">Refresh</button>
        </div>
        <div className="overflow-y-auto max-h-96">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b">
                <th className="py-2">Symbol</th>
                <th className="py-2">Side</th>
                <th className="py-2">Entry</th>
                <th className="py-2">Exit</th>
                <th className="py-2">PNL</th>
                <th className="py-2">Fee</th>
                <th className="py-2">Net PNL</th>
                <th className="py-2">Open Time</th>
                <th className="py-2">Close Time</th>
              </tr>
            </thead>
            <tbody>
              {positionHistory.map((hist) => (
                <tr key={hist.id} className="border-b last:border-0">
                  <td className="py-2">{hist.symbol}</td>
                  <td className={`py-2 ${hist.side === 'LONG' ? 'text-green-600' : 'text-red-600'}`}>{hist.side}</td>
                  <td className="py-2">${formatNumber(hist.entry_price)}</td>
                  <td className="py-2">${formatNumber(hist.exit_price)}</td>
                  <td className={`py-2 ${hist.realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${formatNumber(hist.realized_pnl)}
                  </td>
                  <td className="py-2 text-red-500">-${formatNumber(hist.total_fee)}</td>
                  <td className={`py-2 ${(hist.realized_pnl - hist.total_fee) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${formatNumber(hist.realized_pnl - hist.total_fee)}
                  </td>
                  <td className="py-2 text-gray-500">{formatDate(hist.created_at)}</td>
                  <td className="py-2 text-gray-500">{formatDate(hist.closed_at)}</td>
                </tr>
              ))}
              {positionHistory.length === 0 && (
                <tr><td colSpan="9" className="py-4 text-center text-gray-500 italic">No position history</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order History */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Order History</h2>
          <button onClick={fetchOrders} className="text-sm text-blue-500 hover:underline">Refresh</button>
        </div>
        <div className="overflow-y-auto max-h-96">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b">
                <th className="py-2">Created</th>
                <th className="py-2">Updated</th>
                <th className="py-2">Symbol</th>
                <th className="py-2">Side</th>
                <th className="py-2">Type</th>
                <th className="py-2">Limit Price</th>
                <th className="py-2">Exec Price</th>
                <th className="py-2">Qty</th>
                <th className="py-2">Fee</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b last:border-0">
                  <td className="py-2 text-xs text-gray-500">{formatDate(order.created_at)}</td>
                  <td className="py-2 text-xs text-gray-500">{order.status !== 'NEW' ? formatDate(order.updated_at) : '-'}</td>
                  <td className="py-2">{order.symbol}</td>
                  <td className={`py-2 ${order.side === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>{order.side}</td>
                  <td className="py-2">{order.order_type}</td>
                  <td className="py-2">{order.limit_price ? formatNumber(order.limit_price) : '-'}</td>
                  <td className="py-2">{order.price > 0 ? formatNumber(order.price) : '-'}</td>
                  <td className="py-2">{formatQuantity(order.filled_quantity)}/{formatQuantity(order.quantity)}</td>
                  <td className="py-2 text-red-500">-${formatNumber(order.fee)}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      order.status === 'NEW' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'FILLED' ? 'bg-green-100 text-green-800' :
                      order.status === 'PARTIALLY_FILLED' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
