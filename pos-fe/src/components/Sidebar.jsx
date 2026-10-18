"use client";

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Users, Settings,
  ChevronDown, Box, ClipboardList, UserCircle, LogOut,
  Wallet, Clock, Truck, BadgeCheck
  , Building2, Loader2
} from 'lucide-react';
import Link, { useNavigationGuard } from './NavigationGuard';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '../store/useStore';
import { showAlert } from '../utils/swal';
import { getPosPendingTransactions } from '../utils/savedTransactions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const SidebarItem = ({ icon: Icon, label, href, hasSubmenu, isOpen, onClick, badge, onNavigate }) => {
  const pathname = usePathname();
  const isActive = href ? pathname === href : false;

  const content = (
    <div className="flex items-center gap-3">
      <Icon size={20} className={isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'} />
      <span>{label}</span>
      {badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center animate-pulse">
          {badge}
        </span>
      )}
    </div>
  );

  const className = `w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group mb-1 ${isActive || (hasSubmenu && isOpen)
    ? 'bg-blue-50 text-blue-600 font-bold'
    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 font-medium'
    }`;

  if (href) {
    return (
      <Link href={href} className={className} onClick={onNavigate}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      {content}
      {hasSubmenu && (
        <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      )}
    </button>
  );
};

export default function Sidebar({ isMobileOpen, setIsMobileOpen }) {
  const navigation = useNavigationGuard();
  const router = useRouter();
  const pathname = usePathname();

  // Menggunakan selector reaktif dari Zustand Store
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const settings = useStore((state) => state.settings);
  const stores = useStore((state) => state.stores);
  const activeStore = useStore((state) => state.activeStore);
  const switchStore = useStore((state) => state.switchStore);
  const cart = useStore((state) => state.cart);

  const [mounted, setMounted] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState({ inventory: true });
  const [pendingSalesCount, setPendingSalesCount] = useState(0);
  const [isSwitchingStore, setIsSwitchingStore] = useState(false);

  // Pastikan komponen sudah terpasang (mounted) untuk menghindari error hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname, setIsMobileOpen]);

  // Fetch pending saved transactions count
  useEffect(() => {
    if (!mounted) {
      setPendingSalesCount(0);
      return;
    }
    const fetchPendingSales = async () => {
      try {
        const baseUrl = API_URL.endsWith('/api') ? API_URL.replace(/\/api$/, '') : API_URL;
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${baseUrl}/api/saved-transactions`, { headers });
        const data = await res.json();
        if (data.success) {
          setPendingSalesCount(getPosPendingTransactions(data.data).length);
        }
      } catch (e) { /* silent */ }
    };
    fetchPendingSales();
    const interval = setInterval(fetchPendingSales, 30000);
    return () => clearInterval(interval);
  }, [mounted]);

  const toggleSubmenu = (key) => {
    setExpandedMenu(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    if (navigation && !await navigation.confirmNavigation()) return;
    const confirm = await showAlert.confirm("Keluar Kasir?", "Sesi Anda akan berakhir.");
    if (confirm) {
      await logout();
      router.push('/login');
    }
  };

  const handleStoreChange = async (event) => {
    const storeId = Number(event.target.value);
    if (!storeId || storeId === activeStore?.id || isSwitchingStore) return;
    if (navigation && !await navigation.confirmNavigation()) return;
    if (cart.length > 0) {
      const confirmed = await showAlert.confirm(
        'Ganti usaha?',
        'Keranjang saat ini akan dikosongkan agar data antar-usaha tidak tercampur.',
        'Ya, Ganti Usaha'
      );
      if (!confirmed) return;
    }
    setIsSwitchingStore(true);
    const result = await switchStore(storeId);
    if (!result.success) {
      setIsSwitchingStore(false);
      return showAlert.error('Gagal mengganti usaha', result.message);
    }
    window.location.reload();
  };

  const getImageUrl = (path) => {
    if (!path) return null;
    return path.startsWith('http') ? path : `${API_URL}${path}`;
  };

  const isAdminOrOwner = user?.role === 'ADMIN' || user?.role === 'OWNER';
  const enableShift = settings?.enableShift;

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="h-full flex flex-col">
          {/* Brand Header - Identik dengan Header Kasir */}
          <Link href="/" className="h-16 lg:h-20 flex items-center px-6 border-b border-gray-100 flex-shrink-0" title="Kembali ke dashboard">
            <div className="w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center flex-shrink-0 mr-3">
              <img src="/icon.png" alt="Logo Warna Warni" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-none tracking-tight text-gray-800 truncate">{settings?.storeName || 'Warna Warni'}</h1>
              <p className="text-[10px] text-gray-400 font-medium mt-1 uppercase tracking-wider truncate">Retail Suite</p>
            </div>
          </Link>

          {mounted && stores.length > 1 && (
            <div className="px-4 pt-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                {isSwitchingStore ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
                <select
                  value={activeStore?.id || ''}
                  onChange={handleStoreChange}
                  disabled={isSwitchingStore}
                  className="min-w-0 flex-1 bg-transparent text-xs font-bold outline-none disabled:opacity-60"
                  aria-label="Usaha aktif"
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* POS Quick Action Button */}
          <div className="px-4 pt-4 pb-2">
            <Link
              href="/pos"
              onClick={() => setIsMobileOpen(false)}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-bold text-sm hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg shadow-blue-200 active:scale-[0.98]"
            >
              <ShoppingCart size={18} />
              Buka Kasir
              {pendingSalesCount > 0 && (
                <span className="bg-yellow-400 text-gray-900 text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1">
                  {pendingSalesCount}
                </span>
              )}
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto py-4 px-4 space-y-1 no-scrollbar">
            <SidebarItem icon={LayoutDashboard} label="Dashboard" href="/" onNavigate={() => setIsMobileOpen(false)} />

            {/* MANAGEMENT MENU: ADMIN AND OWNER ONLY */}
            {isAdminOrOwner && (
              <div className="pt-4 pb-2">
                <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 italic">Management</p>
                <SidebarItem
                  icon={Box}
                  label="Produk & Stok"
                  hasSubmenu
                  isOpen={expandedMenu.inventory}
                  onClick={() => toggleSubmenu('inventory')}
                />
                {expandedMenu.inventory && (
                  <div className="ml-4 pl-4 border-l border-gray-100 space-y-1 mt-1 mb-2">
                    <Link href="/products" onClick={() => setIsMobileOpen(false)} className={`block w-full text-left px-4 py-2 text-sm rounded-lg transition-colors ${pathname === '/products' ? 'text-blue-600 bg-blue-50 font-bold' : 'text-gray-500 hover:text-gray-800'}`}>Daftar Produk</Link>
                    <Link href="/packages" onClick={() => setIsMobileOpen(false)} className={`block w-full text-left px-4 py-2 text-sm rounded-lg transition-colors ${pathname === '/packages' ? 'text-blue-600 bg-blue-50 font-bold' : 'text-gray-500 hover:text-gray-800'}`}>Paket Produk</Link>
                    <Link href="/categories" onClick={() => setIsMobileOpen(false)} className={`block w-full text-left px-4 py-2 text-sm rounded-lg transition-colors ${pathname === '/categories' ? 'text-blue-600 bg-blue-50 font-bold' : 'text-gray-500 hover:text-gray-800'}`}>Kategori</Link>
                    <Link href="/stock" onClick={() => setIsMobileOpen(false)} className={`block w-full text-left px-4 py-2 text-sm rounded-lg transition-colors ${pathname === '/stock' ? 'text-blue-600 bg-blue-50 font-bold' : 'text-gray-500 hover:text-gray-800'}`}>Riwayat Stok</Link>
                    <Link href="/stock-receiving" onClick={() => setIsMobileOpen(false)} className={`block w-full text-left px-4 py-2 text-sm rounded-lg transition-colors ${pathname === '/stock-receiving' ? 'text-blue-600 bg-blue-50 font-bold' : 'text-gray-500 hover:text-gray-800'}`}>Penerimaan Barang</Link>
                    <Link href="/stock-opname" onClick={() => setIsMobileOpen(false)} className={`block w-full text-left px-4 py-2 text-sm rounded-lg transition-colors ${pathname === '/stock-opname' ? 'text-blue-600 bg-blue-50 font-bold' : 'text-gray-500 hover:text-gray-800'}`}>Stock Opname</Link>
                  </div>
                )}
              </div>
            )}

            {/* TRANSACTIONS & REPORTS */}
            <SidebarItem icon={ShoppingCart} label="Transaksi" href="/transactions" onNavigate={() => setIsMobileOpen(false)} />

            {isAdminOrOwner && (
              <SidebarItem icon={ClipboardList} label="Laporan" href="/reports" onNavigate={() => setIsMobileOpen(false)} />
            )}

            <div className="pt-4 pb-2">
              <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 italic">Operasional</p>
              {enableShift && <SidebarItem icon={Clock} label="Shift" href="/shifts" onNavigate={() => setIsMobileOpen(false)} />}
              {isAdminOrOwner && (
                <SidebarItem icon={Wallet} label="Pengeluaran" href="/expenses" onNavigate={() => setIsMobileOpen(false)} />
              )}
            </div>

            {isAdminOrOwner && (
              <div className="pt-4 pb-2">
                <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 italic">People</p>
                <SidebarItem icon={Users} label="Pegawai" href="/users" onNavigate={() => setIsMobileOpen(false)} />
                <SidebarItem icon={UserCircle} label="Pelanggan" href="/customers" onNavigate={() => setIsMobileOpen(false)} />
                <SidebarItem icon={Truck} label="Supplier" href="/suppliers" onNavigate={() => setIsMobileOpen(false)} />
              </div>
            )}

            <SidebarItem icon={Settings} label="Pengaturan" href="/settings" onNavigate={() => setIsMobileOpen(false)} />
            <SidebarItem icon={BadgeCheck} label="Lisensi Outlet" href="/license" onNavigate={() => setIsMobileOpen(false)} />
          </div>

          {/* User Profile Area - Persis seperti Header (Clean & Mewah) */}
          <div className="p-4 border-t border-gray-100 bg-white">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-white hover:shadow-md transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white font-bold overflow-hidden shadow-sm flex-shrink-0 ring-4 ring-white">
                {mounted && user?.imageUrl ? (
                  <img src={getImageUrl(user.imageUrl)} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-black">{mounted && user?.name ? user.name.charAt(0).toUpperCase() : 'A'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate leading-none">
                  {mounted ? (user?.name || 'Authorized') : 'Loading...'}
                </p>
                <p className="text-[10px] text-gray-500 truncate font-medium mt-1.5 uppercase tracking-tighter">
                  {mounted ? (user?.role === 'CASHIER' ? 'STAFF' : user?.role || 'Staff Member') : 'Verifying...'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Keluar"
              >
                <LogOut size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileOpen(false)}></div>
      )}
    </>
  );
}
