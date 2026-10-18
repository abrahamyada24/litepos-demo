import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, TextInput, Modal, FlatList } from 'react-native';
import tw, { useAppColorScheme } from 'twrnc';
import { useStore } from '../store/useStore';
import { getDBConnection } from '../database/db';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DatePickerDropdown from '../components/DatePickerDropdown';
import { PreOrderPaymentStatus, getPaymentStatusLabel } from '../utils/preOrderPayment';
import { syncService } from '../services/syncService';
import { restrictPhoneInput, normalizeCustomerPhone, customerPhoneAliases } from '../utils/customerPhone';
import {
    getCartItemBaseUnitPrice,
    getCartItemEffectiveOriginalUnitPrice,
    getCartItemEffectiveUnitPrice,
    getCartItemLineTotal,
} from '../utils/cartPricing';

export default function CheckoutScreen({ navigation }: any) {
    useAppColorScheme(tw);
    const { cart, cartTotal, cartSubtotal, updateCartQuantity, clearCart, discount, discountType, setDiscount, activeShift } = useStore();
    const settings = useStore(state => state.settings);
    const pendingOrderContext = useStore(state => state.pendingOrderContext);
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [cashAmount, setCashAmount] = useState('');
    const checkoutLockRef = useRef(false);
    const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

    // Customer selection
    const [customers, setCustomers] = useState<any[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const [guestName, setGuestName] = useState('');
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [isSavingCustomer, setIsSavingCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });

    // Discount modal
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [discountInput, setDiscountInput] = useState('');
    const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');

    // Order Type (Dine-in / Take-away)
    const [orderType, setOrderType] = useState<'TAKE_AWAY' | 'DINE_IN'>('TAKE_AWAY');
    const [availableTables, setAvailableTables] = useState<any[]>([]);
    const [selectedTable, setSelectedTable] = useState<any>(null);
    const [showTableModal, setShowTableModal] = useState(false);

    // Pre-order
    const [preOrderDate, setPreOrderDate] = useState('');
    const [showPreOrderInput, setShowPreOrderInput] = useState(false);
    const [preOrderPaymentStatus, setPreOrderPaymentStatus] = useState<PreOrderPaymentStatus>('PAID');
    const [dpAmount, setDpAmount] = useState('');

    // Save pending
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [pendingName, setPendingName] = useState('');

    // Take Away Options (Layanan Beli Online)
    const [takeAwayOption, setTakeAwayOption] = useState('');
    const [takeAwayOptionsList, setTakeAwayOptionsList] = useState<string[]>([]);
    const [showTakeAwayModal, setShowTakeAwayModal] = useState(false);
    const [newTakeAwayOption, setNewTakeAwayOption] = useState('');

    // Loyalty State
    const [usePoints, setUsePoints] = useState(false);
    const [pointsToRedeem, setPointsToRedeem] = useState(0);
    const [showRewardModal, setShowRewardModal] = useState(false);
    const [rewardQuantities, setRewardQuantities] = useState<Record<string, number>>({});

    const subtotal = cartSubtotal();
    const totalBeforeTaxAndPoints = cartTotal();
    const discountAmount = subtotal - totalBeforeTaxAndPoints;
    const taxRatePercent = Math.max(0, Number(settings.taxRate) || 0);
    const taxRate = taxRatePercent / 100;
    const taxAmount = Math.round(totalBeforeTaxAndPoints * taxRate);
    const totalBeforePoints = totalBeforeTaxAndPoints + taxAmount;
    const loyaltyRedemptionMode = settings.loyalty_redemption_mode || 'FREE_PRODUCT';
    const pointsPerReward = Math.max(1, Number(settings.loyalty_min_points) || 10);
    const selectedRewardCount = Object.values(rewardQuantities).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
    const rewardDiscount = loyaltyRedemptionMode === 'FREE_PRODUCT'
        ? cart.reduce((sum, item) => sum + Math.min(item.quantity, rewardQuantities[item.cartItemId] || 0) * getCartItemEffectiveUnitPrice(item), 0)
        : 0;
    const pointsValue = usePoints
        ? Math.min(totalBeforePoints, loyaltyRedemptionMode === 'FREE_PRODUCT' ? rewardDiscount : pointsToRedeem * (settings.loyalty_point_value || 0))
        : 0;
    const total = Math.max(0, totalBeforePoints - pointsValue);
    const pointsEarnedPreview = settings.loyalty_active && selectedCustomer
        ? settings.loyalty_earning_mode === 'SPEND_MULTIPLE'
            ? Math.floor(total / (settings.loyalty_multiplier_amount || 25000)) * (settings.loyalty_multiplier || 1)
            : total >= (settings.loyalty_multiplier_amount || 25000) ? 1 : 0
        : 0;
    const rawCash = parseInt(cashAmount.replace(/\D/g, '') || '0', 10);
    const rawDpAmount = parseInt(dpAmount.replace(/\D/g, '') || '0', 10);
    const isPreOrder = !!preOrderDate;
    const paidAmount = isPreOrder
        ? preOrderPaymentStatus === 'UNPAID'
            ? 0
            : preOrderPaymentStatus === 'PARTIAL'
                ? Math.min(rawDpAmount, total)
                : total
        : total;
    const paymentStatus: PreOrderPaymentStatus = !isPreOrder || paidAmount >= total ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
    const remainingAmount = Math.max(0, total - paidAmount);
    const amountDueNow = isPreOrder ? paidAmount : total;
    const effectivePaymentMethod = paymentStatus === 'UNPAID' ? 'PENDING' : paymentMethod;
    const changeAmount = paymentMethod === 'CASH' ? rawCash - amountDueNow : 0;
    const cashPaymentInvalid = amountDueNow > 0 && paymentMethod === 'CASH' && rawCash < amountDueNow;

    const formatRp = (num: number) => 'Rp ' + (Math.round(num) || 0).toLocaleString('id-ID');

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (!pendingOrderContext) return;

        const resolvePendingCustomer = async () => {
            if (pendingOrderContext.customerServerId) {
                const db = await getDBConnection();
                const [result] = await db.executeSql('SELECT * FROM customers WHERE serverId = ? LIMIT 1', [pendingOrderContext.customerServerId]);
                if (result.rows.length > 0) {
                    setSelectedCustomer(result.rows.item(0));
                    setGuestName('');
                    return;
                }
            }
            if (pendingOrderContext.customerName) setGuestName(pendingOrderContext.customerName);
        };
        resolvePendingCustomer().catch(() => {
            if (pendingOrderContext.customerName) setGuestName(pendingOrderContext.customerName);
        });

        if (pendingOrderContext.tableNumber) {
            setOrderType('DINE_IN');
            setSelectedTable({
                id: `remote-${pendingOrderContext.tableNumber}`,
                number: pendingOrderContext.tableNumber,
                name: 'Order QR',
            });
        }
    }, [pendingOrderContext]);

    const loadData = async () => {
        try {
            const db = await getDBConnection();
            
            // Load Customers
            const [resCust] = await db.executeSql('SELECT * FROM customers ORDER BY name');
            const arrCust: any[] = [];
            for (let i = 0; i < resCust.rows.length; i++) arrCust.push(resCust.rows.item(i));
            setCustomers(arrCust);

            // Load Take Away Options from settings (try synced key first, then local key)
            let optionsLoaded = false;
            for (const settingsKey of ['takeawayOptions', 'takeAwayOptions']) {
                const [resSettings] = await db.executeSql(`SELECT value FROM settings WHERE key = ?`, [settingsKey]);
                if (resSettings.rows.length > 0) {
                    const optionsStr = resSettings.rows.item(0).value;
                    if (optionsStr) {
                        try {
                            const parsed = JSON.parse(optionsStr);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                setTakeAwayOptionsList(parsed);
                                optionsLoaded = true;
                                break;
                            }
                        } catch {}
                    }
                }
            }
            if (!optionsLoaded) {
                const defaultOptions = ['GoFood', 'GrabFood', 'ShopeeFood'];
                await db.executeSql(`INSERT OR REPLACE INTO settings (key, value) VALUES ('takeAwayOptions', ?)`, [JSON.stringify(defaultOptions)]);
                setTakeAwayOptionsList(defaultOptions);
            }

            // Loyalty Config is now used from global settings in useStore
            
        } catch (e) { 
            console.error("Error loading checkout data:", e); 
        }
    };

    const handleSaveTakeAwayOptions = async (newList: string[]) => {
        try {
            const db = await getDBConnection();
            await db.executeSql(`INSERT OR REPLACE INTO settings (key, value) VALUES ('takeAwayOptions', ?)`, [JSON.stringify(newList)]);
            setTakeAwayOptionsList(newList);
        } catch (e) {
            console.error("Error saving takeaway options:", e);
        }
    };

    const handleAddTakeAwayOption = () => {
        const opt = newTakeAwayOption.trim();
        if (!opt) return;
        if (takeAwayOptionsList.includes(opt)) {
            Alert.alert('Info', 'Opsi ini sudah ada.');
            return;
        }
        const newList = [...takeAwayOptionsList, opt];
        handleSaveTakeAwayOptions(newList);
        setNewTakeAwayOption('');
    };

    const handleRemoveTakeAwayOption = (opt: string) => {
        Alert.alert('Hapus', `Hapus opsi ${opt}?`, [
            { text: 'Batal', style: 'cancel' },
            { text: 'Hapus', style: 'destructive', onPress: () => {
                const newList = takeAwayOptionsList.filter(item => item !== opt);
                handleSaveTakeAwayOptions(newList);
                if (takeAwayOption === opt) setTakeAwayOption('');
            }}
        ]);
    };

    const loadAvailableTables = async () => {
        if (!settings.enableDineTable) return;
        try {
            const db = await getDBConnection();
            const [res] = await db.executeSql("SELECT * FROM dine_tables WHERE status = 'AVAILABLE' ORDER BY number ASC");
            const arr: any[] = [];
            for (let i = 0; i < res.rows.length; i++) arr.push(res.rows.item(i));
            setAvailableTables(arr);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (orderType === 'DINE_IN') loadAvailableTables();
        else setSelectedTable(null);
    }, [orderType]);

    useEffect(() => {
        if (!pendingOrderContext?.tableNumber || orderType !== 'DINE_IN') return;
        const existingTable = availableTables.find(table => table.number === pendingOrderContext.tableNumber);
        setSelectedTable(existingTable || {
            id: `remote-${pendingOrderContext.tableNumber}`,
            number: pendingOrderContext.tableNumber,
            name: 'Order QR',
        });
    }, [availableTables, orderType, pendingOrderContext]);

    const selectCustomer = (customer: any) => {
        setSelectedCustomer(customer);
        setUsePoints(false);
        setPointsToRedeem(0);
        setRewardQuantities({});
        setShowCustomerModal(false);
        setCustomerSearch('');
        // Auto-apply loyalty discount if set
        if (customer.loyaltyDiscount > 0) {
            setDiscount(customer.loyaltyDiscount, 'percent');
        }
    };

    const clearCustomer = () => {
        setSelectedCustomer(null);
        setDiscount(0, 'amount');
        setUsePoints(false);
        setPointsToRedeem(0);
        setRewardQuantities({});
    };

    const openCreateCustomer = () => {
        setNewCustomer({ name: customerSearch.trim(), phone: '' });
        setShowCreateCustomer(true);
    };

    const closeCustomerModal = () => {
        setShowCustomerModal(false);
        setShowCreateCustomer(false);
        setCustomerSearch('');
        setNewCustomer({ name: '', phone: '' });
    };

    const handleCreateCustomer = async () => {
        const name = newCustomer.name.trim();
        let phone: string | null;
        try { phone = normalizeCustomerPhone(newCustomer.phone); } catch (error: any) { Alert.alert('Validasi', error.message); return; }

        if (!name) {
            Alert.alert('Nama Belum Diisi', 'Masukkan nama pelanggan terlebih dahulu.');
            return;
        }
        if (isSavingCustomer) return;

        setIsSavingCustomer(true);
        try {
            const db = await getDBConnection();
            if (phone) {
                const aliases = customerPhoneAliases(phone);
                const [duplicate] = await db.executeSql(
                    `SELECT id FROM customers WHERE TRIM(phone) IN (${aliases.map(() => '?').join(',')}) LIMIT 1`,
                    aliases
                );
                if (duplicate.rows.length > 0) {
                    Alert.alert('Nomor HP Sudah Terdaftar', 'Pilih pelanggan yang sudah ada atau gunakan nomor HP lain.');
                    return;
                }
            }

            const [result] = await db.executeSql(
                'INSERT INTO customers (name, phone, notes, loyaltyDiscount, points, isSynced) VALUES (?, ?, ?, 0, 0, 0)',
                [name, phone || null, null]
            );
            const createdCustomer = {
                id: result.insertId,
                name,
                phone: phone || null,
                notes: null,
                loyaltyDiscount: 0,
                points: 0,
                isSynced: 0,
            };

            setCustomers(current => [...current, createdCustomer].sort((a, b) => a.name.localeCompare(b.name, 'id')));
            setShowCreateCustomer(false);
            setNewCustomer({ name: '', phone: '' });
            selectCustomer(createdCustomer);

            // SQLite tetap menjadi sumber utama supaya pembuatan pelanggan selalu
            // berhasil offline. Saat online, coba sinkron sekarang; polling aplikasi
            // akan mencoba kembali otomatis apabila jaringan belum tersedia.
            void syncService.pushLocalData().catch(error => {
                console.log('Pelanggan tersimpan offline dan akan disinkronkan nanti:', error?.message || error);
            });
        } catch (error) {
            console.error('Create customer failed:', error);
            Alert.alert('Gagal Menambah Pelanggan', 'Data belum dapat disimpan. Coba lagi.');
        } finally {
            setIsSavingCustomer(false);
        }
    };

    const toggleLoyaltyPoints = () => {
        if (!selectedCustomer) return;
        if (!settings.loyalty_active) {
            Alert.alert('Info', 'Program loyalitas sedang tidak aktif.');
            return;
        }
        if (paymentStatus !== 'PAID') {
            Alert.alert('Belum Lunas', 'Poin hanya dapat ditukar pada transaksi yang langsung lunas.');
            return;
        }
        if (!usePoints) {
            if (selectedCustomer.points < (settings.loyalty_min_points || 0)) {
                Alert.alert('Poin Tidak Cukup', `Minimal penukaran adalah ${settings.loyalty_min_points} poin.\nPoin Anda: ${selectedCustomer.points}`);
                return;
            }
            if (loyaltyRedemptionMode === 'FREE_PRODUCT') {
                setShowRewardModal(true);
                return;
            }
            const maxReachable = Math.floor(totalBeforePoints / Math.max(1, settings.loyalty_point_value || 1));
            setPointsToRedeem(Math.min(Number(selectedCustomer.points) || 0, maxReachable));
            setUsePoints(true);
        } else {
            setUsePoints(false);
            setPointsToRedeem(0);
            setRewardQuantities({});
        }
    };

    const maxRewardCount = Math.floor((Number(selectedCustomer?.points) || 0) / pointsPerReward);
    const changeRewardQuantity = (cartItemId: string, delta: number, maxItemQty: number) => {
        setRewardQuantities(current => {
            const currentQty = current[cartItemId] || 0;
            const currentTotal = Object.values(current).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
            if (delta > 0 && currentTotal >= maxRewardCount) return current;
            const nextQty = Math.max(0, Math.min(maxItemQty, currentQty + delta));
            return { ...current, [cartItemId]: nextQty };
        });
    };

    const confirmRewardSelection = () => {
        const count = Object.values(rewardQuantities).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
        if (count <= 0) {
            Alert.alert('Pilih Produk', 'Pilih minimal 1 produk dari keranjang untuk ditukar.');
            return;
        }
        if (count > maxRewardCount) {
            Alert.alert('Poin Tidak Cukup', `Maksimal ${maxRewardCount} produk untuk saldo poin saat ini.`);
            return;
        }
        setPointsToRedeem(count * pointsPerReward);
        setUsePoints(true);
        setShowRewardModal(false);
    };

    const handlePresetCash = (amount: number | 'PAS' | 'RESET') => {
        if (amount === 'RESET') { setCashAmount(''); }
        else if (amount === 'PAS') { setCashAmount(amountDueNow.toString()); }
        else { setCashAmount((rawCash + amount).toString()); }
    };

    const applyDiscount = () => {
        const val = parseFloat(discountInput.replace(/[^0-9]/g, '') || '0');
        if (discountMode === 'percent' && val > 100) { Alert.alert('Validasi', 'Diskon persen maksimal 100%'); return; }
        setDiscount(val, discountMode);
        setShowDiscountModal(false);
        setDiscountInput('');
    };

    const handleSavePending = async () => {
        if (!pendingName.trim()) { Alert.alert('Validasi', 'Beri nama untuk penjualan yang disimpan.'); return; }
        try {
            const db = await getDBConnection();
            const id = 'pending-' + Date.now().toString();
            await db.executeSql(
                `INSERT INTO saved_transactions (id, name, cartData, createdAt) VALUES (?, ?, ?, ?)`,
                [id, pendingName.trim(), JSON.stringify(cart), new Date().toISOString()]
            );
            clearCart();
            setShowSaveModal(false);
            Alert.alert('Tersimpan', 'Penjualan berhasil disimpan.');
            navigation.goBack();
        } catch (e) { Alert.alert('Error', 'Gagal menyimpan transaksi.'); }
    };

    const handleCheckout = async () => {
        if (checkoutLockRef.current) return;
        if (usePoints && paymentStatus !== 'PAID') {
            Alert.alert('Belum Lunas', 'Batalkan penukaran poin atau lunasi transaksi terlebih dahulu.');
            return;
        }
        if (isPreOrder && preOrderPaymentStatus === 'PARTIAL' && (rawDpAmount <= 0 || rawDpAmount >= total)) {
            Alert.alert('Validasi DP', 'Nominal DP harus lebih dari 0 dan lebih kecil dari total pesanan.');
            return;
        }
        if (cashPaymentInvalid) {
            Alert.alert('Uang Kurang', `Uang tunai tidak cukup.\nKurang: ${formatRp(amountDueNow - rawCash)}`);
            return;
        }
        // Ref terkunci pada event yang sama, sebelum await pertama, sehingga dua tap
        // cepat tidak dapat membuat dua invoice dan dua nomor antrean dapur.
        checkoutLockRef.current = true;
        setIsProcessingCheckout(true);
        // Meja dine-in bersifat opsional — tidak wajib dipilih
        try {
            const db = await getDBConnection();
            const [pendingTransactions] = await db.executeSql(
                'SELECT id FROM transactions WHERE isSynced = 0 LIMIT 1'
            );
            if (pendingTransactions.rows.length > 0) {
                const retryResult: any = await syncService.pushLocalData();
                const [stillPending] = await db.executeSql(
                    'SELECT id FROM transactions WHERE isSynced = 0 LIMIT 1'
                );
                Alert.alert(
                    stillPending.rows.length === 0 ? 'Sinkronisasi Berhasil' : 'Belum Tersinkron',
                    stillPending.rows.length === 0
                        ? 'Transaksi sebelumnya sudah tersimpan di server. Periksa laporan sebelum membuat transaksi baru.'
                        : (retryResult?.error || 'Transaksi sebelumnya belum dapat disimpan ke server. Periksa internet lalu coba lagi.')
                );
                return;
            }
            const invoiceNumber = `INV-${Date.now()}`;
            const trxId = Math.random().toString(36).substring(7) + Date.now().toString(36);
            const createdAt = new Date().toISOString();
            const custNameBase = selectedCustomer ? selectedCustomer.name : (guestName.trim() || 'Umum');
            const custNameFinal = orderType === 'TAKE_AWAY' && takeAwayOption ? `${custNameBase} (${takeAwayOption})` : custNameBase;
            const pointsEarned = settings.loyalty_active && selectedCustomer && paymentStatus === 'PAID' ? pointsEarnedPreview : 0;
            const redeemedPoints = usePoints ? pointsToRedeem : 0;
            const newPoints = selectedCustomer ? Math.max(0, (Number(selectedCustomer.points) || 0) - redeemedPoints + pointsEarned) : 0;

            await db.executeSql(
                `INSERT INTO transactions (id, invoiceNumber, grandTotal, discountAmount, taxAmount, paymentMethod, cashAmount, changeAmount, customerId, customerName, createdAt, preOrderDate, paymentStatus, paidAmount, remainingAmount, paidAt, orderType, tableName, pointsEarned, pointsRedeemed, pointsBalanceAfter, loyaltyRedemptionMode, shiftId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [trxId, invoiceNumber, total, discountAmount + pointsValue, taxAmount, effectivePaymentMethod,
                    paymentMethod === 'CASH' ? rawCash : amountDueNow,
                    paymentMethod === 'CASH' ? Math.max(0, changeAmount) : 0,
                    selectedCustomer?.id || null, custNameFinal,
                    createdAt,
                    preOrderDate ? (preOrderDate.length === 16 ? preOrderDate.replace(' ', 'T') + ':00.000Z' : preOrderDate + 'T00:00:00.000Z') : null,
                    paymentStatus,
                    paidAmount,
                    remainingAmount,
                    paidAmount > 0 ? createdAt : null,
                    orderType, selectedTable?.number || null,
                    pointsEarned, redeemedPoints, selectedCustomer ? newPoints : null, usePoints ? loyaltyRedemptionMode : null, activeShift?.id || null]
            );

            // Optional: Mark table as OCCUPIED automatically
            if (orderType === 'DINE_IN' && selectedTable) {
                try {
                    await db.executeSql(`UPDATE dine_tables SET status = 'OCCUPIED', isSynced = 0 WHERE id = ?`, [selectedTable.id]);
                } catch (e) { console.error("Failed to update table status", e); }
            }

            for (const item of cart) {
                const storedUnitPrice = getCartItemEffectiveUnitPrice(item);
                const storedOriginalUnitPrice = getCartItemEffectiveOriginalUnitPrice(item);
                await db.executeSql(
                    `INSERT INTO transaction_items (transactionId, productId, quantity, price, originalPrice, discountAmount, costPrice, notes, loyaltyRewardQty, loyaltyRewardDiscount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [trxId, item.id, item.quantity, storedUnitPrice, storedOriginalUnitPrice, item.discountAmount || 0, item.costPrice || 0, item.notes || null,
                        usePoints && loyaltyRedemptionMode === 'FREE_PRODUCT' ? (rewardQuantities[item.cartItemId] || 0) : 0,
                        usePoints && loyaltyRedemptionMode === 'FREE_PRODUCT' ? (rewardQuantities[item.cartItemId] || 0) * storedUnitPrice : 0]
                );
                if (item.isUnlimitedStock !== 1) {
                    await db.executeSql(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.quantity, item.id]);
                }
            }

            // Optional update customer points
            if (selectedCustomer) {
                await db.executeSql(`UPDATE customers SET points = ?, isSynced = 0 WHERE id = ?`, [newPoints, selectedCustomer.id]);
                if (pointsEarned > 0 || usePoints) {
                    console.log(`Customer ${selectedCustomer.name} points updated: ${selectedCustomer.points} -> ${newPoints} (Earned: ${pointsEarned}, Redeemed: ${pointsToRedeem})`);
                }
            }

            // Demo SaaS tidak menganggap cache perangkat sebagai penyimpanan
            // transaksi. Checkout baru dinyatakan berhasil setelah backend
            // mengakui ID transaksi yang sama (deduplikasi androidId).
            let syncResult: any = await syncService.pushLocalData();
            if (syncResult?.requiresMasterSync) {
                const masterResult: any = await syncService.syncMasterData();
                if (!masterResult?.success) throw new Error(masterResult?.error || 'Data usaha belum siap.');
                syncResult = await syncService.pushLocalData();
            }
            if (!syncResult?.success) throw new Error(syncResult?.error || 'Transaksi belum tersimpan di server.');
            const [syncCheck] = await db.executeSql('SELECT isSynced FROM transactions WHERE id = ?', [trxId]);
            if (syncCheck.rows.length === 0 || Number(syncCheck.rows.item(0).isSynced) !== 1) {
                throw new Error('Server belum mengakui transaksi. Data tetap ditahan dan akan dicoba lagi.');
            }

            const receiptData = {
                invoiceNumber, createdAt,
                customerName: custNameFinal,
                customerPhone: selectedCustomer?.phone || null,
                subtotal, discountAmount: discountAmount + pointsValue, loyaltyDiscountAmount: pointsValue, taxAmount, taxRate: taxRatePercent, total, paymentMethod: effectivePaymentMethod,
                cashAmount: paymentMethod === 'CASH' ? rawCash : amountDueNow,
                changeAmount: Math.max(0, changeAmount),
                preOrderDate: preOrderDate || null,
                paymentStatus,
                paidAmount,
                remainingAmount,
                paidAt: paidAmount > 0 ? createdAt : null,
                orderType,
                tableName: selectedTable?.number || null,
                takeAwayOption: orderType === 'TAKE_AWAY' ? takeAwayOption : null,
                pointsEarned,
                pointsRedeemed: redeemedPoints,
                customerPoints: selectedCustomer ? newPoints : null,
                loyaltyRedemptionMode: usePoints ? loyaltyRedemptionMode : null,
                items: cart.map(item => ({
                    ...item,
                    loyaltyRewardQty: usePoints && loyaltyRedemptionMode === 'FREE_PRODUCT' ? (rewardQuantities[item.cartItemId] || 0) : 0,
                }))
            };

            clearCart();
            navigation.replace('ReceiptPreview', { receiptData });
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Gagal memproses transaksi. Coba lagi.');
        } finally {
            checkoutLockRef.current = false;
            setIsProcessingCheckout(false);
        }
    };

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone || '').includes(customerSearch)
    );

    return (
        <View style={tw`flex-1 bg-gray-50 dark:bg-gray-900`}>
            <View style={tw`bg-white dark:bg-gray-800 px-4 py-3 flex-row items-center border-b border-gray-200 dark:border-gray-700`}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={tw`p-2 mr-2`}>
                    <Icon name="arrow-left" size={24} color={tw.color('gray-800')} />
                </TouchableOpacity>
                <Text style={tw`text-xl font-black text-gray-800 dark:text-gray-100 flex-1`}>Checkout</Text>
                <TouchableOpacity style={tw`bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl flex-row items-center`} onPress={() => setShowSaveModal(true)}>
                    <Icon name="content-save" size={15} color={tw.color('amber-600')} />
                    <Text style={tw`text-amber-700 font-bold text-xs ml-1`}>Simpan</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={tw`p-4`}>
                {/* Customer Selection */}
                <View style={tw`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-4`}>
                    <View style={tw`bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-row items-center justify-between`}>
                        <Text style={tw`font-bold text-gray-700 dark:text-gray-200 text-sm`}>
                            <Icon name="account-multiple" size={14} color={tw.color('gray-500')} /> Pelanggan
                        </Text>
                        {selectedCustomer ? (
                            <TouchableOpacity onPress={clearCustomer}>
                                <Text style={tw`text-red-400 font-bold text-xs`}>Ganti</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>

                    {selectedCustomer ? (
                        <View style={tw`p-4 flex-row items-center`}>
                            <View style={tw`w-10 h-10 bg-blue-50 rounded-full items-center justify-center mr-3`}>
                                <Icon name="account-multiple" size={18} color={tw.color('blue-600')} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{selectedCustomer.name}</Text>
                                {selectedCustomer.phone ? <Text style={tw`text-xs text-gray-500`}>{selectedCustomer.phone}</Text> : null}
                                {selectedCustomer.loyaltyDiscount > 0 && (
                                    <Text style={tw`text-xs font-bold text-green-600 mt-0.5`}>Diskon loyalitas {selectedCustomer.loyaltyDiscount}% diterapkan</Text>
                                )}
                                {settings.loyalty_active && (
                                    <View style={tw`flex-row items-center mt-1`}>
                                        <Icon name="tag-outline" size={12} color={tw.color('blue-600')} style={tw`mr-1`} />
                                        <Text style={tw`text-xs font-bold text-blue-600`}>{selectedCustomer.points || 0} Poin</Text>
                                        <TouchableOpacity 
                                            onPress={toggleLoyaltyPoints}
                                            style={tw`ml-3 bg-blue-600 px-2 py-0.5 rounded-full`}
                                        >
                                            <Text style={tw`text-[10px] font-black text-white`}>{usePoints ? 'Batalkan Tukar' : 'Tukar Poin'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </View>
                    ) : (
                        <View style={tw`p-4`}>
                            {/* Guest name input */}
                            <TextInput
                                style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-gray-800 dark:text-gray-100 text-sm mb-3`}
                                placeholder="Nama pelanggan (opsional, default: Umum)"
                                value={guestName}
                                onChangeText={setGuestName}
                            />
                            <TouchableOpacity
                                style={tw`border border-blue-200 bg-blue-50 py-2 rounded-xl flex-row items-center justify-center`}
                                onPress={() => setShowCustomerModal(true)}
                            >
                                <Icon name="account-multiple" size={15} color={tw.color('blue-600')} />
                                <Text style={tw`text-blue-600 font-bold text-xs ml-2`}>Pilih dari Daftar Pelanggan</Text>
                                <Icon name="chevron-right" size={14} color={tw.color('blue-400')} />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Jenis Pesanan (Order Type) - Only show if Dine-In Table feature is enabled */}
                {settings.enableDineTable && (
                    <View style={tw`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-4 p-4`}>
                        <Text style={tw`font-bold text-gray-700 dark:text-gray-200 text-sm mb-3`}>Jenis Pesanan</Text>
                        <View style={tw`flex-row gap-3`}>
                            <TouchableOpacity
                                style={tw`flex-1 p-3 border rounded-xl flex-row items-center justify-center ${orderType === 'TAKE_AWAY' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'}`}
                                onPress={() => setOrderType('TAKE_AWAY')}
                            >
                                <Icon name="store" size={18} color={orderType === 'TAKE_AWAY' ? tw.color('orange-600') : tw.color('gray-400')} style={tw`mr-2`} />
                                <Text style={tw`font-bold text-sm ${orderType === 'TAKE_AWAY' ? 'text-orange-700 dark:text-orange-200' : 'text-gray-600 dark:text-gray-400'}`}>Take Away</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={tw`flex-1 p-3 border rounded-xl flex-row items-center justify-center ${orderType === 'DINE_IN' ? 'border-green-500 bg-green-50 dark:bg-green-900' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'}`}
                                onPress={() => setOrderType('DINE_IN')}
                            >
                                <Icon name="silverware-fork-knife" size={18} color={orderType === 'DINE_IN' ? tw.color('green-600') : tw.color('gray-400')} style={tw`mr-2`} />
                                <Text style={tw`font-bold text-sm ${orderType === 'DINE_IN' ? 'text-green-700 dark:text-green-200' : 'text-gray-600 dark:text-gray-400'}`}>Dine In</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Take Away Options Selection */}
                        {orderType === 'TAKE_AWAY' && (
                            <View style={tw`mt-4 pt-4 border-t border-gray-100 dark:border-gray-700`}>
                                <View style={tw`flex-row justify-between items-center mb-2`}>
                                    <Text style={tw`text-xs font-bold text-gray-500 dark:text-gray-400`}>Layanan Beli Online (Opsional)</Text>
                                    <TouchableOpacity onPress={() => setShowTakeAwayModal(true)}>
                                        <Text style={tw`text-xs font-bold text-blue-600`}>Kelola Opsi</Text>
                                    </TouchableOpacity>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`flex-row gap-2`}>
                                    <TouchableOpacity
                                        style={tw`px-4 py-2 rounded-full border ${!takeAwayOption ? 'bg-orange-600 border-orange-600' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                                        onPress={() => setTakeAwayOption('')}
                                    >
                                        <Text style={tw`text-xs font-bold ${!takeAwayOption ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>Standar</Text>
                                    </TouchableOpacity>
                                    {takeAwayOptionsList.map(opt => (
                                        <TouchableOpacity
                                            key={opt}
                                            style={tw`px-4 py-2 rounded-full border ${takeAwayOption === opt ? 'bg-orange-600 border-orange-600' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                                            onPress={() => setTakeAwayOption(opt)}
                                        >
                                            <Text style={tw`text-xs font-bold ${takeAwayOption === opt ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>{opt}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {/* Table Selection when Dine-in and feature enabled */}
                        {orderType === 'DINE_IN' && (
                            <TouchableOpacity
                                style={tw`mt-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex-row items-center justify-between`}
                                onPress={() => setShowTableModal(true)}
                            >
                                <View style={tw`flex-row items-center`}>
                                    <View style={tw`w-8 h-8 rounded-full ${selectedTable ? 'bg-green-100 dark:bg-green-800' : 'bg-gray-200 dark:bg-gray-700'} items-center justify-center mr-3`}>
                                        <Icon name="silverware-fork-knife" size={14} color={selectedTable ? tw.color('green-600') : tw.color('gray-500')} />
                                    </View>
                                    <View>
                                        <Text style={tw`text-xs text-gray-500 dark:text-gray-400`}>Pilih Meja</Text>
                                        <Text style={tw`font-bold ${selectedTable ? 'text-green-700 dark:text-green-400 text-sm' : 'text-gray-800 dark:text-gray-100'}`}>
                                            {selectedTable ? `Meja ${selectedTable.number}` : 'Belum pilih meja'}
                                        </Text>
                                    </View>
                                </View>
                                <Icon name="chevron-right" size={20} color={tw.color('gray-400')} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Pre-Order Section */}
                {settings.enablePreOrder && (
                    <View style={tw`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-purple-100 dark:border-gray-800 overflow-hidden mb-4`}>
                        <TouchableOpacity
                            style={tw`flex-row items-center justify-between px-4 py-3`}
                            onPress={() => setShowPreOrderInput(!showPreOrderInput)}
                        >
                            <View style={tw`flex-row items-center`}>
                                <Icon name="calendar" size={16} color={tw.color('purple-600')} style={tw`mr-2`} />
                                <Text style={tw`font-bold text-gray-800 dark:text-gray-100 text-sm`}>Pre-Order</Text>
                                {preOrderDate ? (
                                    <View style={tw`ml-2 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full`}>
                                        <Text style={tw`text-[10px] font-black text-purple-600`}>
                                            {preOrderDate.length >= 10 ? `${preOrderDate.substring(8, 10)}-${preOrderDate.substring(5, 7)}-${preOrderDate.substring(0, 4)}${preOrderDate.length === 16 ? ` ${preOrderDate.substring(11)}` : ''}` : preOrderDate}
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={tw`text-gray-400 text-xs ml-2`}>Opsional</Text>
                                )}
                            </View>
                            <Text style={tw`text-purple-600 font-bold text-xs`}>{showPreOrderInput ? 'Tutup' : 'Atur'}</Text>
                        </TouchableOpacity>

                        {showPreOrderInput && (
                            <View style={tw`px-4 pb-4 border-t border-gray-50 dark:border-gray-800 pt-3`}>
                                <Text style={tw`text-xs text-gray-500 mb-2`}>Tanggal pengambilan / pengiriman</Text>
                                <View style={tw`flex-row items-center gap-2`}>
                                    <View style={tw`flex-1`}>
                                        <DatePickerDropdown
                                            value={preOrderDate}
                                            onChange={(value) => {
                                                setPreOrderDate(value);
                                                if (!value) {
                                                    setPreOrderPaymentStatus('PAID');
                                                    setDpAmount('');
                                                }
                                            }}
                                            placeholder="Pilih tanggal pre-order"
                                            withTime={true}
                                        />
                                    </View>
                                    {preOrderDate ? (
                                        <TouchableOpacity style={tw`p-3 bg-red-50 rounded-xl`} onPress={() => {
                                            setPreOrderDate('');
                                            setPreOrderPaymentStatus('PAID');
                                            setDpAmount('');
                                        }}>
                                            <Icon name="close" size={16} color={tw.color('red-400')} />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>

                                {preOrderDate ? (
                                    <View style={tw`mt-4`}>
                                        <Text style={tw`text-xs text-gray-500 mb-2`}>Status pembayaran</Text>
                                        <View style={tw`flex-row gap-2`}>
                                            {([
                                                { value: 'PAID', label: 'Lunas' },
                                                { value: 'UNPAID', label: 'Belum Bayar' },
                                                { value: 'PARTIAL', label: 'DP' },
                                            ] as { value: PreOrderPaymentStatus; label: string }[]).map(opt => {
                                                const active = preOrderPaymentStatus === opt.value;
                                                return (
                                                    <TouchableOpacity
                                                        key={opt.value}
                                                        style={tw`flex-1 py-3 rounded-xl border items-center ${active ? 'bg-purple-50 border-purple-600' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`}
                                                        onPress={() => {
                                                            setPreOrderPaymentStatus(opt.value);
                                                            if (opt.value !== 'PARTIAL') setDpAmount('');
                                                        }}
                                                    >
                                                        <Text style={tw`text-[11px] font-black ${active ? 'text-purple-600' : 'text-gray-500 dark:text-gray-300'}`}>
                                                            {opt.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>

                                        {preOrderPaymentStatus === 'PARTIAL' ? (
                                            <View style={tw`mt-3`}>
                                                <Text style={tw`text-xs text-gray-500 mb-2`}>Nominal DP</Text>
                                                <TextInput
                                                    style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-lg font-bold text-gray-800 dark:text-gray-100`}
                                                    keyboardType="numeric"
                                                    placeholder="0"
                                                    value={dpAmount ? parseInt(dpAmount).toLocaleString('id-ID') : ''}
                                                    onChangeText={(text) => setDpAmount(text.replace(/[^0-9]/g, ''))}
                                                />
                                            </View>
                                        ) : null}

                                        <View style={tw`mt-3 bg-purple-50 dark:bg-gray-900 rounded-xl p-3`}>
                                            <View style={tw`flex-row justify-between mb-1`}>
                                                <Text style={tw`text-xs text-gray-500`}>Dibayar sekarang</Text>
                                                <Text style={tw`text-xs font-black text-purple-700`}>{formatRp(amountDueNow)}</Text>
                                            </View>
                                            <View style={tw`flex-row justify-between`}>
                                                <Text style={tw`text-xs text-gray-500`}>Sisa saat ambil</Text>
                                                <Text style={tw`text-xs font-black text-purple-700`}>{formatRp(remainingAmount)}</Text>
                                            </View>
                                        </View>
                                    </View>
                                ) : null}
                            </View>
                        )}
                    </View>
                )}

                {/* Order List */}
                <View style={tw`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-4`}>
                    <View style={tw`bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-100 dark:border-gray-800`}>
                        <Text style={tw`font-bold text-gray-700 dark:text-gray-200`}>Daftar Pesanan</Text>
                    </View>
                    {cart.map((item, idx) => (
                        <View key={idx} style={tw`p-4 border-b border-gray-50 dark:border-gray-800`}>
                            <View style={tw`flex-row justify-between items-center mb-1`}>
                                <Text style={tw`font-bold text-gray-800 dark:text-gray-100 flex-1`}>{item.name}</Text>
                                <Text style={tw`font-bold text-blue-600`}>{formatRp(getCartItemLineTotal(item))}</Text>
                            </View>
                            {item.notes ? <Text style={tw`text-[10px] text-gray-500 italic mb-2`}>Catatan: {item.notes}</Text> : null}
                            <View style={tw`flex-row justify-between items-center`}>
                                <Text style={tw`text-xs text-gray-500 mt-1`}>{formatRp(getCartItemBaseUnitPrice(item))} / item</Text>
                                <View style={tw`flex-row items-center border border-gray-200 dark:border-gray-700 rounded-lg`}>
                                    <TouchableOpacity onPress={() => updateCartQuantity(item.cartItemId, item.quantity - 1)} style={tw`p-2 bg-gray-50 dark:bg-gray-900 rounded-l-lg`}>
                                        <Icon name="minus" size={14} color={tw.color('gray-600')} />
                                    </TouchableOpacity>
                                    <Text style={tw`px-4 font-bold text-gray-800 dark:text-gray-100`}>{item.quantity}</Text>
                                    <TouchableOpacity onPress={() => updateCartQuantity(item.cartItemId, item.quantity + 1)} style={tw`p-2 bg-gray-50 dark:bg-gray-900 rounded-r-lg`}>
                                        <Icon name="plus" size={14} color={tw.color('gray-600')} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    ))}

                    {/* Subtotal & Discount */}
                    <View style={tw`p-4 bg-gray-50 dark:bg-gray-900`}>
                        <View style={tw`flex-row justify-between items-center mb-2`}>
                            <Text style={tw`text-gray-600 dark:text-gray-300 text-sm`}>Subtotal</Text>
                            <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{formatRp(subtotal)}</Text>
                        </View>
                        <View style={tw`flex-row justify-between items-center mb-2`}>
                            <TouchableOpacity onPress={() => setShowDiscountModal(true)} style={tw`flex-row items-center`}>
                                <Icon name="tag-outline" size={14} color={discountAmount > 0 ? tw.color('green-600') : tw.color('gray-400')} />
                                <Text style={tw`ml-1 text-sm font-bold ${discountAmount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                    {discountAmount > 0 ? `Diskon ${discountType === 'percent' ? `${discount}%` : ''}` : 'Tambah Diskon'}
                                </Text>
                            </TouchableOpacity>
                            {discountAmount > 0 ? (
                                <View style={tw`flex-row items-center`}>
                                    <Text style={tw`font-bold text-green-600 mr-2`}>- {formatRp(discountAmount)}</Text>
                                    <TouchableOpacity onPress={() => setDiscount(0, 'amount')}>
                                        <Icon name="close" size={14} color={tw.color('red-400')} />
                                    </TouchableOpacity>
                                </View>
                            ) : null}
                        </View>
                        {usePoints && (
                            <View style={tw`flex-row justify-between items-center mb-2`}>
                                <View style={tw`flex-row items-center`}>
                                    <Icon name="tag-outline" size={14} color={tw.color('blue-600')} />
                                    <Text style={tw`ml-1 text-sm font-bold text-blue-600`}>{loyaltyRedemptionMode === 'FREE_PRODUCT' ? `${selectedRewardCount} Produk Gratis` : `Tukar ${pointsToRedeem} Poin`}</Text>
                                </View>
                                <View style={tw`flex-row items-center`}>
                                    <Text style={tw`font-bold text-blue-600 mr-2`}>- {formatRp(pointsValue)}</Text>
                                    <TouchableOpacity onPress={() => { setUsePoints(false); setPointsToRedeem(0); setRewardQuantities({}); }}>
                                        <Icon name="close" size={14} color={tw.color('red-400')} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                        {settings.loyalty_active && selectedCustomer && (
                            <View style={tw`flex-row justify-between items-center mb-2`}>
                                <Text style={tw`text-xs text-blue-500 italic`}>Poin yang didapat:</Text>
                                <Text style={tw`text-xs font-bold text-blue-500`}>+{paymentStatus === 'PAID' ? pointsEarnedPreview : 0} Poin</Text>
                            </View>
                        )}
                        {taxAmount > 0 ? (
                            <View style={tw`flex-row justify-between items-center mb-2`}>
                                <Text style={tw`text-gray-600 dark:text-gray-300 text-sm`}>Pajak ({taxRatePercent}%)</Text>
                                <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{formatRp(taxAmount)}</Text>
                            </View>
                        ) : null}
                        <View style={tw`flex-row justify-between items-center border-t border-gray-200 dark:border-gray-700 pt-3`}>
                            <Text style={tw`font-black text-gray-800 dark:text-gray-100 uppercase text-sm`}>Total Bayar</Text>
                            <Text style={tw`text-2xl font-black text-blue-600`}>{formatRp(total)}</Text>
                        </View>
                    </View>
                </View>

                {/* Payment Method */}
                {amountDueNow > 0 ? (
                    <>
                        <Text style={tw`font-bold text-gray-800 dark:text-gray-100 mb-3 ml-1`}>Metode Pembayaran</Text>
                        <View style={tw`flex-row gap-3 mb-5`}>
                            {[{ label: 'TUNAI', method: 'CASH', icon: <Icon name="cash" size={20} color={paymentMethod === 'CASH' ? tw.color('blue-600') : tw.color('gray-400')} /> },
                            { label: 'QRIS', method: 'QRIS', icon: <Icon name="credit-card-outline" size={20} color={paymentMethod === 'QRIS' ? tw.color('blue-600') : tw.color('gray-400')} /> },
                            { label: 'TRANSFER', method: 'TRANSFER', icon: <Icon name="bank" size={20} color={paymentMethod === 'TRANSFER' ? tw.color('blue-600') : tw.color('gray-400')} /> }
                            ].map(opt => (
                                <TouchableOpacity key={opt.method} style={tw`flex-1 p-4 rounded-xl border flex-row items-center justify-center ${paymentMethod === opt.method ? 'bg-blue-50 dark:bg-blue-900 border-blue-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`} onPress={() => setPaymentMethod(opt.method)}>
                                    <View style={tw`mr-2`}>{opt.icon}</View>
                                    <Text style={tw`font-bold ${paymentMethod === opt.method ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400'}`}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {paymentMethod === 'CASH' ? (
                            <View style={tw`bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-6`}>
                                <Text style={tw`text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3`}>Pilih Nominal Uang (Bisa Dijumlahkan)</Text>
                                <TextInput
                                    style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4`}
                                    keyboardType="numeric"
                                    placeholder="Ketik total tunai di sini"
                                    value={cashAmount ? parseInt(cashAmount).toLocaleString('id-ID') : ''}
                                    onChangeText={(text) => setCashAmount(text.replace(/[^0-9]/g, ''))}
                                />
                                <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
                                    {[
                                        { label: 'Uang Pas', value: 'PAS' },
                                        { label: 'Reset', value: 'RESET' },
                                        { label: '100', value: 100 },
                                        { label: '200', value: 200 },
                                        { label: '500', value: 500 },
                                        { label: '1k', value: 1000 },
                                        { label: '2k', value: 2000 },
                                        { label: '5k', value: 5000 },
                                        { label: '10k', value: 10000 },
                                        { label: '20k', value: 20000 },
                                        { label: '50k', value: 50000 },
                                        { label: '100k', value: 100000 }
                                    ].map((preset, idx) => {
                                        const isPas = preset.value === 'PAS' && rawCash === amountDueNow && amountDueNow > 0;
                                        return (
                                            <TouchableOpacity
                                                key={idx}
                                                style={tw`w-[23%] py-3 rounded-xl border flex items-center justify-center ${isPas ? 'bg-blue-600 border-blue-600' : preset.value === 'RESET' ? 'bg-red-50 border-red-200 dark:bg-red-900 dark:border-red-700' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`}
                                                onPress={() => handlePresetCash(preset.value as any)}
                                            >
                                                <Text style={tw`font-bold text-[11px] ${isPas ? 'text-white' : preset.value === 'RESET' ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}>{preset.label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                {rawCash >= amountDueNow && (
                                    <View style={tw`flex-row justify-between items-center py-2 border-t border-dashed border-gray-200 dark:border-gray-700`}>
                                        <Text style={tw`font-bold text-gray-500 dark:text-gray-400`}>Kembalian</Text>
                                        <Text style={tw`text-xl font-black text-green-600`}>{formatRp(changeAmount)}</Text>
                                    </View>
                                )}
                            </View>
                        ) : (
                            <View style={tw`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 items-center mb-6`}>
                                <Text style={tw`text-sm font-medium text-gray-500 dark:text-gray-400 text-center`}>Arahkan pelanggan scan QRIS di layar atau dari print out stand Anda.</Text>
                            </View>
                        )}
                    </>
                ) : (
                    <View style={tw`bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-purple-100 dark:border-gray-800 mb-6`}>
                        <View style={tw`flex-row items-center`}>
                            <View style={tw`w-10 h-10 rounded-full bg-purple-50 items-center justify-center mr-3`}>
                                <Icon name="clock-outline" size={18} color={tw.color('purple-600')} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`font-black text-gray-800 dark:text-gray-100`}>Belum ada pembayaran</Text>
                                <Text style={tw`text-xs text-gray-500 dark:text-gray-400 mt-1`}>Total akan dibayar saat pesanan diambil.</Text>
                            </View>
                        </View>
                    </View>
                )}
            </ScrollView>

            <View style={tw`bg-white dark:bg-gray-800 p-4 border-t border-gray-200 dark:border-gray-700`}>
                <TouchableOpacity style={tw`bg-blue-600 py-4 rounded-xl items-center shadow-md ${cashPaymentInvalid || isProcessingCheckout ? 'opacity-50' : 'opacity-100'}`} onPress={handleCheckout} disabled={cashPaymentInvalid || isProcessingCheckout}>
                    <Text style={tw`text-white font-black text-lg tracking-wide uppercase`}>
                        {isProcessingCheckout ? 'Memproses...' : `${preOrderDate ? `Simpan Pre-Order ${getPaymentStatusLabel(paymentStatus)}` : 'Proses Bayar'} ${formatRp(amountDueNow)}`}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Customer Picker Modal */}
            <Modal visible={showCustomerModal} animationType="slide" transparent>
                <View style={tw`flex-1 bg-black/50 justify-end`}>
                    <View style={tw`bg-white dark:bg-gray-800 rounded-t-3xl p-6 max-h-[80%]`}>
                        <View style={tw`flex-row justify-between items-center mb-4`}>
                            <Text style={tw`text-xl font-bold text-gray-800 dark:text-gray-100`}>{showCreateCustomer ? 'Tambah Pelanggan' : 'Pilih Pelanggan'}</Text>
                            <TouchableOpacity onPress={closeCustomerModal} style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}>
                                <Icon name="close" size={20} color={tw.color('gray-600')} />
                            </TouchableOpacity>
                        </View>
                        {showCreateCustomer ? (
                            <View>
                                <TouchableOpacity onPress={() => setShowCreateCustomer(false)} style={tw`self-start flex-row items-center mb-4`}>
                                    <Icon name="arrow-left" size={18} color={tw.color('blue-600')} />
                                    <Text style={tw`ml-1 text-blue-600 font-bold text-sm`}>Kembali ke daftar</Text>
                                </TouchableOpacity>
                                <TextInput
                                    autoFocus
                                    maxLength={255}
                                    style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-3 text-gray-800 dark:text-gray-100`}
                                    placeholder="Nama pelanggan *"
                                    value={newCustomer.name}
                                    onChangeText={name => setNewCustomer(current => ({ ...current, name }))}
                                />
                                <TextInput
                                    keyboardType="phone-pad"
                                    style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-3 text-gray-800 dark:text-gray-100`}
                                    placeholder="Nomor HP (opsional)"
                                    value={newCustomer.phone}
                                    onChangeText={phone => setNewCustomer(current => ({ ...current, phone: restrictPhoneInput(phone) }))}
                                    maxLength={16}
                                />
                                <TouchableOpacity
                                    disabled={isSavingCustomer || !newCustomer.name.trim()}
                                    onPress={handleCreateCustomer}
                                    style={tw`bg-blue-600 py-3 rounded-xl flex-row items-center justify-center ${isSavingCustomer || !newCustomer.name.trim() ? 'opacity-50' : 'opacity-100'}`}
                                >
                                    <Icon name="content-save" size={17} color="white" />
                                    <Text style={tw`ml-2 text-white font-black`}>{isSavingCustomer ? 'Menyimpan...' : 'Simpan & Pilih Pelanggan'}</Text>
                                </TouchableOpacity>
                                <Text style={tw`text-[11px] text-gray-400 text-center mt-3`}>Bisa disimpan tanpa internet dan akan disinkronkan otomatis.</Text>
                            </View>
                        ) : (
                            <>
                                <TextInput
                                    style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-3 text-gray-800 dark:text-gray-100`}
                                    placeholder="Cari nama atau telepon..."
                                    value={customerSearch}
                                    onChangeText={setCustomerSearch}
                                />
                                <TouchableOpacity
                                    style={tw`border border-dashed border-blue-300 bg-blue-50 dark:bg-blue-900 py-3 rounded-xl flex-row items-center justify-center mb-3`}
                                    onPress={openCreateCustomer}
                                >
                                    <Icon name="account-plus" size={17} color={tw.color('blue-600')} />
                                    <Text style={tw`text-blue-600 dark:text-blue-200 font-bold text-sm ml-2`}>Tambah Pelanggan Baru</Text>
                                </TouchableOpacity>
                                <FlatList
                                    data={filteredCustomers}
                                    keyExtractor={item => String(item.id)}
                                    ListEmptyComponent={() => <Text style={tw`text-center text-gray-400 py-8`}>Belum ada pelanggan terdaftar</Text>}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={tw`flex-row items-center py-3 border-b border-gray-100 dark:border-gray-800`}
                                            onPress={() => selectCustomer(item)}
                                        >
                                            <View style={tw`w-10 h-10 bg-blue-50 rounded-full items-center justify-center mr-3`}>
                                                <Icon name="account-multiple" size={16} color={tw.color('blue-600')} />
                                            </View>
                                            <View style={tw`flex-1`}>
                                                <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{item.name}</Text>
                                                {item.phone ? <Text style={tw`text-xs text-gray-500`}>{item.phone}</Text> : null}
                                                <View style={tw`flex-row items-center mt-1`}>
                                                    <Icon name="tag-outline" size={10} color={tw.color('blue-600')} style={tw`mr-1`} />
                                                    <Text style={tw`text-[10px] font-bold text-blue-600`}>{item.points || 0} Poin</Text>
                                                </View>
                                            </View>
                                            {item.loyaltyDiscount > 0 && (
                                                <View style={tw`bg-green-50 border border-green-200 px-2 py-1 rounded-full ml-2`}>
                                                    <Text style={tw`text-[10px] font-black text-green-600`}>{item.loyaltyDiscount}% OFF</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    )}
                                />
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Discount Modal */}
            <Modal visible={showDiscountModal} transparent animationType="slide">
                <View style={tw`flex-1 bg-black/50 justify-end`}>
                    <View style={tw`bg-white dark:bg-gray-800 rounded-t-3xl p-6`}>
                        <View style={tw`flex-row justify-between items-center mb-5`}>
                            <Text style={tw`text-xl font-bold text-gray-800 dark:text-gray-100`}>Tambah Diskon</Text>
                            <TouchableOpacity onPress={() => setShowDiscountModal(false)} style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}><Icon name="close" size={20} color={tw.color('gray-600')} /></TouchableOpacity>
                        </View>
                        <View style={tw`flex-row bg-gray-100 dark:bg-gray-900 rounded-xl p-1 mb-5`}>
                            {(['amount', 'percent'] as const).map(mode => (
                                <TouchableOpacity key={mode} style={tw`flex-1 py-2 rounded-lg items-center ${discountMode === mode ? 'bg-white dark:bg-gray-800 shadow-sm' : ''}`} onPress={() => setDiscountMode(mode)}>
                                    <Text style={tw`font-bold ${discountMode === mode ? 'text-blue-600' : 'text-gray-500'}`}>{mode === 'amount' ? 'Nominal (Rp)' : 'Persen (%)'}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TextInput style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-4 text-2xl font-black text-gray-800 dark:text-gray-100 mb-2 text-center`}
                            keyboardType="numeric" placeholder={discountMode === 'percent' ? '10' : '5000'}
                            value={discountInput ? parseInt(discountInput).toLocaleString('id-ID') : ''}
                            onChangeText={(t) => setDiscountInput(t.replace(/[^0-9]/g, ''))} />
                        <Text style={tw`text-center text-gray-400 text-xs mb-5`}>
                            {discountMode === 'percent' ? `${discountInput || 0}% = ${formatRp(subtotal * (parseFloat(discountInput || '0') / 100))}` : `Diskon dari ${formatRp(subtotal)}`}
                        </Text>
                        <TouchableOpacity style={tw`bg-blue-600 py-4 rounded-xl items-center`} onPress={applyDiscount}>
                            <Text style={tw`text-white font-black text-base`}>Terapkan Diskon</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Save Pending Modal */}
            <Modal visible={showRewardModal} transparent animationType="slide" onRequestClose={() => setShowRewardModal(false)}>
                <View style={tw`flex-1 bg-black/50 justify-end`}>
                    <View style={tw`bg-white dark:bg-gray-800 rounded-t-3xl p-6 max-h-[75%]`}>
                        <View style={tw`flex-row justify-between items-center mb-2`}>
                            <Text style={tw`text-xl font-bold text-gray-800 dark:text-gray-100`}>Pilih Produk Gratis</Text>
                            <TouchableOpacity onPress={() => setShowRewardModal(false)} style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}>
                                <Icon name="close" size={20} color={tw.color('gray-600')} />
                            </TouchableOpacity>
                        </View>
                        <Text style={tw`text-xs text-gray-500 mb-4`}>
                            {pointsPerReward} poin = 1 produk. Tersedia {maxRewardCount} penukaran; sisanya boleh disimpan.
                        </Text>
                        <FlatList
                            data={cart}
                            keyExtractor={item => item.cartItemId}
                            renderItem={({ item }) => {
                                const qty = rewardQuantities[item.cartItemId] || 0;
                                return (
                                    <View style={tw`flex-row items-center py-3 border-b border-gray-100 dark:border-gray-700`}>
                                        <View style={tw`flex-1 mr-3`}>
                                            <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{item.name}</Text>
                                            <Text style={tw`text-xs text-gray-500`}>{formatRp(getCartItemEffectiveUnitPrice(item))} · {item.quantity} di keranjang</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => changeRewardQuantity(item.cartItemId, -1, item.quantity)} style={tw`w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-full items-center justify-center`}>
                                            <Icon name="minus" size={18} color={tw.color('gray-700')} />
                                        </TouchableOpacity>
                                        <Text style={tw`w-10 text-center font-black text-gray-800 dark:text-gray-100`}>{qty}</Text>
                                        <TouchableOpacity onPress={() => changeRewardQuantity(item.cartItemId, 1, item.quantity)} style={tw`w-9 h-9 bg-blue-600 rounded-full items-center justify-center`}>
                                            <Icon name="plus" size={18} color="white" />
                                        </TouchableOpacity>
                                    </View>
                                );
                            }}
                        />
                        <View style={tw`flex-row justify-between mt-4 mb-3`}>
                            <Text style={tw`font-bold text-gray-600 dark:text-gray-300`}>Dipakai</Text>
                            <Text style={tw`font-black text-blue-600`}>{selectedRewardCount * pointsPerReward} poin · {selectedRewardCount} produk</Text>
                        </View>
                        <TouchableOpacity style={tw`bg-blue-600 py-4 rounded-xl items-center`} onPress={confirmRewardSelection}>
                            <Text style={tw`text-white font-black`}>Gunakan Poin</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Save Pending Modal */}
            <Modal visible={showSaveModal} transparent animationType="slide">
                <View style={tw`flex-1 bg-black/50 justify-end`}>
                    <View style={tw`bg-white dark:bg-gray-800 rounded-t-3xl p-6`}>
                        <View style={tw`flex-row justify-between items-center mb-5`}>
                            <Text style={tw`text-xl font-bold text-gray-800 dark:text-gray-100`}>Simpan Penjualan</Text>
                            <TouchableOpacity onPress={() => setShowSaveModal(false)} style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}><Icon name="close" size={20} color={tw.color('gray-600')} /></TouchableOpacity>
                        </View>
                        <TextInput style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-5 text-gray-800 dark:text-gray-100 font-bold`}
                            placeholder="Contoh: Meja 1, Pesanan Pak Budi..."
                            value={pendingName} onChangeText={setPendingName} />
                        <TouchableOpacity style={tw`bg-amber-500 py-4 rounded-xl items-center`} onPress={handleSavePending}>
                            <Text style={tw`text-white font-black text-base`}>Simpan & Kembali ke Kasir</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            {/* Table Selection Modal */}
            <Modal visible={showTableModal} animationType="slide" transparent>
                <View style={tw`flex-1 bg-black/60 justify-end`}>
                    <View style={tw`bg-white dark:bg-gray-800 rounded-t-3xl h-[60%] p-6`}>
                        <View style={tw`flex-row justify-between items-center mb-5`}>
                            <Text style={tw`text-xl font-bold text-gray-800 dark:text-gray-100`}>Pilih Meja</Text>
                            <TouchableOpacity onPress={() => setShowTableModal(false)} style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}>
                                <Icon name="close" size={20} color={tw.color('gray-600')} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={availableTables}
                            keyExtractor={item => String(item.id)}
                            numColumns={3}
                            ListEmptyComponent={() => (
                                <Text style={tw`text-center text-gray-500 py-10`}>Tidak ada meja yang tersedia.</Text>
                            )}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={tw`flex-1 m-1.5 p-4 rounded-xl items-center justify-center border ${selectedTable?.id === item.id ? 'bg-green-50 border-green-500 dark:bg-green-900 border-2' : 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700'}`}
                                    onPress={() => {
                                        setSelectedTable(item);
                                        setShowTableModal(false);
                                    }}
                                >
                                    <Text style={tw`font-black text-lg ${selectedTable?.id === item.id ? 'text-green-700 dark:text-green-400' : 'text-gray-800 dark:text-gray-100'}`}>{item.number}</Text>
                                    {item.capacity ? <Text style={tw`text-[10px] text-gray-500`}>{item.capacity} kursi</Text> : null}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
            {/* Take Away Options Modal */}
            <Modal visible={showTakeAwayModal} transparent animationType="slide">
                <View style={tw`flex-1 bg-black/50 justify-end`}>
                    <View style={tw`bg-white dark:bg-gray-800 rounded-t-3xl p-6 h-[70%]`}>
                        <View style={tw`flex-row justify-between items-center mb-5`}>
                            <Text style={tw`text-xl font-bold text-gray-800 dark:text-gray-100`}>Layanan Beli Online</Text>
                            <TouchableOpacity onPress={() => setShowTakeAwayModal(false)} style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}><Icon name="close" size={20} color={tw.color('gray-600')} /></TouchableOpacity>
                        </View>

                        <View style={tw`flex-row gap-2 mb-4`}>
                            <TextInput
                                style={tw`flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100`}
                                placeholder="Contoh: ShopeeFood"
                                placeholderTextColor={tw.color('gray-400')}
                                value={newTakeAwayOption}
                                onChangeText={setNewTakeAwayOption}
                            />
                            <TouchableOpacity
                                style={tw`bg-blue-600 px-5 rounded-xl justify-center items-center`}
                                onPress={handleAddTakeAwayOption}
                            >
                                <Icon name="plus" size={20} color="white" />
                            </TouchableOpacity>
                        </View>

                        <Text style={tw`text-xs font-bold text-gray-500 mb-2 mt-2`}>Daftar Layanan Tersimpan</Text>
                        <FlatList
                            data={takeAwayOptionsList}
                            keyExtractor={item => item}
                            renderItem={({ item }) => (
                                <View style={tw`flex-row justify-between items-center py-3 border-b border-gray-100 dark:border-gray-800`}>
                                    <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{item}</Text>
                                    <TouchableOpacity
                                        style={tw`p-2 bg-red-50 dark:bg-red-900/30 rounded-full`}
                                        onPress={() => handleRemoveTakeAwayOption(item)}
                                    >
                                        <Icon name="close" size={16} color={tw.color('red-500')} />
                                    </TouchableOpacity>
                                </View>
                            )}
                            ListEmptyComponent={() => (
                                <Text style={tw`text-center text-gray-500 py-4`}>Belum ada layanan tersimpan.</Text>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </View>
    );
}
