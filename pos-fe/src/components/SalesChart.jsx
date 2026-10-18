"use client";

import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

export default function SalesChart({ data }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setIsDark(root.dataset.theme === 'dark');
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const palette = isDark
    ? { surface: '#172235', text: '#e8eef7', border: '#33445e', grid: '#29384f', muted: '#a9b8ce', line: '#60a5fa' }
    : { surface: '#fff', text: '#1f2937', border: '#e5e7eb', grid: '#f3f4f6', muted: '#9ca3af', line: '#3b82f6' };
  const labels = data && data.length > 0
    ? data.map(item => item.label)
    : ['Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb', 'Mg'];

  const values = data && data.length > 0
    ? data.map(item => item.total)
    : [0, 0, 0, 0, 0, 0, 0];

  const chartData = {
    labels: labels,
    datasets: [
      {
        fill: true,
        label: 'Penjualan',
        data: values,
        borderColor: palette.line,
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
          return gradient;
        },
        pointBackgroundColor: palette.surface,
        pointBorderColor: palette.line,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: palette.surface,
        titleColor: palette.text,
        bodyColor: palette.text,
        borderColor: palette.border,
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: function (context) {
            return 'Rp ' + context.parsed.y.toLocaleString('id-ID');
          }
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: palette.grid },
        ticks: {
          color: palette.muted,
          font: { size: 10 },
          // Format angka jutaan/ribuan di sumbu Y
          callback: function (value) {
            if (value >= 1000000) return (value / 1000000) + 'jt';
            if (value >= 1000) return (value / 1000) + 'rb';
            return value;
          }
        }
      },
      x: {
        grid: { display: false },
        ticks: { color: palette.muted, font: { size: 10 } }
      }
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Line options={options} data={chartData} />
    </div>
  );
}
