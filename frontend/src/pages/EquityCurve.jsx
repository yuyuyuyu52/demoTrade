import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const API_URL = '/api';

export default function EquityCurve() {
  const { user } = useAuth();
  const [equityHistory, setEquityHistory] = useState([]);

  useEffect(() => {
    if (user) {
      fetchEquityHistory();
      const interval = setInterval(fetchEquityHistory, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fetchEquityHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/accounts/${user.id}/equity-history`);
      setEquityHistory(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const data = {
    labels: equityHistory.map(h => new Date(h.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Equity',
        data: equityHistory.map(h => h.equity),
        borderColor: 'rgb(79, 70, 229)',
        backgroundColor: 'rgba(79, 70, 229, 0.5)',
        tension: 0.1,
        pointRadius: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Account Equity Over Time',
      },
    },
    scales: {
      y: {
        beginAtZero: false,
      },
    },
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md h-[600px]">
      <Line options={options} data={data} />
    </div>
  );
}
