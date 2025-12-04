import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = 'http://127.0.0.1:8000';

export default function Trading() {
  const { user } = useAuth();
  const [account, setAccount] = useState(null);
  const [prices, setPrices] = useState({});
  const [orderForm, setOrderForm] = useState({
    symbol: 'BTCUSDT',
    order_type: 'MARKET',
    quantity: 0.01,
    price: 30000,
    leverage: 20
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [initialLoad, setInitialLoad] = useState(true);

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
    setMessage({ text: '', type: '' });
    try {
      const payload = {
        account_id: user.id,
        symbol: orderForm.symbol,
        side: side,
        order_type: orderForm.order_type,
        quantity: parseFloat(orderForm.quantity),
        price: orderForm.order_type === 'LIMIT' ? parseFloat(orderForm.price) : null,
        leverage: parseInt(orderForm.leverage)
      };
      await axios.post(`${API_URL}/orders/`, payload);
      setMessage({ text: 'Order placed successfully!', type: 'success' });
      fetchAccount();
    } catch (error) {
      setMessage({ text: 'Failed to place order: ' + (error.response?.data?.detail || error.message), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const closePosition = async (pos) => {
    if (!window.confirm(`Are you sure you want to close ${pos.symbol} position?`)) return;
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
      setMessage({ text: `Position ${pos.symbol} closed successfully!`, type: 'success' });
      fetchAccount();
    } catch (error) {
      setMessage({ text: 'Failed to close position: ' + (error.response?.data?.detail || error.message), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => num ? Number(num).toFixed(2) : '0.00';
  const formatQuantity = (num) => num ? parseFloat(Number(num).toFixed(6)) : 0;
  const formatDate = (dateStr) => new Date(dateStr).toLocaleTimeString();

  if (!account) return <div>Loading account...</div>;

  return (
    <div className="space-y-8">
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
              <button
                onClick={() => placeOrder('BUY')}
                disabled={loading}
                className="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Long / Buy'}
              </button>
              <button
                onClick={() => placeOrder('SELL')}
                disabled={loading}
                className="w-full bg-red-600 text-white py-3 rounded font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Short / Sell'}
              </button>
            </div>
            {message.text && (
              <p className={`text-sm mt-2 ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {message.text}
              </p>
            )}
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
        {account.positions.length === 0 ? (
          <div className="text-gray-500 italic">No open positions</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2">Symbol</th>
                <th className="py-2">Size</th>
                <th className="py-2">Entry Price</th>
                <th className="py-2">Mark Price</th>
                <th className="py-2">PNL</th>
                <th className="py-2">Lev.</th>
                <th className="py-2">Open Time</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {account.positions.map((pos) => (
                <tr key={pos.symbol} className="border-b last:border-0">
                  <td className="py-2">{pos.symbol}</td>
                  <td className={`py-2 ${pos.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatQuantity(pos.quantity)}
                  </td>
                  <td className="py-2">${formatNumber(pos.entry_price)}</td>
                  <td className="py-2">${formatNumber(prices[pos.symbol] || 0)}</td>
                  <td className={`py-2 ${pos.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${formatNumber(pos.unrealized_pnl)}
                  </td>
                  <td className="py-2">{pos.leverage}x</td>
                  <td className="py-2 text-xs text-gray-500">{formatDate(pos.created_at)}</td>
                  <td className="py-2">
                    <button
                      onClick={() => closePosition(pos)}
                      className="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600"
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
    </div>
  );
}
