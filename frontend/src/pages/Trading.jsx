import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

export default function Trading() {
  const { user } = useAuth();
  const [account, setAccount] = useState(null);
  const [prices, setPrices] = useState({});
  const [orderForm, setOrderForm] = useState({
    symbol: 'BTCUSDT',
    order_type: 'MARKET',
    quantity: 0.01,
    price: 30000,
    leverage: 20,
    take_profit_price: '',
    stop_loss_price: ''
  });
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null); // { text, type: 'success'|'error' }
  const [initialLoad, setInitialLoad] = useState(true);
  const [tpSlModal, setTpSlModal] = useState({
    isOpen: false,
    position: null,
    take_profit_price: '',
    stop_loss_price: ''
  });

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (user) {
      fetchAccount();
      const interval = setInterval(fetchAccount, 2000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAccount = async () => {
    try {
      const res = await axios.get(`${API_URL}/accounts/${user.id}`);
      setAccount(res.data);
      if (initialLoad && res.data) {
        setOrderForm(prev => ({ ...prev, leverage: res.data.leverage || 20 }));
        setInitialLoad(false);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const saveLeverage = async (newLeverage) => {
    try {
      await axios.patch(`${API_URL}/accounts/${user.id}`, { leverage: newLeverage });
    } catch (error) {
      console.error("Failed to save leverage", error);
    }
  };

  const handleLeverageChange = (e) => {
    const newLeverage = parseInt(e.target.value);
    setOrderForm(prev => ({ ...prev, leverage: newLeverage }));
  };

  const handleLeverageCommit = () => {
    saveLeverage(orderForm.leverage);
  };

  const fetchPrices = async () => {
    try {
      const res = await axios.get(`${API_URL}/market/prices`);
      setPrices(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const placeOrder = async (side) => {
    setLoading(true);
    try {
      const payload = {
        account_id: user.id,
        symbol: orderForm.symbol,
        side: side,
        order_type: orderForm.order_type,
        quantity: parseFloat(orderForm.quantity),
        price: orderForm.order_type === 'LIMIT' ? parseFloat(orderForm.price) : null,
        leverage: parseInt(orderForm.leverage),
        take_profit_price: orderForm.take_profit_price ? parseFloat(orderForm.take_profit_price) : null,
        stop_loss_price: orderForm.stop_loss_price ? parseFloat(orderForm.stop_loss_price) : null
      };
      await axios.post(`${API_URL}/orders/`, payload);
      setNotification({ text: 'Order placed successfully!', type: 'success' });
      fetchAccount();
    } catch (error) {
      setNotification({ text: 'Failed to place order: ' + (error.response?.data?.detail || error.message), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const closePosition = async (pos) => {
    // Removed window.confirm for one-click close
    setLoading(true);
    try {
      const side = pos.quantity > 0 ? 'SELL' : 'BUY';
      const payload = {
        account_id: user.id,
        symbol: pos.symbol,
        side: side,
        order_type: 'MARKET',
        quantity: Math.abs(pos.quantity),
        leverage: pos.leverage
      };
      await axios.post(`${API_URL}/orders/`, payload);
      setNotification({ text: `Position ${pos.symbol} closed successfully!`, type: 'success' });
      fetchAccount();
    } catch (error) {
      setNotification({ text: 'Failed to close position: ' + (error.response?.data?.detail || error.message), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const openTpSlModal = (pos) => {
    setTpSlModal({
      isOpen: true,
      position: pos,
      take_profit_price: pos.take_profit_price || '',
      stop_loss_price: pos.stop_loss_price || ''
    });
  };

  const closeTpSlModal = () => {
    setTpSlModal({
      isOpen: false,
      position: null,
      take_profit_price: '',
      stop_loss_price: ''
    });
  };

  const submitTpSl = async () => {
    if (!tpSlModal.position) return;
    setLoading(true);
    try {
      const payload = {
        take_profit_price: tpSlModal.take_profit_price ? parseFloat(tpSlModal.take_profit_price) : null,
        stop_loss_price: tpSlModal.stop_loss_price ? parseFloat(tpSlModal.stop_loss_price) : null
      };
      await axios.patch(`${API_URL}/positions/${tpSlModal.position.id}`, payload);
      setNotification({ text: 'TP/SL updated successfully!', type: 'success' });
      fetchAccount();
      closeTpSlModal();
    } catch (error) {
      setNotification({ text: 'Failed to update TP/SL: ' + (error.response?.data?.detail || error.message), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => num ? Number(num).toFixed(2) : '0.00';
  const formatQuantity = (num) => num ? parseFloat(Number(num).toFixed(6)) : 0;
  const formatDate = (dateStr) => new Date(dateStr).toLocaleTimeString();

  if (!account) return <div>Loading account...</div>;

  return (
    <div className="space-y-8 relative">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-xl z-[100] text-sm font-semibold animate-fade-in-down border ${notification.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
          }`}>
          {notification.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Place Order */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Place Order</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Symbol</label>
              <select
                value={orderForm.symbol}
                onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value })}
                className="mt-1 block w-full border p-2 rounded"
              >
                <option value="BTCUSDT">BTCUSDT</option>
                <option value="ETHUSDT">ETHUSDT</option>
                <option value="SOLUSDT">SOLUSDT</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={orderForm.order_type}
                  onChange={(e) => setOrderForm({ ...orderForm, order_type: e.target.value })}
                  className="mt-1 block w-full border p-2 rounded"
                >
                  <option value="MARKET">MARKET</option>
                  <option value="LIMIT">LIMIT</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Leverage ({orderForm.leverage}x)</label>
                <input
                  type="range"
                  min="1"
                  max="125"
                  value={orderForm.leverage}
                  onChange={handleLeverageChange}
                  onMouseUp={handleLeverageCommit}
                  onTouchEnd={handleLeverageCommit}
                  className="mt-1 block w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Quantity</label>
              <input
                type="number"
                step="0.001"
                value={orderForm.quantity}
                onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
                className="mt-1 block w-full border p-2 rounded"
              />
            </div>
            {orderForm.order_type === 'LIMIT' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={orderForm.price}
                  onChange={(e) => setOrderForm({ ...orderForm, price: e.target.value })}
                  className="mt-1 block w-full border p-2 rounded"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Take Profit</label>
                <input
                  type="number"
                  step="0.01"
                  value={orderForm.take_profit_price}
                  onChange={(e) => setOrderForm({ ...orderForm, take_profit_price: e.target.value })}
                  className="mt-1 block w-full border p-2 rounded"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Stop Loss</label>
                <input
                  type="number"
                  step="0.01"
                  value={orderForm.stop_loss_price}
                  onChange={(e) => setOrderForm({ ...orderForm, stop_loss_price: e.target.value })}
                  className="mt-1 block w-full border p-2 rounded"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => placeOrder('BUY')}
                disabled={loading}
                className="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Processing...' : 'Long / Buy'}
              </button>
              <button
                onClick={() => placeOrder('SELL')}
                disabled={loading}
                className="w-full bg-red-600 text-white py-3 rounded font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Processing...' : 'Short / Sell'}
              </button>
            </div>
          </div>
        </div>

        {/* Market Prices */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Market Prices</h2>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(prices).map(([symbol, price]) => (
              <div key={symbol} className="bg-gray-50 p-4 rounded text-center">
                <div className="text-gray-600 font-medium">{symbol}</div>
                <div className="text-xl font-bold text-indigo-600">${formatNumber(price)}</div>
              </div>
            ))}
            {Object.keys(prices).length === 0 && (
              <div className="col-span-3 text-center text-gray-500 italic">Waiting for price data...</div>
            )}
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Account</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-gray-600">Wallet Balance</p>
            <p className="font-bold text-gray-800">${formatNumber(account.balance)}</p>
          </div>
          <div>
            <p className="text-gray-600">Unrealized PNL</p>
            <p className={`font-bold ${account.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${formatNumber(account.unrealized_pnl)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Equity</p>
            <p className="font-bold text-blue-600">${formatNumber(account.equity)}</p>
          </div>
        </div>

        <h3 className="font-semibold mt-4 mb-2">Positions</h3>
        {(!account?.positions?.length) ? (
          <div className="text-gray-500 italic">No open positions</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2">Symbol</th>
                <th className="py-2">Size</th>
                <th className="py-2">Entry Price</th>
                <th className="py-2">Mark Price</th>
                <th className="py-2">Value</th>
                <th className="py-2">TP/SL</th>
                <th className="py-2">PNL</th>
                <th className="py-2">Lev.</th>
                <th className="py-2">Open Time</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {account.positions.map((pos) => (
                <tr key={pos.symbol} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="py-2">{pos.symbol}</td>
                  <td className={`py-2 ${pos.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatQuantity(pos.quantity)}
                  </td>
                  <td className="py-2">${formatNumber(pos.entry_price)}</td>
                  <td className="py-2">${formatNumber(prices[pos.symbol] || 0)}</td>
                  <td className="py-2">${formatNumber(Math.abs(pos.quantity * pos.entry_price))}</td>
                  <td className="py-2 text-xs">
                    {pos.take_profit_price ? formatNumber(pos.take_profit_price) : '-'} / {pos.stop_loss_price ? formatNumber(pos.stop_loss_price) : '-'}
                  </td>
                  <td className={`py-2 ${pos.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${formatNumber(pos.unrealized_pnl)}
                  </td>
                  <td className="py-2">{pos.leverage}x</td>
                  <td className="py-2 text-xs text-gray-500">{formatDate(pos.created_at)}</td>
                  <td className="py-2">
                    <button
                      onClick={() => openTpSlModal(pos)}
                      className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 mr-2 transition-colors"
                    >
                      TP/SL
                    </button>
                    <button
                      onClick={() => closePosition(pos)}
                      className="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600 transition-colors"
                    >
                      Close
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* TP/SL Modal */}
      {tpSlModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white p-6 rounded-lg shadow-lg w-96 transform transition-all scale-100">
            <h3 className="text-lg font-semibold mb-4">Edit TP/SL for {tpSlModal.position?.symbol}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Take Profit</label>
                <input
                  type="number"
                  step="0.01"
                  value={tpSlModal.take_profit_price}
                  onChange={(e) => setTpSlModal({ ...tpSlModal, take_profit_price: e.target.value })}
                  className="mt-1 block w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Stop Loss</label>
                <input
                  type="number"
                  step="0.01"
                  value={tpSlModal.stop_loss_price}
                  onChange={(e) => setTpSlModal({ ...tpSlModal, stop_loss_price: e.target.value })}
                  className="mt-1 block w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional"
                />
              </div>
              <div className="flex justify-end space-x-2 mt-4">
                <button
                  onClick={closeTpSlModal}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitTpSl}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
