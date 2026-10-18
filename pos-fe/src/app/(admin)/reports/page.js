"use client";

import React, { useEffect, useState } from 'react';
import { 
    TrendingUp, Calendar, ChevronDown, DollarSign, Package,
    ArrowDownRight, ArrowUpRight, BarChart2, Users, Receipt,
    Clock, Loader2, ArrowRightLeft, CreditCard, Wallet, LayoutGrid
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import SalesChart from '@/components/SalesChart';
import StatCard from '@/components/StatCard';
import {
    buildReportExport,
    exportReportCsv,
    exportReportPdf,
} from '@/utils/reportExport';
import { showAlert } from '@/utils/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// --- Helper Components ---
const formatRp = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(num) || 0);

const TransactionDetailModal = ({ isOpen, onClose, transaction }) => {
    if (!isOpen || !transaction) return null;
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">Detail Transaksi</h3>
                        <p className="text-sm text-gray-500">{transaction.invoiceNumber}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-xl transition-colors">Tutup</button>
                </div>
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-gray-500">Waktu</p>
                            <p className="font-bold text-gray-800">{new Date(transaction.createdAt).toLocaleString('id-ID')}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Kasir</p>
                            <p className="font-bold text-gray-800">{transaction.user?.name || '-'}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Pelanggan</p>
                            <p className="font-bold text-gray-800">{transaction.customer?.name || transaction.customerName || 'Umum'}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Status</p>
                            <span className={`px-2 py-1 rounded text-xs font-bold ${transaction.status === 'PAID' ? 'bg-green-100 text-green-700' : transaction.status === 'RETURNED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                                {transaction.status}
                            </span>
                        </div>
                    </div>
                    
                    <div className="border-t border-gray-100 pt-4">
                        <h4 className="font-bold text-gray-800 mb-3">Item Pesanan</h4>
                        <div className="space-y-3">
                            {transaction.items?.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm">
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-800">{item.product?.name || 'Produk'}</p>
                                        <p className="text-gray-500">{item.qty} x {formatRp(item.price)}</p>
                                        {item.notes && <p className="text-xs text-gray-400 italic">Note: {item.notes}</p>}
                                    </div>
                                    <p className="font-bold text-gray-800">{formatRp(Number(item.price) * item.qty)}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
                        <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span>{formatRp(transaction.subTotal)}</span>
                        </div>
                        {Number(transaction.discountAmount) > 0 && (
                            <div className="flex justify-between text-red-500">
                                <span>Diskon</span>
                                <span>-{formatRp(transaction.discountAmount)}</span>
                            </div>
                        )}
                        {Number(transaction.taxAmount) > 0 && (
                            <div className="flex justify-between text-gray-500">
                                <span>Pajak</span>
                                <span>{formatRp(transaction.taxAmount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-lg text-gray-900 pt-2 border-t border-gray-100">
                            <span>Total</span>
                            <span>{formatRp(transaction.grandTotal)}</span>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <p className="text-sm font-bold text-gray-800 mb-2">Pembayaran</p>
                        {transaction.payments?.map((p, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                                <span className="text-gray-500">{p.paymentType}</span>
                                <span className="font-bold">{formatRp(p.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function ReportsPage() {
    const settings = useStore((state) => state.settings);
    const [activeTab, setActiveTab] = useState('TRANSAKSI');
    const [period, setPeriod] = useState('month');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [isCustomDate, setIsCustomDate] = useState(false);
    
    // Data States
    const [loading, setLoading] = useState(true);
    const [summaryData, setSummaryData] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [categoryData, setCategoryData] = useState([]);
    const [customerData, setCustomerData] = useState([]);
    const [peakHoursData, setPeakHoursData] = useState(null);
    const [profitLossData, setProfitLossData] = useState(null);
    const [returnsData, setReturnsData] = useState([]);
    const [shiftData, setShiftData] = useState([]);
    const [expensesData, setExpensesData] = useState([]);

    const [selectedTrx, setSelectedTrx] = useState(null);
    const [exportingFormat, setExportingFormat] = useState('');

    const TABS = [
        { id: 'TRANSAKSI', label: 'Transaksi', icon: Receipt },
        { id: 'KATEGORI', label: 'Kategori', icon: LayoutGrid },
        { id: 'TERLARIS', label: 'Terlaris', icon: TrendingUp },
        { id: 'PELANGGAN', label: 'Pelanggan', icon: Users },
        { id: 'RETUR', label: 'Retur', icon: ArrowRightLeft },
        { id: 'SHIFT', label: 'Shift', icon: Clock },
        { id: 'LABARUGI', label: 'Laba Rugi', icon: DollarSign },
        { id: 'PENGELUARAN', label: 'Pengeluaran', icon: Wallet },
    ];

    const getQueryString = () => {
        if (isCustomDate && dateRange.start && dateRange.end) {
            return `?startDate=${dateRange.start}&endDate=${dateRange.end}`;
        }
        return `?period=${period}`;
    };

    const requestOptions = () => ({ credentials: 'include', cache: 'no-store' });

    const loadData = async () => {
        setLoading(true);
        try {
            const qs = getQueryString();
            
            // Base dashboard stats (used by Multiple tabs: Transaksi, Terlaris)
            if (['TRANSAKSI', 'TERLARIS'].includes(activeTab)) {
                const res = await fetch(`${API_URL}/api/reports/dashboard${qs}`, requestOptions());
                const data = await res.json();
                if (data.success) setSummaryData(data.data);
                
                // Fetch full transactions for table
                if (activeTab === 'TRANSAKSI') {
                    const trxRes = await fetch(`${API_URL}/api/transactions${qs}&limit=100`, requestOptions());
                    const trxData = await trxRes.json();
                    if (trxData.success) setTransactions(trxData.data);
                }
            }
            
            // Tab Specific Data
            else if (activeTab === 'KATEGORI') {
                const res = await fetch(`${API_URL}/api/reports/by-category${qs}`, requestOptions());
                const data = await res.json();
                if (data.success) setCategoryData(data.data);
            }
            else if (activeTab === 'PELANGGAN') {
                const res = await fetch(`${API_URL}/api/reports/by-customer${qs}`, requestOptions());
                const data = await res.json();
                if (data.success) setCustomerData(data.data);
            }
            else if (activeTab === 'RETUR') {
                const res = await fetch(`${API_URL}/api/reports/returns${qs}`, requestOptions());
                const data = await res.json();
                if (data.success) setReturnsData(data.data);
            }
            else if (activeTab === 'SHIFT') {
                const res = await fetch(`${API_URL}/api/reports/shift`, requestOptions());
                const data = await res.json();
                if (data.success) setShiftData(data.data);
            }
            else if (activeTab === 'LABARUGI') {
                const res = await fetch(`${API_URL}/api/reports/profit-loss${qs}`, requestOptions());
                const data = await res.json();
                if (data.success) setProfitLossData(data.data);
            }
            else if (activeTab === 'PENGELUARAN') {
                const res = await fetch(`${API_URL}/api/expenses${qs}`, requestOptions());
                const data = await res.json();
                if (data.success) setExpensesData(data.data);
            }
            
        } catch (error) {
            console.error("Gagal memuat laporan:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [activeTab, period, isCustomDate]);

    const getPeriodLabel = () => {
        if (isCustomDate && dateRange.start && dateRange.end) {
            return `${dateRange.start} s/d ${dateRange.end}`;
        }
        const labels = { today: 'Hari ini', week: '7 hari terakhir', month: 'Bulan ini', year: 'Tahun ini' };
        return labels[period] || period;
    };

    const getExportReport = () => buildReportExport(activeTab, {
        summaryData,
        transactions,
        categoryData,
        customerData,
        returnsData,
        shiftData,
        profitLossData,
        expensesData,
    });

    const getExportFilename = (extension) => {
        const periodPart = isCustomDate && dateRange.start && dateRange.end
            ? `${dateRange.start}-${dateRange.end}`
            : period;
        return `laporan-${activeTab.toLowerCase()}-${periodPart}.${extension}`;
    };

    const handleExport = () => {
        setExportingFormat('csv');
        try {
            const report = getExportReport();
            exportReportCsv(report, getExportFilename('csv'));
        } catch (error) {
            showAlert.error('CSV gagal dibuat', error?.message || 'Silakan coba lagi.');
        } finally {
            setExportingFormat('');
        }
    };

    const handleExportPdf = async () => {
        setExportingFormat('pdf');
        try {
            const report = getExportReport();
            await exportReportPdf(report, {
                filename: getExportFilename('pdf'),
                storeName: settings?.storeName || 'Warna Warni Boneka',
                periodLabel: getPeriodLabel(),
            });
        } catch (error) {
            showAlert.error('PDF gagal dibuat', error?.message || 'Silakan coba lagi.');
        } finally {
            setExportingFormat('');
        }
    };

    // Render Tab Content
    const renderContent = () => {
        if (loading) {
            return <div className="flex justify-center items-center py-32"><Loader2 className="animate-spin text-blue-500" size={40} /></div>;
        }

        switch (activeTab) {
            case 'TRANSAKSI':
                return (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard title="Penjualan Kotor" value={formatRp(summaryData?.summary?.grossRevenue || 0)} icon={DollarSign} color="blue" />
                            <StatCard title="Retur" value={formatRp(summaryData?.summary?.returnTotal || 0)} icon={ArrowRightLeft} color="red" />
                            <StatCard title="Penjualan Bersih" value={formatRp(summaryData?.summary?.totalRevenue || 0)} icon={TrendingUp} color="green" />
                            <StatCard title="Total Transaksi" value={summaryData?.summary?.totalTransactions || 0} icon={Receipt} color="purple" />
                        </div>
                        
                        <div className="bg-white p-6 rounded-2xl border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Grafik Pendapatan</h3>
                            <SalesChart data={summaryData?.chartData || []} />
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800">Daftar Transaksi</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="px-6 py-4 font-bold text-gray-500">Invoice</th>
                                            <th className="px-6 py-4 font-bold text-gray-500">Waktu</th>
                                            <th className="px-6 py-4 font-bold text-gray-500">Kasir</th>
                                            <th className="px-6 py-4 font-bold text-gray-500">Tipe</th>
                                            <th className="px-6 py-4 font-bold text-gray-500 text-right">Total</th>
                                            <th className="px-6 py-4 font-bold text-gray-500">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map(trx => (
                                            <tr key={trx.id} onClick={() => setSelectedTrx(trx)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                                                <td className="px-6 py-4 font-medium text-blue-600">{trx.invoiceNumber}</td>
                                                <td className="px-6 py-4 text-gray-600">{new Date(trx.createdAt).toLocaleString('id-ID')}</td>
                                                <td className="px-6 py-4 text-gray-800">{trx.user?.name || '-'}</td>
                                                <td className="px-6 py-4 text-gray-600">{trx.orderType}</td>
                                                <td className="px-6 py-4 font-bold text-gray-900 text-right">{formatRp(trx.grandTotal)}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${trx.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                        {trx.status}
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

            case 'KATEGORI':
                return (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-in fade-in">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-6 py-4 font-bold text-gray-500">Kategori</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Qty Terjual</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Pendapatan</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categoryData.map((cat, idx) => (
                                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="px-6 py-4 font-bold text-gray-800">{cat.name}</td>
                                        <td className="px-6 py-4 text-gray-600 text-right">{cat.totalQty}</td>
                                        <td className="px-6 py-4 font-bold text-gray-900 text-right">{formatRp(cat.totalRevenue)}</td>
                                        <td className="px-6 py-4 font-bold text-green-600 text-right">{formatRp(cat.totalProfit)}</td>
                                    </tr>
                                ))}
                                {categoryData.length === 0 && <tr><td colSpan="4" className="text-center py-10 text-gray-400">Tidak ada data</td></tr>}
                            </tbody>
                        </table>
                    </div>
                );

            case 'TERLARIS':
                return (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-in fade-in">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-6 py-4 font-bold text-gray-500 w-16">Rank</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Nama Produk</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Qty Terjual</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Pendapatan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summaryData?.topProducts?.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="px-6 py-4 font-bold text-gray-400">#{idx + 1}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800 flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                                                {item.imageUrl ? <img src={item.imageUrl.startsWith('http') ? item.imageUrl : `${API_URL}${item.imageUrl}`} className="w-full h-full object-cover"/> : <Package size={16} className="text-gray-400"/>}
                                            </div>
                                            {item.name}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 text-right font-medium">{item.sold}</td>
                                        <td className="px-6 py-4 font-bold text-blue-600 text-right">{formatRp(item.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );

            case 'PELANGGAN':
                return (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-in fade-in">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-6 py-4 font-bold text-gray-500">Pelanggan</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-center">Kunjungan</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Total Belanja</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Rata-rata</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Terakhir Kunjungan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customerData.map((c, idx) => (
                                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-gray-800">{c.name}</p>
                                            <p className="text-xs text-gray-500">{c.phone || '-'}</p>
                                        </td>
                                        <td className="px-6 py-4 text-center font-medium">{c.visitCount}</td>
                                        <td className="px-6 py-4 font-bold text-gray-900 text-right">{formatRp(c.totalSpent)}</td>
                                        <td className="px-6 py-4 text-gray-600 text-right">{formatRp(c.avgTransaction)}</td>
                                        <td className="px-6 py-4 text-gray-500 text-xs">{new Date(c.lastVisit).toLocaleDateString('id-ID')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );

            case 'RETUR':
                return (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-in fade-in">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-6 py-4 font-bold text-gray-500">Invoice</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Tanggal</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Pelanggan</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Kasir</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Total Retur</th>
                                </tr>
                            </thead>
                            <tbody>
                                {returnsData.map((trx, idx) => (
                                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50" onClick={() => setSelectedTrx(trx)}>
                                        <td className="px-6 py-4 font-medium text-red-600 cursor-pointer hover:underline">{trx.invoiceNumber}</td>
                                        <td className="px-6 py-4 text-gray-600">{new Date(trx.createdAt).toLocaleString('id-ID')}</td>
                                        <td className="px-6 py-4 text-gray-800">{trx.customer?.name || trx.customerName || 'Umum'}</td>
                                        <td className="px-6 py-4 text-gray-800">{trx.user?.name || '-'}</td>
                                        <td className="px-6 py-4 font-bold text-gray-900 text-right">{formatRp(trx.grandTotal)}</td>
                                    </tr>
                                ))}
                                {returnsData.length === 0 && <tr><td colSpan="5" className="text-center py-10 text-gray-400">Tidak ada transaksi retur</td></tr>}
                            </tbody>
                        </table>
                    </div>
                );
            
            case 'SHIFT':
                return (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-in fade-in">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-6 py-4 font-bold text-gray-500">Kasir</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Dibuka</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Ditutup</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Kas Awal</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Kas Akhir</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shiftData.map((s, idx) => (
                                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="px-6 py-4 font-bold text-gray-800">{s.userName}</td>
                                        <td className="px-6 py-4 text-gray-600">{new Date(s.openedAt).toLocaleString('id-ID')}</td>
                                        <td className="px-6 py-4 text-gray-600">{s.closedAt ? new Date(s.closedAt).toLocaleString('id-ID') : '-'}</td>
                                        <td className="px-6 py-4 font-bold text-gray-700 text-right">{formatRp(s.openingCash)}</td>
                                        <td className="px-6 py-4 font-bold text-gray-700 text-right">{s.closingCash ? formatRp(s.closingCash) : '-'}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${s.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );

            case 'LABARUGI':
                return (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Pemasukan */}
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="font-bold text-gray-500 mb-4 uppercase text-xs tracking-wider">Pemasukan</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Penjualan Bruto</span>
                                        <span className="font-bold">{formatRp(profitLossData?.grossRevenue)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-red-500">
                                        <span>Retur Penjualan</span>
                                        <span>-{formatRp(profitLossData?.returnTotal)}</span>
                                    </div>
                                    <div className="border-t border-gray-100 pt-3 flex justify-between">
                                        <span className="font-bold text-gray-800">Penjualan Bersih</span>
                                        <span className="font-bold text-blue-600">{formatRp(profitLossData?.netRevenue)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Harga Pokok & Laba Kotor */}
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="font-bold text-gray-500 mb-4 uppercase text-xs tracking-wider">Harga Pokok</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm text-orange-600">
                                        <span>Total HPP / Modal</span>
                                        <span>-{formatRp(profitLossData?.cogs)}</span>
                                    </div>
                                    <div className="border-t border-gray-100 pt-3 flex justify-between">
                                        <span className="font-bold text-gray-800">Laba Kotor</span>
                                        <span className="font-bold text-green-600">{formatRp(profitLossData?.grossProfit)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Pengeluaran & Laba Bersih */}
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="font-bold text-gray-500 mb-4 uppercase text-xs tracking-wider">Operasional</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm text-red-600">
                                        <span>Total Pengeluaran</span>
                                        <span>-{formatRp(profitLossData?.totalExpenses)}</span>
                                    </div>
                                    <div className="border-t border-gray-100 pt-3 flex justify-between">
                                        <span className="font-bold text-gray-800">LABA BERSIH</span>
                                        <span className={`font-black text-xl ${Number(profitLossData?.netProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatRp(profitLossData?.netProfit)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Rincian Pengeluaran */}
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h3 className="font-bold text-gray-800">Rincian Pengeluaran by Kategori</h3>
                            </div>
                            <table className="w-full text-left border-collapse text-sm">
                                <tbody>
                                    {profitLossData?.expenseBreakdown?.map((cat, idx) => (
                                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-gray-600">{cat.category}</td>
                                            <td className="px-6 py-4 font-bold text-red-500 text-right">{formatRp(cat.amount)}</td>
                                        </tr>
                                    ))}
                                    {profitLossData?.expenseBreakdown?.length === 0 && (
                                        <tr><td colSpan="2" className="text-center py-6 text-gray-400">Tidak ada pengeluaran di periode ini</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            
            case 'PENGELUARAN':
                return (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-in fade-in">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-6 py-4 font-bold text-gray-500">Tanggal</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Deskripsi</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Kategori</th>
                                    <th className="px-6 py-4 font-bold text-gray-500">Tipe</th>
                                    <th className="px-6 py-4 font-bold text-gray-500 text-right">Jumlah</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expensesData.map((e, idx) => (
                                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-600">{new Date(e.createdAt).toLocaleDateString('id-ID')}</td>
                                        <td className="px-6 py-4 font-medium text-gray-800">{e.description}</td>
                                        <td className="px-6 py-4"><span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded font-bold">{e.category}</span></td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${e.type === 'PURCHASE' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                                {e.type === 'PURCHASE' ? 'Pembelian' : 'Pengeluaran'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-red-600 text-right">{formatRp(e.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">Pusat Laporan</h1>
                    <p className="text-sm text-gray-500 mt-1">Analisis performa bisnis Anda secara komprehensif</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* Period Selector */}
                    <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm w-full md:w-auto">
                        <button onClick={() => { setPeriod('today'); setIsCustomDate(false); }} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${period === 'today' && !isCustomDate ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>Hari Ini</button>
                        <button onClick={() => { setPeriod('week'); setIsCustomDate(false); }} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${period === 'week' && !isCustomDate ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>Minggu</button>
                        <button onClick={() => { setPeriod('month'); setIsCustomDate(false); }} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${period === 'month' && !isCustomDate ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>Bulan</button>
                        <button onClick={() => setIsCustomDate(true)} className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${isCustomDate ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>Custom</button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={handleExport} disabled={Boolean(exportingFormat)} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors shadow-lg disabled:opacity-50">
                            {exportingFormat === 'csv' && <Loader2 className="animate-spin" size={15} />} CSV
                        </button>
                        <button onClick={handleExportPdf} disabled={Boolean(exportingFormat)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors shadow-lg disabled:opacity-50">
                            {exportingFormat === 'pdf' && <Loader2 className="animate-spin" size={15} />} PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom Date Inputs */}
            {isCustomDate && (
                <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm w-max animate-in slide-in-from-top-2">
                    <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:border-blue-500" />
                    <span className="text-gray-400 font-bold">-</span>
                    <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:border-blue-500" />
                </div>
            )}

            {/* Tabs Navigation */}
            <div className="w-full overflow-x-auto no-scrollbar border-b border-gray-200">
                <div className="flex w-max min-w-full">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all relative ${
                                activeTab === tab.id 
                                    ? 'text-blue-600' 
                                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                            }`}
                        >
                            <tab.icon size={18} className={activeTab === tab.id ? 'text-blue-500' : ''} />
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-t-full"></div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div>
                {renderContent()}
            </div>

            {/* Modals */}
            <TransactionDetailModal 
                isOpen={!!selectedTrx} 
                onClose={() => setSelectedTrx(null)} 
                transaction={selectedTrx} 
            />
        </div>
    );
}
