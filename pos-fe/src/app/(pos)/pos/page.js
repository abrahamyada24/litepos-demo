"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Import Components
import Header from '@/components/pos/Header';
import CategoryFilter from '@/components/pos/CategoryFilter';
import ProductGrid from '@/components/pos/ProductGrid';
import CartSidebar from '@/components/pos/CartSidebar';
import MemberModal from '@/components/pos/MemberModal';
import PaymentModal from '@/components/pos/PaymentModal';
import DiscountModal from '@/components/pos/DiscountModal';
import ReceiptPreviewModal from '@/components/pos/ReceiptPreviewModal';
import SavedTransactionModal from '@/components/pos/SavedTransactionModal';
import ShiftGuardModal from '@/components/pos/ShiftGuardModal';
import AddonModal from '@/components/pos/AddonModal';

// Import SweetAlert
import { showAlert } from '@/utils/swal';
import {
  formatShiftDateTime,
  getOpeningExpectedCloseAt,
  getShiftReminder,
} from '@/utils/shiftReminder';
import { getPosPendingTransactions } from '@/utils/savedTransactions';
import { getCartItemLineTotal } from '@/utils/cartPricing';
import { calculateCheckoutTotals } from '@/utils/checkoutTotals';
import { useStore } from '@/store/useStore';

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_URL = RAW_API_URL.endsWith('/api') ? RAW_API_URL.slice(0, -4) : RAW_API_URL;
const MIDTRANS_CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;

export default function POSPage() {
  const router = useRouter(); 
  const authenticatedUser = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  
  // --- STATE DATA ---
  const [products, setProducts] = useState([]);
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentUser, setCurrentUser] = useState(null); 
  const [storeSettings, setStoreSettings] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [activeShift, setActiveShift] = useState(null);
  const [shiftRequiredByServer, setShiftRequiredByServer] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [isOpeningShift, setIsOpeningShift] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  
  // --- STATE UI ---
  const [cart, setCart] = useState([]);
  const [discountValue, setDiscountValue] = useState(0);
  const [discountType, setDiscountType] = useState('amount');
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [mobileView, setMobileView] = useState('menu'); 

  // Member State
  const [selectedMember, setSelectedMember] = useState(null);
  const [guestCustomerName, setGuestCustomerName] = useState('');
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  // Payment States
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState('SELECT'); 
  const [paymentMethod, setPaymentMethod] = useState(''); 
  const [cashGiven, setCashGiven] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isSavedTransactionModalOpen, setIsSavedTransactionModalOpen] = useState(false);
  const [savedTransactionCount, setSavedTransactionCount] = useState(0);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [activeSavedTransactionId, setActiveSavedTransactionId] = useState(null);
  const [addonProduct, setAddonProduct] = useState(null);
  const [selectedAddonQuantities, setSelectedAddonQuantities] = useState({});
  const [addonNotes, setAddonNotes] = useState('');

  // Retail transaction type
  const [orderType, setOrderType] = useState('TAKE_AWAY');
  const [preOrderDate, setPreOrderDate] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const shiftReminderGateRef = useRef({ key: '', nextAt: 0 });

  const refreshSavedTransactionCount = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/saved-transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || !data.success) return;

      const posSavedTransactions = getPosPendingTransactions(data.data);
      setSavedTransactionCount(posSavedTransactions.length);
    } catch (error) {
      console.error('Failed to count saved transactions', error);
    }
  };

  // --- 1. FETCH DATA ---
  useEffect(() => {
    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token'); 
            setCurrentUser(authenticatedUser);

            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            const [prodRes, catRes, memRes, pkgRes, settingsRes] = await Promise.all([
                fetch(`${API_URL}/api/products`, { headers }),
                fetch(`${API_URL}/api/products/categories`, { headers }),
                fetch(`${API_URL}/api/customers`, { headers }),
                fetch(`${API_URL}/api/packages`, { headers }),
                fetch(`${API_URL}/api/settings`, { headers, cache: 'no-store' })
            ]);

            const prodData = await prodRes.json();
            const catData = await catRes.json();
            const memData = await memRes.json();
            const pkgData = await pkgRes.json();

            if (prodData.success) {
                const regularProducts = prodData.data.map(product => ({
                    ...product,
                    originalPrice: Number(product.originalPrice ?? product.price),
                    price: Number(product.effectivePrice ?? product.price)
                }));
                const packageProducts = pkgData.success ? pkgData.data.filter(pkg => pkg.isActive).map(pkg => ({
                    ...pkg,
                    id: `pkg-${pkg.id}`,
                    packageId: pkg.id,
                    category: { name: 'Paket' },
                    stock: 999,
                    isUnlimitedStock: true,
                    originalPrice: Number(pkg.price),
                    price: Number(pkg.price),
                    isPackage: true
                })) : [];
                setProducts([...regularProducts, ...packageProducts]);
            }
            if (catData.success) setCategories([{ id: 0, name: 'Semua' }, ...catData.data, ...(pkgData.success && pkgData.data.some(pkg => pkg.isActive) ? [{ id: 'PACKAGE', name: 'Paket' }] : [])]);
            if (memData.success) setMembers(memData.data);

            // Store settings ikut dimuat paralel bersama data master.
            try {
                const settingsData = await settingsRes.json();
                
                if (settingsData.success && settingsData.data) {
                    setStoreSettings(settingsData.data);
                    if (settingsData.data.taxRate !== undefined && settingsData.data.taxRate !== null) {
                        setTaxRate(Number(settingsData.data.taxRate) / 100);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch settings', e);
            } finally {
                setSettingsLoaded(true);
            }

        } catch (error) {
            console.error("Error fetching data:", error);
            showAlert.error("Gagal Memuat Data", "Cek koneksi backend.");
            setSettingsLoaded(true);
        }
    };

    fetchData();
    refreshSavedTransactionCount();

  }, [authenticatedUser]);

  useEffect(() => {
    if (!settingsLoaded || storeSettings?.enableQris !== true || !MIDTRANS_CLIENT_KEY) {
      return undefined;
    }

    const script = document.createElement('script');
    script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
    script.setAttribute('data-client-key', MIDTRANS_CLIENT_KEY);
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, [settingsLoaded, storeSettings?.enableQris]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openSaved') !== '1') return;

    setIsSavedTransactionModalOpen(true);
    params.delete('openSaved');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return undefined;
    if (storeSettings?.enableShift !== true) {
      setActiveShift(null);
      setShiftLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadCurrentShift = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/shifts/current`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const data = await response.json();
        if (!cancelled && response.ok && data.success) setActiveShift(data.data || null);
      } catch (error) {
        console.error('Failed to fetch current shift', error);
      } finally {
        if (!cancelled) setShiftLoading(false);
      }
    };

    setShiftLoading(true);
    loadCurrentShift();
    const intervalId = window.setInterval(loadCurrentShift, 15000);
    const handleFocus = () => loadCurrentShift();
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [settingsLoaded, storeSettings?.enableShift]);

  useEffect(() => {
    if (!activeShift || storeSettings?.enableShift !== true) {
      shiftReminderGateRef.current = { key: '', nextAt: 0 };
      return;
    }

    const reminder = getShiftReminder(activeShift, storeSettings);
    if (!reminder) return;
    const key = `${activeShift.id}:${reminder.phase}`;
    const now = Date.now();
    if (shiftReminderGateRef.current.key === key && shiftReminderGateRef.current.nextAt > now) return;
    shiftReminderGateRef.current = { key, nextAt: now + 15 * 60 * 1000 };

    showAlert.confirm(reminder.title, reminder.message, 'Tutup Shift Sekarang', 'Ingatkan 15 Menit').then(confirmed => {
      if (confirmed) router.push('/shifts?close=1');
    });
  }, [activeShift, router, storeSettings]);

  // --- LOGIC FILTER ---
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        if (p.isActive === false) return false;
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
        const categoryName = p.category ? p.category.name : 'Uncategorized';
        const matchCategory = selectedCategory === 'Semua' || categoryName === selectedCategory;
        return matchSearch && matchCategory;
      })
      .map((product, originalIndex) => ({
        product,
        originalIndex,
        cartIndex: cart.findIndex(item => String(item.id) === String(product.id)),
      }))
      .sort((a, b) => {
        const aSelected = a.cartIndex >= 0;
        const bSelected = b.cartIndex >= 0;
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        if (aSelected && bSelected && a.cartIndex !== b.cartIndex) return a.cartIndex - b.cartIndex;
        return a.originalIndex - b.originalIndex;
      })
      .map(entry => entry.product);
  }, [search, selectedCategory, products, cart]);

  const filteredMembers = useMemo(() => {
      if(!memberSearch) return members;
      return members.filter(m => 
        m.name.toLowerCase().includes(memberSearch.toLowerCase()) || 
        (m.memberId && m.memberId.toLowerCase().includes(memberSearch.toLowerCase())) ||
        (m.phone && m.phone.includes(memberSearch))
      );
  }, [memberSearch, members]);

  // --- LOGIC CART ---
  const buildItemNotes = (addons, customerNotes) => {
    const addonLabel = addons.length > 0
      ? `Opsi: ${addons.map(addon => `${addon.name}${Number(addon.quantity || 1) > 1 ? ` x${Number(addon.quantity)}` : ''}`).join(', ')}`
      : '';
    return [addonLabel, customerNotes.trim()].filter(Boolean).join(' | ') || null;
  };

  const addProductDirectly = (product) => {
    if (product.stock <= 0 && !product.isUnlimitedStock) return showAlert.warning("Stok Habis", "Produk ini tidak bisa dipilih.");
    
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        if (existing.qty + 1 > product.stock && !product.isUnlimitedStock) return showAlert.warning("Stok Terbatas", "Jumlah melebihi stok yang tersedia.");
        setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
        setCart([...cart, { ...product, qty: 1, addons: [], customerNotes: '', notes: null }]);
    }
  };

  const openAddonModal = (product) => {
    if (product.stock <= 0 && !product.isUnlimitedStock) {
      showAlert.warning('Stok Habis', 'Produk ini tidak bisa dipilih.');
      return;
    }
    const existing = cart.find(item => String(item.id) === String(product.id));
    setAddonProduct(product);
    setSelectedAddonQuantities(Object.fromEntries(
      (existing?.addons || []).map(addon => [Number(addon.id), Number(addon.quantity || 1)])
    ));
    setAddonNotes(existing?.customerNotes || '');
  };

  const addToCart = (product) => {
    if (Array.isArray(product.addons) && product.addons.length > 0) {
      openAddonModal(product);
      return;
    }
    addProductDirectly(product);
  };

  const confirmAddonSelection = () => {
    if (!addonProduct) return;
    const selectedAddons = addonProduct.addons
      .map(addon => ({ ...addon, quantity: Number(selectedAddonQuantities[Number(addon.id)] || 0) }))
      .filter(addon => addon.quantity > 0);
    const basePrice = Number(addonProduct.effectivePrice ?? addonProduct.price ?? 0);
    const baseOriginalPrice = Number(addonProduct.originalPrice ?? addonProduct.price ?? 0);
    const configuredItem = {
      ...addonProduct,
      basePrice,
      baseOriginalPrice,
      price: basePrice,
      originalPrice: baseOriginalPrice,
      addons: selectedAddons,
      hasAvailableAddons: true,
      customerNotes: addonNotes.trim(),
      notes: buildItemNotes(selectedAddons, addonNotes),
    };
    const existing = cart.find(item => String(item.id) === String(addonProduct.id));
    setCart(current => existing
      ? current.map(item => String(item.id) === String(addonProduct.id) ? { ...configuredItem, qty: item.qty } : item)
      : [...current, { ...configuredItem, qty: 1 }]
    );
    setAddonProduct(null);
    setSelectedAddonQuantities({});
    setAddonNotes('');
  };

  const updateItemNotes = (id, notes) => {
    setCart(current => current.map(item => item.id === id ? {
      ...item,
      customerNotes: notes.trim(),
      notes: buildItemNotes(item.addons || [], notes),
    } : item));
  };

  const updateQty = (id, delta) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const product = products.find(p => p.id === id) || item;
        if (delta > 0 && item.qty + 1 > product.stock && !product.isUnlimitedStock) {
            showAlert.warning("Batas Stok", "Stok produk tidak mencukupi.");
            return item;
        }
        const newQty = Math.max(0, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));

  // --- CALCULATIONS ---
  const subTotal = cart.reduce((sum, item) => sum + getCartItemLineTotal(item), 0);
  const { discount: discountAmount, taxAmount, grandTotal } = calculateCheckoutTotals({
    subTotal, taxRate, discountAmount: discountValue, discountType,
  });

  useEffect(() => {
    if (cart.length === 0) { setDiscountValue(0); setDiscountType('amount'); }
  }, [cart.length]);
  
  const deficit = Math.max(0, grandTotal - cashGiven);
  const change = Math.max(0, cashGiven - grandTotal);
  const isCashSufficient = cashGiven >= grandTotal;

  // --- HELPERS ---
  const formatNumber = (num) => num.toLocaleString('id-ID');
  const handleCashInput = (e) => setCashGiven(Number(e.target.value.replace(/\D/g, '')));
  const getImageUrl = (path) => !path ? null : (path.startsWith('http') ? path : `${API_URL}${path}`);

  const buildReceiptTransaction = (transaction, type, customerName) => ({
      ...transaction,
      createdAt: transaction.createdAt || new Date().toISOString(),
      customerName: transaction.customerName || customerName || null,
      user: transaction.user || currentUser,
      items: cart.map(item => ({
          productId: item.id,
          qty: item.qty,
          price: Number(item.price),
          notes: item.notes || null,
          product: { name: item.name },
      })),
      payments: transaction.payments?.length
          ? transaction.payments
          : [{ paymentType: type, amount: grandTotal }],
      cashAmount: type === 'CASH' ? cashGiven : (transaction.cashAmount ?? grandTotal),
      changeAmount: type === 'CASH' ? change : (transaction.changeAmount ?? 0),
      subTotal: transaction.subTotal ?? subTotal,
      taxAmount: transaction.taxAmount ?? taxAmount,
      discountAmount: transaction.discountAmount ?? 0,
      grandTotal: transaction.grandTotal ?? grandTotal,
      orderType: transaction.orderType || orderType,
      tableNumber: null,
  });

  // --- LOGOUT HANDLER (Sudah dipindah ke Header.jsx, tapi logic bisa disini jika butuh state) ---
  // Kita gunakan logic logout internal Header.jsx saja biar bersih.

  // --- TRANSAKSI ---
  const handleProcessTransaction = async (type) => {
      // Validasi Ekstra
      if (orderType === 'PRE_ORDER' && !preOrderDate) {
          return showAlert.warning("Waktu Kosong", "Silakan tentukan waktu pengambilan Pre Order.");
      }

      setIsProcessing(true);
      try {
          const token = localStorage.getItem('token');
          const userId = currentUser ? currentUser.id : 1; 
          
          const payload = {
              userId: userId, 
              customerId: selectedMember?.id || null,
              customerName: selectedMember?.name || guestCustomerName.trim() || null,
              discountAmount: discountValue,
              discountType,
              items: cart.map(c => ({
                productId: c.id,
                packageId: c.packageId || null,
                qty: c.qty,
                addons: (c.addons || []).map(addon => ({ id: addon.id, quantity: Number(addon.quantity || 1) })),
                addonIds: (c.addons || []).map(addon => addon.id),
                notes: c.customerNotes || (c.addons?.length ? null : c.notes) || null,
              })),
              payment: {
                type,
                amount: grandTotal,
                cashAmount: type === 'CASH' ? cashGiven : null,
                changeAmount: type === 'CASH' ? change : null,
              },
              orderType: orderType,
              tableNumber: null,
              note: null,
              sourceOrderCode: null,
              preOrderDate: orderType === 'PRE_ORDER' && preOrderDate ? new Date(preOrderDate).toISOString() : null
          };

          const res = await fetch(`${API_URL}/api/transactions`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': token ? `Bearer ${token}` : ''
              },
              body: JSON.stringify(payload)
          });

          const data = await res.json();

          if (!data.success) {
              if (data.code === 'SHIFT_REQUIRED') {
                  setShiftRequiredByServer(true);
                  setActiveShift(null);
                  setShiftLoading(false);
              }
              throw new Error(data.message);
          }
          const receiptTransaction = buildReceiptTransaction(data.data, type, payload.customerName);
          if (data.data.customerId && data.data.pointsBalanceAfter != null) {
            setMembers(current => current.map(member => member.id === data.data.customerId ? { ...member, points: data.data.pointsBalanceAfter } : member));
            setSelectedMember(current => current?.id === data.data.customerId ? { ...current, points: data.data.pointsBalanceAfter } : current);
          }

          if (activeSavedTransactionId) {
              try {
                  await fetch(`${API_URL}/api/saved-transactions/${activeSavedTransactionId}?action=accepted`, {
                      method: 'DELETE',
                      headers: { Authorization: token ? `Bearer ${token}` : '' }
                  });
                  setActiveSavedTransactionId(null);
                  refreshSavedTransactionCount();
              } catch (cleanupError) {
                  console.error('Failed to remove completed saved transaction', cleanupError);
              }
          }

          if (type === 'QRIS' && data.data.midtransToken) {
              window.snap.pay(data.data.midtransToken, {
                  onSuccess: function(result) {
                      setCompletedTransaction(receiptTransaction);
                      setPaymentStep('SUCCESS');
                      showAlert.success("Pembayaran Sukses", "Transaksi QRIS berhasil!");
                  },
                  onPending: function(result) {
                      setCompletedTransaction(receiptTransaction);
                      setPaymentStep('SUCCESS'); 
                      showAlert.info("Menunggu", "Pembayaran sedang diproses.");
                  },
                  onError: function(result) {
                      showAlert.error("Gagal", "Pembayaran gagal.");
                  },
                  onClose: function() {
                      showAlert.warning("Dibatalkan", "Anda menutup popup pembayaran.");
                  }
              });
          } else {
              setCompletedTransaction(receiptTransaction);
              setPaymentStep('SUCCESS');
              showAlert.success("Pembayaran Sukses", "Transaksi berhasil disimpan dan struk siap dicetak.");
          }

      } catch (error) {
          showAlert.error("Transaksi Gagal", error.message);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleOpenShift = async () => {
    setIsOpeningShift(true);
    try {
      const openingCashAmount = Number(openingCash) || 0;
      const expectedCloseAt = getOpeningExpectedCloseAt(storeSettings);
      const confirmed = await showAlert.confirm(
        'Konfirmasi buka shift',
        `Kas awal Rp ${openingCashAmount.toLocaleString('id-ID')}. Target tutup ${formatShiftDateTime(expectedCloseAt)}.`,
        'Ya, Buka Shift',
        'Ubah Nominal'
      );
      if (!confirmed) return;

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/shifts/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ openingCash: openingCashAmount })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || data.error || 'Shift tidak dapat dibuka.');
      setActiveShift(data.data);
      setShiftRequiredByServer(false);
      setOpeningCash('');
      showAlert.success('Shift dibuka', `Kas awal Rp ${Number(data.data.openingCash || 0).toLocaleString('id-ID')}.`);
    } catch (error) {
      showAlert.error('Gagal membuka shift', error.message || 'Coba lagi.');
    } finally {
      setIsOpeningShift(false);
    }
  };

  const handlePaymentOpen = () => {
    setPaymentStep('SELECT');
    setPaymentMethod('');
    setCashGiven(0);
    setCompletedTransaction(null);
    setIsReceiptModalOpen(false);
    setIsPaymentModalOpen(true);
  }

  const handleSaveTransaction = async () => {
    if (cart.length === 0 || isSavingTransaction) return;

    setIsSavingTransaction(true);
    try {
      const token = localStorage.getItem('token');
      const customerName = selectedMember?.name || guestCustomerName.trim() || 'Umum';
      const timeLabel = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const cartData = {
        source: 'POS_PENDING',
        items: cart,
        selectedMember: selectedMember || null,
        guestCustomerName: guestCustomerName.trim() || '',
        orderType,
        tableNumber: null,
        preOrderDate: preOrderDate || null,
        discountValue,
        discountType,
        subTotal,
        taxAmount,
        grandTotal,
      };

      const response = await fetch(`${API_URL}/api/saved-transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          name: `Pending ${customerName} - ${timeLabel}`,
          cartData,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || data.error || 'Pesanan belum tersimpan.');

      if (activeSavedTransactionId) {
        try {
          await fetch(`${API_URL}/api/saved-transactions/${activeSavedTransactionId}?action=accepted`, {
            method: 'DELETE',
            headers: { Authorization: token ? `Bearer ${token}` : '' },
          });
        } catch (cleanupError) {
          console.error('Failed to replace previous saved transaction', cleanupError);
        }
      }

      setCart([]);
      setSelectedMember(null);
      setGuestCustomerName('');
      setOrderType('TAKE_AWAY');
      setPreOrderDate('');
      setActiveSavedTransactionId(null);
      setMobileView('menu');
      await refreshSavedTransactionCount();
      showAlert.success('Penjualan pending tersimpan', 'Pesanan dapat dilanjutkan dari ikon transaksi tersimpan.');
    } catch (error) {
      showAlert.error('Gagal menyimpan penjualan', error.message || 'Coba lagi.');
    } finally {
      setIsSavingTransaction(false);
    }
  };

  const handleResumeSavedTransaction = (transaction) => {
    try {
      const parsed = JSON.parse(transaction.cartData);
      const payload = Array.isArray(parsed) ? { items: parsed } : parsed;
      const restoredItems = Array.isArray(payload.items) ? payload.items : [];
      if (restoredItems.length === 0) throw new Error('Isi pesanan kosong.');

      setCart(restoredItems);
      setDiscountValue(Number(payload.discountValue) || 0);
      setDiscountType(payload.discountType === 'percent' ? 'percent' : 'amount');
      setSelectedMember(payload.selectedMember || null);
      setGuestCustomerName(payload.guestCustomerName || '');
      setOrderType(payload.orderType === 'PRE_ORDER' ? 'PRE_ORDER' : 'TAKE_AWAY');
      setPreOrderDate(payload.preOrderDate || '');
      setActiveSavedTransactionId(transaction.id);
      setIsSavedTransactionModalOpen(false);
      if (window.innerWidth < 1024) setMobileView('cart');
      showAlert.success('Penjualan dilanjutkan', transaction.name);
    } catch (error) {
      showAlert.error('Gagal membuka penjualan', error.message || 'Data pesanan tidak valid.');
    }
  };

  const resetTransaction = () => {
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(false);
      setCompletedTransaction(null);
      setCart([]);
      setSelectedMember(null);
      setGuestCustomerName('');
      setOrderType('TAKE_AWAY');
      setPreOrderDate('');
      setMobileView('menu');
      window.location.reload(); 
  }

  // Handle Member Select from Modal
  const handleMemberSelect = (member) => {
      setSelectedMember(member);
      setGuestCustomerName('');
      setIsMemberModalOpen(false);
      setMemberSearch('');
  }

  const handleCreateMember = async (formData) => {
      try {
          const token = localStorage.getItem('token');
          const body = new FormData();
          body.append('name', formData.name);
          body.append('phone', formData.phone || '');
          body.append('email', formData.email || '');
          body.append('displayType', 'normal');

          const response = await fetch(`${API_URL}/api/customers`, {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              credentials: 'include',
              body,
          });
          const data = await response.json();
          if (!response.ok || !data.success) {
              throw new Error(data.message || data.error || 'Pelanggan gagal disimpan.');
          }

          setMembers(current => [data.data, ...current.filter(member => member.id !== data.data.id)]);
          handleMemberSelect(data.data);
          showAlert.success('Pelanggan ditambahkan', `${data.data.name} langsung dipilih untuk transaksi ini.`);
          return data.data;
      } catch (error) {
          showAlert.error('Gagal menambah pelanggan', error.message || 'Coba lagi.');
          return null;
      }
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-50 overflow-hidden font-sans text-gray-800">
      
      {/* KIRI: HEADER + KATEGORI + PRODUK */}
      <div className={`flex-1 flex flex-col min-w-0 relative ${mobileView !== 'menu' ? 'hidden lg:flex' : 'flex'}`}>
        <Header 
            search={search} 
            setSearch={setSearch} 
            currentUser={currentUser} 
            shiftEnabled={storeSettings?.enableShift === true || shiftRequiredByServer}
            activeShift={activeShift}
        />

        <CategoryFilter 
            categories={categories} 
            selectedCategory={selectedCategory} 
            setSelectedCategory={setSelectedCategory} 
        />

        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 lg:py-6 bg-gray-50/50 pb-32 lg:pb-6">
            <ProductGrid 
                products={filteredProducts} 
                cart={cart}
                addToCart={addToCart} 
                updateQty={updateQty}
                getImageUrl={getImageUrl} 
            />
        </div>
      </div>

      {/* KANAN: SIDEBAR KERANJANG */}
      <CartSidebar 
        cart={cart}
        mobileView={mobileView}
        setMobileView={setMobileView}
        selectedMember={selectedMember}
        setSelectedMember={setSelectedMember}
        guestCustomerName={guestCustomerName}
        setGuestCustomerName={setGuestCustomerName}
        setIsMemberModalOpen={setIsMemberModalOpen}
        removeFromCart={removeFromCart}
        updateQty={updateQty}
        handlePaymentOpen={handlePaymentOpen}
        setCart={setCart}
        getImageUrl={getImageUrl}
        grandTotal={grandTotal}
        subTotal={subTotal}
        taxAmount={taxAmount}
        orderType={orderType}
        setOrderType={setOrderType}
        preOrderDate={preOrderDate}
        setPreOrderDate={setPreOrderDate}
        taxRate={taxRate}
        discount={{ type: discountType, value: discountValue, amount: discountAmount }}
        onOpenDiscountModal={() => setIsDiscountModalOpen(true)}
        onRemoveDiscount={() => { setDiscountValue(0); setDiscountType('amount'); }}
        onSaveTransaction={handleSaveTransaction}
        isSavingTransaction={isSavingTransaction}
        savedTransactionCount={savedTransactionCount}
        onOpenSavedTransactions={() => setIsSavedTransactionModalOpen(true)}
        onUpdateItemNotes={updateItemNotes}
        onEditItemAddons={(item) => {
          const product = products.find(candidate => String(candidate.id) === String(item.id));
          if (product) openAddonModal(product);
        }}
        // Logout sekarang dihandle Header, tapi jika butuh di mobile menu:
        handleLogout={async () => {
            const confirmed = await showAlert.confirm('Keluar Kasir?', 'Sesi kasir akan diakhiri.', 'Ya, Keluar');
            if(confirmed) {
                await logout();
                router.push('/login');
            }
        }}
      />

      {/* --- MODALS --- */}
      <DiscountModal isOpen={isDiscountModalOpen} onClose={() => setIsDiscountModalOpen(false)}
        initialDiscount={discountValue} initialType={discountType} subTotal={subTotal}
        onApply={(value, type) => { setDiscountValue(value); setDiscountType(type); }}/>

      <ShiftGuardModal
         visible={!settingsLoaded || ((storeSettings?.enableShift === true || shiftRequiredByServer) && (shiftLoading || !activeShift))}
         checking={!settingsLoaded || (shiftLoading && !shiftRequiredByServer)}
         opening={isOpeningShift}
         openingCash={openingCash}
         setOpeningCash={setOpeningCash}
         onOpenShift={handleOpenShift}
         currentUser={currentUser}
      />

      <AddonModal
        isOpen={Boolean(addonProduct)}
        product={addonProduct}
        quantities={selectedAddonQuantities}
        setQuantities={setSelectedAddonQuantities}
        notes={addonNotes}
        setNotes={setAddonNotes}
        onClose={() => {
          setAddonProduct(null);
          setSelectedAddonQuantities({});
          setAddonNotes('');
        }}
        onConfirm={confirmAddonSelection}
      />
      
      <MemberModal 
         isOpen={isMemberModalOpen}
         onClose={() => setIsMemberModalOpen(false)}
         memberSearch={memberSearch}
         setMemberSearch={setMemberSearch}
         filteredMembers={filteredMembers}
         handleMemberSelect={handleMemberSelect}
         getImageUrl={getImageUrl}
         onCreateMember={handleCreateMember}
      />

      <PaymentModal 
         isOpen={isPaymentModalOpen}
         onClose={() => setIsPaymentModalOpen(false)}
         paymentStep={paymentStep}
         setPaymentStep={setPaymentStep}
         paymentMethod={paymentMethod}
         setPaymentMethod={setPaymentMethod}
         cashGiven={cashGiven}
         setCashGiven={setCashGiven}
         handleCashInput={handleCashInput}
         isCashSufficient={isCashSufficient}
         change={change}
         deficit={deficit}
         handleProcessTransaction={handleProcessTransaction}
         resetTransaction={resetTransaction}
         isProcessing={isProcessing}
         hasReceipt={Boolean(completedTransaction)}
         onOpenReceipt={() => setIsReceiptModalOpen(true)}
         grandTotal={grandTotal}
         formatNumber={formatNumber}
         midtransEnabled={storeSettings?.enableQris === true && Boolean(MIDTRANS_CLIENT_KEY)}
      />

      <SavedTransactionModal
         isOpen={isSavedTransactionModalOpen}
         onClose={() => setIsSavedTransactionModalOpen(false)}
         onResume={handleResumeSavedTransaction}
         onChanged={refreshSavedTransactionCount}
         formatNumber={formatNumber}
      />

      <ReceiptPreviewModal
         isOpen={isReceiptModalOpen}
         onClose={() => setIsReceiptModalOpen(false)}
         transaction={completedTransaction}
         store={storeSettings}
         formatNumber={formatNumber}
      />

    </div>
  );
}
