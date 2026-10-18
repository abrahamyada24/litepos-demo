"use client";

import React, { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import {
  DollarSign, ShoppingCart, TrendingUp, AlertTriangle,
  Calendar, ArrowRight, Package, Eye, Loader2,
  Sun, Moon, Sunset, CloudSun,
  Clock, PlayCircle, StopCircle, X,
  BarChart3, Users, LayoutGrid, QrCode,
  CheckCircle2, AlertCircle, Timer
} from 'lucide-react';
import Link from 'next/link';
import { useStore } from '../../store/useStore';
import { showAlert } from '../../utils/swal';
import { getPosPendingTransactions } from '../../utils/savedTransactions';
import CurrencyInput from '../../components/CurrencyInput';

const SalesChart = lazy(() => import('../../components/SalesChart'));

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// ─── Greeting helper ────────────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Selamat Pagi', icon: Sun, gradient: 'from-amber-400 to-orange-500' };
  if (hour < 15) return { text: 'Selamat Siang', icon: CloudSun, gradient: 'from-sky-400 to-blue-500' };
  if (hour < 18) return { text: 'Selamat Sore', icon: Sunset, gradient: 'from-orange-400 to-rose-500' };
  return { text: 'Selamat Malam', icon: Moon, gradient: 'from-indigo-500 to-purple-600' };
}

// ─── Skeleton components ────────────────────────────────────────────
const CardSkeleton = () => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-pulse">
    <div className="flex justify-between items-start mb-4">
      <div className="w-12 h-12 bg-gray-100 rounded-xl"></div>
      <div className="w-16 h-6 bg-gray-50 rounded-full"></div>
    </div>
    <div className="space-y-2">
      <div className="h-3 w-20 bg-gray-100 rounded-md"></div>
      <div className="h-8 w-28 bg-gray-200 rounded-md"></div>
    </div>
  </div>
);

const ChartSkeleton = () => (
  <div className="card-base p-6 lg:col-span-2 min-h-[400px] bg-white border border-gray-100 animate-pulse">
    <div className="flex justify-between mb-8">
      <div className="space-y-2">
        <div className="h-6 w-48 bg-gray-200 rounded-md"></div>
        <div className="h-3 w-32 bg-gray-100 rounded-md"></div>
      </div>
    </div>
    <div className="w-full h-64 bg-gray-50 rounded-2xl"></div>
  </div>
);

const ListSkeleton = () => (
  <div className="card-base p-5 bg-white border border-gray-100 animate-pulse space-y-4">
    <div className="h-6 w-32 bg-gray-200 rounded-md mb-4"></div>
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex gap-3 items-center">
        <div className="w-10 h-10 bg-gray-100 rounded-lg"></div>
        <div className="flex-1 space-y-2">
          <div className="h-3 w-full bg-gray-100 rounded-md"></div>
          <div className="h-2 w-20 bg-gray-50 rounded-md"></div>
        </div>
      </div>
    ))}
  </div>
);

const TableSkeleton = () => (
  <div className="card-base bg-white border border-gray-100 animate-pulse">
    <div className="p-6 h-16 bg-gray-50/50 border-b border-gray-100"></div>
    <div className="p-6 space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-10 w-full bg-gray-50 rounded-lg"></div>
      ))}
    </div>
  </div>
);

// ─── Modal Overlay ──────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Quick Action Card ──────────────────────────────────────────────
function QuickActionCard({ icon: Icon, label, href, gradient }) {
  return (
    <Link href={href} className="group">
      <div className="relative p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300`}></div>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 shadow-lg shadow-${gradient.split('-')[1]}/20`}>
          <Icon size={22} className="text-white" />
        </div>
        <p className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">{label}</p>
      </div>
    </Link>
  );
}

// ─── Shift Banner ───────────────────────────────────────────────────
function ShiftBanner({ shift, onOpenShift, onCloseShift, loading }) {
  const formatRp = (num) => "Rp " + (Number(num) || 0).toLocaleString('id-ID');
  const formatTime = (dateStr) => new Date(dateStr).toLocaleString('id-ID', {
    hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'
  });

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 animate-pulse">
        <div className="h-5 w-40 bg-gray-200 rounded-md mb-2"></div>
        <div className="h-4 w-56 bg-gray-100 rounded-md"></div>
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="relative rounded-2xl border border-dashed border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-100/30 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-amber-800 text-sm">Belum ada shift aktif</p>
              <p className="text-amber-600 text-xs mt-0.5">Buka shift untuk mulai mencatat transaksi</p>
            </div>
          </div>
          <button
            onClick={onOpenShift}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-200 hover:shadow-xl hover:shadow-amber-300 transition-all duration-300 hover:-translate-y-0.5"
          >
            <PlayCircle size={16} />
            Buka Shift
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 p-5 overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-blue-100/20 rounded-full -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-100/20 rounded-full translate-y-1/2 -translate-x-1/2"></div>
      <div className="flex items-center justify-between relative flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-blue-800 text-sm">Shift Aktif</p>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-[10px] font-bold uppercase">Live</span>
            </div>
            <p className="text-blue-600 text-xs mt-0.5">
              Kas Awal: {formatRp(shift.openingCash)} • Dibuka: {formatTime(shift.openedAt)}
              {shift.userName && ` • Oleh: ${shift.userName}`}
            </p>
          </div>
        </div>
        <button
          onClick={onCloseShift}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-200 hover:shadow-xl hover:shadow-red-300 transition-all duration-300 hover:-translate-y-0.5"
        >
          <StopCircle size={16} />
          Tutup Shift
        </button>
      </div>
    </div>
  );
}

// ─── Pending Sales Alert ────────────────────────────────────────────
function PendingSalesAlert({ count }) {
  if (!count || count === 0) return null;
  return (
    <div className="relative rounded-2xl border border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50 p-4 overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-100/30 rounded-full -translate-y-1/2 translate-x-1/2"></div>
      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center">
            <Timer size={18} className="text-yellow-600" />
          </div>
          <div>
            <p className="font-bold text-yellow-800 text-sm">🕐 {count} Penjualan Pending</p>
            <p className="text-yellow-600 text-xs mt-0.5">Keranjang kasir tersimpan dan belum dibayar</p>
          </div>
        </div>
        <Link
          href="/pos?openSaved=1"
          className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500 text-white rounded-xl text-sm font-bold hover:bg-yellow-600 transition-colors shadow-sm"
        >
          Buka di POS
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

// ─── Pre-Order Card ─────────────────────────────────────────────────
function PreOrderCard({ order, onConfirm, confirming }) {
  const now = new Date();
  const pickupDate = new Date(order.pickupDate || order.preOrderDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const orderDay = new Date(pickupDate.getFullYear(), pickupDate.getMonth(), pickupDate.getDate());

  let statusColor, statusLabel;
  if (orderDay < today) {
    statusColor = 'bg-red-50 border-red-200 text-red-700';
    statusLabel = 'Terlambat';
  } else if (orderDay.getTime() === today.getTime()) {
    statusColor = 'bg-orange-50 border-orange-200 text-orange-700';
    statusLabel = 'Hari Ini';
  } else {
    statusColor = 'bg-blue-50 border-blue-200 text-blue-700';
    statusLabel = 'Mendatang';
  }

  const itemsSummary = (order.items || []).slice(0, 3).map(i => `${i.product?.name || i.productName || 'Item'} x${i.qty}`).join(', ');

  return (
    <div className={`rounded-xl border p-4 ${statusColor} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-bold text-sm truncate">{order.customer?.name || order.customerName || 'Customer'}</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}`}>{statusLabel}</span>
          </div>
          <p className="text-xs opacity-80 truncate">{itemsSummary || 'Tidak ada detail item'}</p>
          <p className="text-xs opacity-60 mt-1 flex items-center gap-1">
            <Clock size={12} />
            Pickup: {pickupDate.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button
          onClick={() => onConfirm(order.id)}
          disabled={confirming === order.id}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white/80 hover:bg-white rounded-lg text-xs font-bold transition-colors border border-current/10 disabled:opacity-50"
        >
          {confirming === order.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Konfirmasi
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
  const user = useStore(state => state.user);
  const settings = useStore(state => state.settings);

  const [stats, setStats] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // AndroidPos features state
  const [activeShift, setActiveShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [savedTrxCount, setSavedTrxCount] = useState(0);
  const [preOrders, setPreOrders] = useState([]);
  const [confirmingPreOrder, setConfirmingPreOrder] = useState(null);

  // Modal state
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [closeShiftModal, setCloseShiftModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [shiftActionLoading, setShiftActionLoading] = useState(false);

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;
  const userName = user?.name || 'User';
  const userRole = user?.role || '';
  const isAdminOrOwner = ['ADMIN', 'OWNER'].includes(userRole.toUpperCase());

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, []);

  // ── Fetch dashboard data ──
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [statsRes, trxRes] = await Promise.all([
          fetch(`${API_URL}/api/reports/dashboard?period=week`, { headers }),
          fetch(`${API_URL}/api/transactions?limit=5`, { headers })
        ]);

        const statsJson = await statsRes.json();
        const trxJson = await trxRes.json();

        if (statsJson.success) setStats(statsJson.data);
        if (trxJson.success) setRecentTransactions(trxJson.data);
      } catch (error) {
        console.error("Dashboard error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  // ── Fetch shift, saved transactions, pre-orders ──
  useEffect(() => {
    const loadAndroidPosData = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [shiftRes, savedRes, preOrderRes] = await Promise.allSettled([
          fetch(`${API_URL}/api/shifts/current`, { headers }),
          fetch(`${API_URL}/api/saved-transactions`, { headers }),
          fetch(`${API_URL}/api/transactions/pre-orders`, { headers })
        ]);

        // Active shift
        if (shiftRes.status === 'fulfilled' && shiftRes.value.ok) {
          const shiftJson = await shiftRes.value.json();
          if (shiftJson.success) setActiveShift(shiftJson.data || null);
        }

        // Saved transactions count
        if (savedRes.status === 'fulfilled' && savedRes.value.ok) {
          const savedJson = await savedRes.value.json();
          if (savedJson.success) {
            setSavedTrxCount(getPosPendingTransactions(savedJson.data).length);
          }
        }

        // Pre-orders
        if (preOrderRes.status === 'fulfilled' && preOrderRes.value.ok) {
          const preOrderJson = await preOrderRes.value.json();
          if (preOrderJson.success) {
            setPreOrders(Array.isArray(preOrderJson.data) ? preOrderJson.data : []);
          }
        }
      } catch (error) {
        console.error("AndroidPos data error:", error);
      } finally {
        setShiftLoading(false);
      }
    };

    loadAndroidPosData();
    const intervalId = window.setInterval(loadAndroidPosData, 15000);
    const handleRefresh = () => loadAndroidPosData();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadAndroidPosData();
    };
    window.addEventListener('focus', handleRefresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // ── Shift actions ──
  const handleOpenShift = async () => {
    setShiftActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/shifts/open`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          userId: user?.id,
          userName: user?.name,
          openingCash: parseFloat(openingCash) || 0
        })
      });
      const json = await res.json();
      if (json.success) {
        setActiveShift(json.data);
        setOpenShiftModal(false);
        setOpeningCash('');
      } else {
        showAlert.error('Gagal membuka shift', json.message || 'Coba lagi.');
      }
    } catch (err) {
      showAlert.error('Gagal membuka shift', err.message);
    } finally {
      setShiftActionLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;
    setShiftActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/shifts/${activeShift.id}/close`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ closingCash: parseFloat(closingCash) || 0 })
      });
      const json = await res.json();
      if (json.success) {
        setActiveShift(null);
        setCloseShiftModal(false);
        setClosingCash('');
        showAlert.success(
          'Shift berhasil ditutup',
          `Tunai ${formatRp(json.data.cashSales)} • Pengeluaran ${formatRp(json.data.cashExpenses)} • Selisih ${formatRp(json.data.difference)}`
        );
      } else {
        showAlert.error('Gagal menutup shift', json.message || 'Coba lagi.');
      }
    } catch (err) {
      showAlert.error('Gagal menutup shift', err.message);
    } finally {
      setShiftActionLoading(false);
    }
  };

  // ── Pre-order confirm ──
  const handleConfirmPreOrder = async (id) => {
    setConfirmingPreOrder(id);
    try {
      const res = await fetch(`${API_URL}/api/transactions/${id}/confirm-preorder`, {
        method: 'POST',
        headers: getHeaders()
      });
      const json = await res.json();
      if (json.success) {
        setPreOrders(prev => prev.filter(po => po.id !== id));
      } else {
        showAlert.error('Gagal konfirmasi pre-order', json.message || 'Coba lagi.');
      }
    } catch (err) {
      showAlert.error('Gagal konfirmasi pre-order', err.message);
    } finally {
      setConfirmingPreOrder(null);
    }
  };

  // ── Helpers ──
  const formatRp = (num) => "Rp " + (Number(num) || 0).toLocaleString('id-ID');
  const getImageUrl = (path) => path ? (path.startsWith('http') ? path : `${API_URL}${path}`) : null;
  const formatDate = (dateStr) => new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });

  // ── Group pre-orders by date ──
  const groupedPreOrders = (() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const groups = { overdue: [], today: [], upcoming: [] };

    preOrders.forEach(po => {
      const pickupDate = new Date(po.pickupDate || po.preOrderDate);
      const orderDay = new Date(pickupDate.getFullYear(), pickupDate.getMonth(), pickupDate.getDate());

      if (orderDay < today) groups.overdue.push(po);
      else if (orderDay.getTime() === today.getTime()) groups.today.push(po);
      else groups.upcoming.push(po);
    });

    return groups;
  })();

  const hasPreOrders = preOrders.length > 0;

  return (
    <div className="space-y-6 pb-10">
      {/* ── Greeting Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-2">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${greeting.gradient} flex items-center justify-center shadow-lg`}>
            <GreetingIcon size={28} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {greeting.text}, <span className={`bg-gradient-to-r ${greeting.gradient} bg-clip-text text-transparent`}>{userName}</span>!
            </h2>
            <p className="text-gray-500 text-sm mt-0.5">Ringkasan performa bisnis hari ini</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 shadow-sm">
          <Calendar size={14} />
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* ── Quick Actions (ADMIN/OWNER only) ── */}
      {isAdminOrOwner && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <QuickActionCard icon={ShoppingCart} label="Buka Kasir" href="/pos" gradient="from-blue-500 to-indigo-600" />
          <QuickActionCard icon={BarChart3} label="Laporan" href="/reports" gradient="from-emerald-500 to-teal-600" />
          <QuickActionCard icon={Package} label="Kelola Data" href="/products" gradient="from-violet-500 to-purple-600" />
          <QuickActionCard icon={Users} label="Kontak" href="/customers" gradient="from-rose-500 to-pink-600" />
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !stats ? (
          <>
            <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
          </>
        ) : (
          <>
            <StatCardItem title="Total Penjualan" value={formatRp(stats.summary.todayRevenue)} subtitle="Pendapatan hari ini" icon={DollarSign} trend="up" trendValue="Realtime" color="blue" />
            <StatCardItem title="Transaksi Selesai" value={stats.summary.todayCount} subtitle="Penjualan berhasil" icon={ShoppingCart} trend="up" trendValue="Hari ini" color="blue" />
            <StatCardItem title="Gross Profit" value={formatRp(stats.summary.grossProfit)} subtitle="Margin (Jual - Modal)" icon={TrendingUp} trend="up" trendValue="Profit" color="green" />
            <StatCardItem title="Stok Menipis" value={`${stats.summary.lowStockCount} Item`} subtitle="Perlu restock segera" icon={AlertTriangle} trend="down" trendValue="Warning" isAlert={true} color="red" />
          </>
        )}
      </div>

      {/* ── Shift Management Banner ── */}
      {settings?.enableShift === true && (
        <ShiftBanner
          shift={activeShift}
          loading={shiftLoading}
          onOpenShift={() => setOpenShiftModal(true)}
          onCloseShift={() => setCloseShiftModal(true)}
        />
      )}

      {/* ── Pending Sales Alert ── */}
      <PendingSalesAlert count={savedTrxCount} />

      {/* ── Chart + Sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loading || !stats ? <ChartSkeleton /> : (
            <div className="card-base p-6 bg-white h-full flex flex-col border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-bold text-lg text-gray-800">Analitik Pendapatan</h3>
                  <p className="text-xs text-gray-400">Tren penjualan 7 hari terakhir</p>
                </div>
                <Link href="/reports" className="text-xs text-blue-500 font-bold hover:underline bg-blue-50 px-3 py-1.5 rounded-lg">
                  Lihat Laporan
                </Link>
              </div>
              <div className="flex-1 w-full min-h-[300px]">
                <Suspense fallback={<div className="h-full w-full flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>}>
                  <SalesChart data={stats.chart || []} />
                </Suspense>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {loading || !stats ? <ListSkeleton /> : (
            <div className="card-base p-5 bg-white border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-red-600 font-bold">
                  <AlertTriangle size={18} />
                  <h3>Stok Kritis</h3>
                </div>
                <Link href="/stock" className="text-[10px] text-gray-400 hover:text-gray-600">Lihat Gudang</Link>
              </div>
              <div className="space-y-3">
                {(stats.lowStockProducts || []).length === 0 ? (
                  <div className="text-center py-6 bg-green-50 rounded-xl border border-green-100">
                    <p className="text-green-600 font-bold text-sm">Stok Aman 👍</p>
                  </div>
                ) : (
                  (stats.lowStockProducts || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg bg-white overflow-hidden flex-shrink-0">
                          {item.imageUrl ? <img src={getImageUrl(item.imageUrl)} className="w-full h-full object-cover" /> : <Package size={14} className="m-2 text-red-200" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 text-xs truncate">{item.name}</p>
                          <p className="text-red-500 text-[10px] font-medium">Sisa: {item.stock}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {loading || !stats ? <ListSkeleton /> : (
            <div className="card-base p-5 bg-white border border-gray-200 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-4">Produk Terlaris</h3>
              <div className="space-y-4">
                {(stats.topProducts || []).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 relative border border-gray-200">
                        {item.imageUrl ? <img src={getImageUrl(item.imageUrl)} className="w-full h-full object-cover" /> : <Package size={14} className="m-3 text-gray-300" />}
                        <div className="absolute bottom-0 right-0 bg-blue-500 text-white text-[8px] font-bold px-1 rounded-tl-md">#{idx + 1}</div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-700 truncate">{item.name}</p>
                        <p className="text-[10px] text-gray-400">{item.sold} terjual</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Pre-Order Section ── */}
      {hasPreOrders && (
        <div className="card-base bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Calendar size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-800">Pre-Order</h3>
                <p className="text-xs text-gray-400">{preOrders.length} pesanan menunggu konfirmasi</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            {/* Overdue */}
            {groupedPreOrders.overdue.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={16} className="text-red-500" />
                  <h4 className="font-bold text-red-700 text-sm">Terlambat ({groupedPreOrders.overdue.length})</h4>
                </div>
                <div className="space-y-3">
                  {groupedPreOrders.overdue.map(po => (
                    <PreOrderCard key={po.id} order={po} onConfirm={handleConfirmPreOrder} confirming={confirmingPreOrder} />
                  ))}
                </div>
              </div>
            )}

            {/* Today */}
            {groupedPreOrders.today.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={16} className="text-orange-500" />
                  <h4 className="font-bold text-orange-700 text-sm">Hari Ini ({groupedPreOrders.today.length})</h4>
                </div>
                <div className="space-y-3">
                  {groupedPreOrders.today.map(po => (
                    <PreOrderCard key={po.id} order={po} onConfirm={handleConfirmPreOrder} confirming={confirmingPreOrder} />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming */}
            {groupedPreOrders.upcoming.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={16} className="text-blue-500" />
                  <h4 className="font-bold text-blue-700 text-sm">Mendatang ({groupedPreOrders.upcoming.length})</h4>
                </div>
                <div className="space-y-3">
                  {groupedPreOrders.upcoming.map(po => (
                    <PreOrderCard key={po.id} order={po} onConfirm={handleConfirmPreOrder} confirming={confirmingPreOrder} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Recent Transactions Table ── */}
      <div className="mt-6">
        {loading ? <TableSkeleton /> : (
          <div className="card-base bg-white border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800">Transaksi Terakhir</h3>
              <Link href="/transactions" className="text-blue-500 text-sm font-bold hover:underline flex items-center gap-1">
                Lihat Semua <ArrowRight size={14} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Invoice</th>
                    <th className="px-6 py-4">Waktu</th>
                    <th className="px-6 py-4">Kasir</th>
                    <th className="px-6 py-4">Metode</th>
                    <th className="px-6 py-4">Total</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentTransactions.map((trx) => (
                    <tr key={trx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-800 font-mono text-xs">{trx.invoiceNumber}</td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{formatDate(trx.createdAt)}</td>
                      <td className="px-6 py-4 text-gray-700 font-medium text-xs">{trx.user?.name || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[9px] font-bold uppercase border border-gray-200">
                          {trx.payments?.[0]?.paymentType || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900 text-xs">{formatRp(trx.grandTotal)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide border ${trx.status === 'PAID' ? 'bg-green-50 text-green-600 border-green-100' :
                          trx.status === 'PENDING' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' :
                            'bg-red-50 text-red-600 border-red-100'
                          }`}>
                          {trx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Open Shift Modal ── */}
      <Modal open={openShiftModal} onClose={() => setOpenShiftModal(false)} title="Buka Shift Baru">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Kas Awal (Rp)</label>
            <CurrencyInput
              value={openingCash}
              onChange={setOpeningCash}
              placeholder="Contoh: 500.000"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1.5">Masukkan jumlah uang tunai di kasir saat ini</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setOpenShiftModal(false)}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleOpenShift}
              disabled={shiftActionLoading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:shadow-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {shiftActionLoading ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
              Buka Shift
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Close Shift Modal ── */}
      <Modal open={closeShiftModal} onClose={() => setCloseShiftModal(false)} title="Tutup Shift">
        <div className="space-y-4">
          {activeShift && (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Kas Awal</span>
                <span className="font-bold text-gray-800">{formatRp(activeShift.openingCash)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Dibuka</span>
                <span className="font-medium text-gray-700">
                  {new Date(activeShift.openedAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Kas Akhir (Rp)</label>
            <CurrencyInput
              value={closingCash}
              onChange={setClosingCash}
              placeholder="Hitung uang di kasir"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1.5">Masukkan jumlah uang tunai saat penutupan</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setCloseShiftModal(false)}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleCloseShift}
              disabled={shiftActionLoading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-200 hover:shadow-xl disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {shiftActionLoading ? <Loader2 size={16} className="animate-spin" /> : <StopCircle size={16} />}
              Tutup Shift
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCardItem({ title, value, subtitle, icon: Icon, trend, trendValue, isAlert, color }) {
  const colorMap = {
    orange: 'bg-blue-50 text-blue-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600'
  };

  return (
    <div className={`card-base p-6 bg-white border border-gray-200 rounded-2xl transition-all hover:shadow-md ${isAlert ? 'border-red-100 shadow-red-50' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${colorMap[color] || 'bg-gray-50 text-gray-600'}`}>
          <Icon size={24} />
        </div>
        {trend && (
          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {trendValue}
          </span>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
        <h3 className={`text-2xl font-black ${isAlert ? 'text-red-700' : 'text-gray-900'}`}>{value}</h3>
        <p className={`text-[10px] mt-1 font-medium ${isAlert ? 'text-red-500' : 'text-gray-400'}`}>{subtitle}</p>
      </div>
    </div>
  );
}
