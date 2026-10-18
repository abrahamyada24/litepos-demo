import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, Alert, Modal, ScrollView, Image, Switch, useWindowDimensions } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import tw, { useAppColorScheme } from 'twrnc';
import { getDBConnection } from '../database/db';
import { restrictPhoneInput, normalizeCustomerPhone, customerPhoneAliases } from '../utils/customerPhone';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useStore } from '../store/useStore';
import StockReceivingScreen from './StockReceivingScreen';
import StockOpnameScreen from './StockOpnameScreen';
import RNFS from 'react-native-fs';
import { resolveApiAssetUrl } from '../services/api';
import { closeConfiguredPrinter, connectConfiguredPrinter } from '../utils/printerConnection';
import ProductDiscountFields, { createDiscountValues, getDiscountScheduleForSave, validateDiscountSchedule } from '../components/ProductDiscountFields';

type TabType = 'products' | 'categories' | 'customers' | 'penerimaan' | 'opname' | 'stokDarurat';

export default function ManagementScreen({ navigation }: any) {
    useAppColorScheme(tw);
    const { height: screenH } = useWindowDimensions();
    const [activeTab, setActiveTab] = useState<TabType>('products');
    const [categories, setCategories] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const settings = useStore(s => s.settings);

    useEffect(() => { setSearchQuery(''); }, [activeTab]);

    const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
    const [isProductModalVisible, setProductModalVisible] = useState(false);
    const [isCustomerModalVisible, setCustomerModalVisible] = useState(false);

    const [editingCategory, setEditingCategory] = useState<any>(null);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [editingCustomer, setEditingCustomer] = useState<any>(null);

    // Category form
    const [categoryName, setCategoryName] = useState('');

    // Product form
    const [productName, setProductName] = useState('');
    const [productPrice, setProductPrice] = useState('');
    const [productCostPrice, setProductCostPrice] = useState('');
    const [enableCostPrice, setEnableCostPrice] = useState(false);
    const [productStock, setProductStock] = useState('');
    const [productCategoryId, setProductCategoryId] = useState('');
    const [productImageUrl, setProductImageUrl] = useState('');
    const [isUnlimitedStock, setIsUnlimitedStock] = useState(false);
    const [productBarcode, setProductBarcode] = useState('');
    // Add-ons for current product
    const [productAddons, setProductAddons] = useState<any[]>([]);
    const [newAddonName, setNewAddonName] = useState('');
    const [newAddonPrice, setNewAddonPrice] = useState('');
    const [productMinStock, setProductMinStock] = useState('');
    const [productDiscount, setProductDiscount] = useState<any>(createDiscountValues());

    // Customer form
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerNotes, setCustomerNotes] = useState('');
    const [customerPoints, setCustomerPoints] = useState('0');
    const [customerLoyaltyDiscount, setCustomerLoyaltyDiscount] = useState('0');

    const formatRp = (num: number) => 'Rp ' + (Math.round(num) || 0).toLocaleString('id-ID');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const db = await getDBConnection();

            const [catResults] = await db.executeSql('SELECT * FROM categories');
            const cats: any[] = [];
            for (let i = 0; i < catResults.rows.length; i++) cats.push(catResults.rows.item(i));
            setCategories(cats);

            const [prodResults] = await db.executeSql(`
                SELECT p.*, c.name as categoryName
                FROM products p LEFT JOIN categories c ON p.categoryId = c.id
                WHERE COALESCE(p.isActive, 1) = 1
            `);
            const prods: any[] = [];
            for (let i = 0; i < prodResults.rows.length; i++) prods.push(prodResults.rows.item(i));
            setProducts(prods);

            const [custResults] = await db.executeSql('SELECT * FROM customers ORDER BY name');
            const custs: any[] = [];
            for (let i = 0; i < custResults.rows.length; i++) custs.push(custResults.rows.item(i));
            setCustomers(custs);

        } catch (e) {
            console.error(e);
        }
    };

    // ── Category Handlers ────────────────────────────────────────────────────
    const handleSaveCategory = async () => {
        if (!categoryName.trim()) return Alert.alert('Validasi', 'Nama kategori wajib diisi.');
        try {
            const db = await getDBConnection();
            if (editingCategory) {
                await db.executeSql('UPDATE categories SET name = ?, isSynced = 0 WHERE id = ?', [categoryName, editingCategory.id]);
            } else {
                await db.executeSql('INSERT INTO categories (name) VALUES (?)', [categoryName]);
            }
            setCategoryModalVisible(false);
            resetForms();
            loadData();
        } catch (e) { Alert.alert('Error', 'Gagal menyimpan kategori.'); }
    };

    const handleDeleteCategory = (id: number) => {
        Alert.alert('Konfirmasi', 'Yakin ingin menghapus kategori ini?', [
            { text: 'Batal', style: 'cancel' },
            {
                text: 'Hapus', style: 'destructive', onPress: async () => {
                    const db = await getDBConnection();
                    await db.executeSql('DELETE FROM categories WHERE id = ?', [id]);
                    loadData();
                }
            }
        ]);
    };

    const openCategoryModal = (cat?: any) => {
        if (cat) { setEditingCategory(cat); setCategoryName(cat.name); }
        else resetForms();
        setCategoryModalVisible(true);
    };

    // ── Product Handlers ─────────────────────────────────────────────────────
    const handleSaveProduct = async () => {
        if (!productName.trim() || !productPrice || !productCategoryId)
            return Alert.alert('Validasi', 'Nama, Harga, dan Kategori wajib diisi.');
        const discountScheduleError = validateDiscountSchedule(productDiscount);
        if (discountScheduleError) return Alert.alert('Jadwal diskon belum lengkap', discountScheduleError);
        try {
            const db = await getDBConnection();
            const price = parseFloat(productPrice.replace(/[^0-9]/g, '') || '0');
            const costPrice = parseFloat(productCostPrice.replace(/[^0-9]/g, '') || '0');
            const stock = parseInt(productStock || '0', 10);
            const catId = parseInt(productCategoryId, 10);
            const img = productImageUrl.trim() ? productImageUrl.trim() : null;
            const isUnlimited = isUnlimitedStock ? 1 : 0;
            const enableCost = enableCostPrice ? 1 : 0;
            const barcode = productBarcode.trim() ? productBarcode.trim() : null;
            const minStock = parseInt(productMinStock || '0', 10);
            const discountSchedule = getDiscountScheduleForSave(productDiscount);
            const discountValues = [productDiscount.active ? 1 : 0, productDiscount.type, parseFloat(productDiscount.value || '0'), discountSchedule.startAt, discountSchedule.endAt, discountSchedule.startTime, discountSchedule.endTime, discountSchedule.days, productDiscount.label || null];

            if (editingProduct) {
                await db.executeSql(
                    'UPDATE products SET name = ?, price = ?, costPrice = ?, enableCostPrice = ?, stock = ?, categoryId = ?, imageUrl = ?, isUnlimitedStock = ?, barcode = ?, minStock = ?, discountActive = ?, discountType = ?, discountValue = ?, discountStartAt = ?, discountEndAt = ?, discountStartTime = ?, discountEndTime = ?, discountDays = ?, discountLabel = ?, isSynced = 0 WHERE id = ?',
                    [productName, price, costPrice, enableCost, stock, catId, img, isUnlimited, barcode, minStock, ...discountValues, editingProduct.id]
                );
            } else {
                const [insertResult] = await db.executeSql(
                    'INSERT INTO products (name, price, costPrice, enableCostPrice, stock, categoryId, imageUrl, isUnlimitedStock, barcode, minStock, discountActive, discountType, discountValue, discountStartAt, discountEndAt, discountStartTime, discountEndTime, discountDays, discountLabel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [productName, price, costPrice, enableCost, stock, catId, img, isUnlimited, barcode, minStock, ...discountValues]
                );
                await saveBufferedAddons(insertResult.insertId);
            }
            setProductModalVisible(false);
            resetForms();
            loadData();
        } catch (e) { Alert.alert('Error', 'Gagal menyimpan produk.'); }
    };

    const handleDeleteProduct = (id: number) => {
        Alert.alert('Konfirmasi', 'Yakin ingin menghapus produk ini?', [
            { text: 'Batal', style: 'cancel' },
            {
                text: 'Hapus', style: 'destructive', onPress: async () => {
                    const db = await getDBConnection();
                    await db.executeSql('DELETE FROM products WHERE id = ?', [id]);
                    loadData();
                }
            }
        ]);
    };

    const openProductModal = async (prod?: any) => {
        if (prod) {
            setEditingProduct(prod);
            setProductName(prod.name);
            setProductPrice(prod.price.toString());
            setProductCostPrice((prod.costPrice || 0).toString());
            setEnableCostPrice(prod.enableCostPrice === 1);
            setProductStock(prod.stock.toString());
            setProductCategoryId(prod.categoryId.toString());
            setProductImageUrl(prod.imageUrl || '');
            setIsUnlimitedStock(prod.isUnlimitedStock === 1);
            setProductBarcode(prod.barcode || '');
            setProductMinStock((prod.minStock || 0).toString());
            setProductDiscount(createDiscountValues(prod));
            // Load add-ons for this product
            try {
                const db = await getDBConnection();
                const [aRes] = await db.executeSql('SELECT * FROM product_addons WHERE productId = ? ORDER BY id', [prod.id]);
                const addons: any[] = [];
                for (let i = 0; i < aRes.rows.length; i++) addons.push(aRes.rows.item(i));
                setProductAddons(addons);
            } catch { setProductAddons([]); }
        } else {
            resetForms();
            setProductAddons([]);
        }
        setProductModalVisible(true);
    };

    const buildBarcodeRawBase64 = (barcodeData: string, productName: string, priceText: string): string => {
        // Build ESC/POS raw bytes for barcode label printing (offline, no internet needed)
        const bytes: number[] = [];

        // ESC @ — Initialize printer
        bytes.push(0x1B, 0x40);

        // ESC a 1 — Center alignment
        bytes.push(0x1B, 0x61, 0x01);

        // Print product name (normal size)
        const nameEncoder = new TextEncoder();
        const nameBytes = nameEncoder.encode(productName.toUpperCase() + '\n');
        bytes.push(...nameBytes);

        // GS w 2 — Set barcode width (module width = 2)
        bytes.push(0x1D, 0x77, 0x02);

        // GS h 60 — Set barcode height (60 dots)
        bytes.push(0x1D, 0x68, 0x3C);

        // GS H 2 — Set HRI (Human Readable Interpretation) position: below barcode
        bytes.push(0x1D, 0x48, 0x02);

        // GS f 0 — Set HRI font to Font A
        bytes.push(0x1D, 0x66, 0x00);

        // GS k 73 n data — Print CODE128 barcode
        // Format: GS k m n d1...dn
        // m = 73 (CODE128), n = length of data
        const barcodeBytes = nameEncoder.encode(barcodeData);
        bytes.push(0x1D, 0x6B, 0x49, barcodeBytes.length + 2);
        // CODE128: start with Code B ({B) for alphanumeric
        bytes.push(0x7B, 0x42); // {B = Code B
        bytes.push(...barcodeBytes);

        // Line feed after barcode
        bytes.push(0x0A, 0x0A);

        // Print price (centered, normal size)
        if (priceText) {
            const priceBytes = nameEncoder.encode(priceText + '\n');
            bytes.push(...priceBytes);
        }

        // Feed and partial cut
        bytes.push(0x0A, 0x0A, 0x0A, 0x0A);

        // Convert to base64
        const uint8 = new Uint8Array(bytes);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        return btoa(binary);
    };

    const handlePrintBarcode = async (product: any) => {
        if (!product.barcode) {
            Alert.alert('Info', 'Produk ini belum memiliki barcode.');
            return;
        }
        if (!settings?.printerAddress || !settings?.printerType) {
            Alert.alert('Info', 'Belum ada printer yang dikonfigurasi. Atur di menu Pengaturan.');
            return;
        }

        try {
            const printerClass = await connectConfiguredPrinter(settings);

            const priceText = product.price ? `Rp ${product.price.toLocaleString('id-ID')}` : '';
            const base64Data = buildBarcodeRawBase64(product.barcode, product.name, priceText);
            await printerClass.printRaw(base64Data);

            await closeConfiguredPrinter(settings, printerClass);
        } catch (error: any) {
            Alert.alert('Error', error?.message || 'Gagal mencetak barcode. Pastikan printer menyala dan terhubung.');
        }
    };

    // ── Customer Handlers ─────────────────────────────────────────────────────
    const handleSaveCustomer = async () => {
        if (!customerName.trim()) return Alert.alert('Validasi', 'Nama pelanggan wajib diisi.');
        let phone: string | null;
        try { phone = normalizeCustomerPhone(customerPhone); } catch (error: any) { return Alert.alert('Validasi', error.message); }
        try {
            const db = await getDBConnection();
            if (phone) {
                const aliases = customerPhoneAliases(phone);
                const [duplicate] = await db.executeSql(`SELECT id FROM customers WHERE phone IN (${aliases.map(() => '?').join(',')}) AND id != ? LIMIT 1`, [...aliases, editingCustomer?.id || -1]);
                if (duplicate.rows.length > 0) return Alert.alert('Nomor sudah terdaftar', 'Pilih atau edit pelanggan dengan nomor tersebut.');
            }
            const loyaltyDiscount = parseFloat(customerLoyaltyDiscount.replace(/[^0-9.]/g, '') || '0');
            const pointsValue = parseInt(customerPoints.replace(/[^0-9]/g, '') || '0', 10);
            if (editingCustomer) {
                await db.executeSql('UPDATE customers SET name = ?, phone = ?, notes = ?, loyaltyDiscount = ?, points = ?, isSynced = 0 WHERE id = ?', [customerName, phone, customerNotes, loyaltyDiscount, pointsValue, editingCustomer.id]);
            } else {
                await db.executeSql('INSERT INTO customers (name, phone, notes, loyaltyDiscount, points) VALUES (?, ?, ?, ?, ?)', [customerName, phone, customerNotes, loyaltyDiscount, pointsValue]);
            }
            setCustomerModalVisible(false);
            resetForms();
            loadData();
        } catch (e) { Alert.alert('Error', 'Gagal menyimpan pelanggan.'); }
    };

    const handleDeleteCustomer = (id: number) => {
        Alert.alert('Hapus', 'Yakin hapus data pelanggan ini?', [
            { text: 'Batal', style: 'cancel' },
            {
                text: 'Hapus', style: 'destructive', onPress: async () => {
                    const db = await getDBConnection();
                    await db.executeSql('DELETE FROM customers WHERE id = ?', [id]);
                    loadData();
                }
            }
        ]);
    };

    const openCustomerModal = (cust?: any) => {
        if (cust) {
            setEditingCustomer(cust);
            setCustomerName(cust.name);
            setCustomerPhone(cust.phone || '');
            setCustomerNotes(cust.notes || '');
            setCustomerPoints((cust.points || 0).toString());
            setCustomerLoyaltyDiscount((cust.loyaltyDiscount || 0).toString());
        } else resetForms();
        setCustomerModalVisible(true);
    };

    const resetForms = () => {
        setEditingCategory(null); setCategoryName('');
        setEditingProduct(null); setProductName(''); setProductPrice('');
        setProductCostPrice(''); setEnableCostPrice(false);
        setProductStock(''); setProductCategoryId(''); setProductImageUrl('');
        setIsUnlimitedStock(false); setProductBarcode('');
        setProductMinStock('');
        setProductDiscount(createDiscountValues());
        setProductAddons([]); setNewAddonName(''); setNewAddonPrice('');
        setEditingCustomer(null); setCustomerName(''); setCustomerPhone(''); setCustomerNotes('');
        setCustomerPoints('0');
        setCustomerLoyaltyDiscount('0');
    };

    const handleSaveAddon = async () => {
        if (!newAddonName.trim()) return;
        if (!editingProduct) {
            // Product not saved yet — buffer locally
            const local = { id: Date.now(), productId: null, name: newAddonName.trim(), price: parseFloat(newAddonPrice.replace(/[^0-9]/g, '') || '0'), local: true };
            setProductAddons(prev => [...prev, local]);
            setNewAddonName(''); setNewAddonPrice('');
            return;
        }
        try {
            const db = await getDBConnection();
            const price = parseFloat(newAddonPrice.replace(/[^0-9]/g, '') || '0');
            await db.executeSql('INSERT INTO product_addons (productId, name, price) VALUES (?, ?, ?)', [editingProduct.id, newAddonName.trim(), price]);
            const [aRes] = await db.executeSql('SELECT * FROM product_addons WHERE productId = ? ORDER BY id', [editingProduct.id]);
            const addons: any[] = [];
            for (let i = 0; i < aRes.rows.length; i++) addons.push(aRes.rows.item(i));
            setProductAddons(addons);
            setNewAddonName(''); setNewAddonPrice('');
        } catch { Alert.alert('Error', 'Gagal menyimpan add-on.'); }
    };

    const handleDeleteAddon = async (addonId: number) => {
        if (!editingProduct) {
            setProductAddons(prev => prev.filter(a => a.id !== addonId));
            return;
        }
        try {
            const db = await getDBConnection();
            await db.executeSql('DELETE FROM product_addons WHERE id = ?', [addonId]);
            setProductAddons(prev => prev.filter(a => a.id !== addonId));
        } catch { Alert.alert('Error', 'Gagal menghapus add-on.'); }
    };

    // Save local buffered add-ons after product is first created
    const saveBufferedAddons = async (productId: number) => {
        const db = await getDBConnection();
        for (const a of productAddons.filter(x => x.local)) {
            await db.executeSql('INSERT INTO product_addons (productId, name, price) VALUES (?, ?, ?)', [productId, a.name, a.price]);
        }
    };


    const TABS: { key: TabType; label: string; icon: string }[] = [
        { key: 'products', label: 'Produk', icon: 'package-variant' },
        { key: 'categories', label: 'Kategori', icon: 'tag-outline' },
        { key: 'customers', label: 'Pelanggan', icon: 'account-group' },
        { key: 'penerimaan', label: 'Penerimaan', icon: 'package-down' },
        { key: 'stokDarurat', label: 'Stok Darurat', icon: 'alert-outline' },
        { key: 'opname', label: 'Opname', icon: 'clipboard-list-outline' },
    ];

    const filteredProducts = searchQuery.trim()
        ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : products;
    const filteredCategories = searchQuery.trim()
        ? categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : categories;
    const filteredCustomers = searchQuery.trim()
        ? customers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : customers;

    // ── Stok Darurat: Low Stock Products ────────────────────────────────────
    const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);

    const loadLowStock = async () => {
        try {
            const db = await getDBConnection();
            const [res] = await db.executeSql(
                `SELECT p.*, c.name as categoryName
                 FROM products p LEFT JOIN categories c ON p.categoryId = c.id
                 WHERE p.isUnlimitedStock = 0 AND p.minStock > 0 AND p.stock <= p.minStock
                 ORDER BY (p.stock - p.minStock) ASC`
            );
            const arr: any[] = [];
            for (let i = 0; i < res.rows.length; i++) arr.push(res.rows.item(i));
            setLowStockProducts(arr);
        } catch { setLowStockProducts([]); }
    };

    useEffect(() => { if (activeTab === 'stokDarurat') loadLowStock(); }, [activeTab]);

    const LowStockContent = () => (
        <View style={tw`flex-1 -mx-4 -mt-4`}>
            {/* Header */}
            <View style={tw`bg-white dark:bg-gray-800 px-4 py-3 flex-row items-center justify-between border-b border-gray-200 dark:border-gray-700`}>
                <View style={tw`flex-1`}>
                    <Text style={tw`text-base font-black text-gray-800 dark:text-gray-100`}>Stok Darurat</Text>
                    <Text style={tw`text-[10px] text-gray-500`}>Produk dengan stok di bawah batas minimum</Text>
                </View>
                <TouchableOpacity onPress={loadLowStock} style={tw`px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl`}>
                    <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300`}>Refresh</Text>
                </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={tw`mx-4 mt-4 mb-3 ${lowStockProducts.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200' : 'bg-green-50 dark:bg-green-900/20 border-green-200'} border rounded-2xl p-4 flex-row items-center`}>
                <Icon name="alert" size={24} color={lowStockProducts.length > 0 ? tw.color('amber-500') : tw.color('green-500')} style={tw`mr-3`} />
                <View style={tw`flex-1`}>
                    <Text style={tw`font-black text-lg ${lowStockProducts.length > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                        {lowStockProducts.length} Produk
                    </Text>
                    <Text style={tw`text-xs ${lowStockProducts.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {lowStockProducts.length > 0 ? 'membutuhkan restock segera' : 'Semua stok aman!'}
                    </Text>
                </View>
            </View>

            {lowStockProducts.length === 0 ? (
                <View style={tw`items-center py-12`}>
                    <Icon name="check" size={48} color={tw.color('green-300')} />
                    <Text style={tw`text-gray-400 font-bold mt-4`}>Tidak ada produk kritis</Text>
                    <Text style={tw`text-gray-400 text-xs mt-1 text-center px-8`}>
                        Atur batas stok minimal di form Edit Produk → bagian Stok
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={lowStockProducts}
                    keyExtractor={item => String(item.id)}
                    contentContainerStyle={tw`px-4 pb-8`}
                    renderItem={({ item }) => {
                        const isZero = item.stock <= 0;
                        return (
                            <TouchableOpacity
                                style={tw`${isZero ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200'} border rounded-2xl p-4 mb-3 flex-row items-center`}
                                onPress={() => openProductModal(item)}
                                activeOpacity={0.7}
                            >
                                <View style={tw`w-10 h-10 ${isZero ? 'bg-red-100' : 'bg-amber-100'} rounded-xl items-center justify-center mr-3`}>
                                    <Icon name="alert" size={20} color={isZero ? tw.color('red-500') : tw.color('amber-500')} />
                                </View>
                                <View style={tw`flex-1`}>
                                    <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{item.name}</Text>
                                    <Text style={tw`text-xs text-gray-500 mt-0.5`}>{item.categoryName || 'Tanpa Kategori'}</Text>
                                </View>
                                <View style={tw`items-end`}>
                                    <Text style={tw`font-black text-lg ${isZero ? 'text-red-600' : 'text-amber-600'}`}>{item.stock}</Text>
                                    <Text style={tw`text-[10px] text-gray-400`}>min: {item.minStock}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </View>
    );

    return (
        <View style={tw`flex-1 bg-gray-50 dark:bg-gray-900`}>
            {/* Header */}
            <View style={tw`bg-white dark:bg-gray-800 px-4 py-3 pb-0 border-b border-gray-200 dark:border-gray-700`}>
                <View style={tw`flex-row items-center mb-3`}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={tw`p-2 mr-2`}>
                        <Icon name="arrow-left" size={24} color={tw.color('gray-800')} />
                    </TouchableOpacity>
                    <Text style={tw`text-xl font-black text-gray-800 dark:text-gray-100 flex-1`}>Manajemen Data</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`flex-row`} contentContainerStyle={tw`flex-grow`}>
                    {TABS.map(tab => (
                        <TouchableOpacity
                            key={tab.key}
                            style={tw`flex-1 pb-3 px-3 items-center border-b-2 ${activeTab === tab.key ? 'border-blue-600' : 'border-transparent'}`}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <View style={tw`flex-row items-center`}>
                                <Icon name={tab.icon} size={15} color={activeTab === tab.key ? tw.color('blue-600') : tw.color('gray-400')} style={tw`mr-1`} />
                                <Text style={tw`font-bold text-xs ${activeTab === tab.key ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400'}`}>{tab.label}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <View style={tw`flex-1 p-4`}>
                {activeTab === 'penerimaan' ? (
                    <View style={tw`flex-1 -mx-4 -mt-4`}>
                        <StockReceivingScreen navigation={navigation} isEmbedded={true} />
                    </View>
                ) : activeTab === 'stokDarurat' ? (
                    <LowStockContent />
                ) : activeTab === 'opname' ? (
                    <View style={tw`flex-1 -mx-4 -mt-4`}>
                        <StockOpnameScreen navigation={navigation} isEmbedded={true} />
                    </View>
                ) : (
                    <>
                        <View style={tw`flex-row justify-between items-center mb-3`}>
                            <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>
                                {activeTab === 'products' ? `Produk (${filteredProducts.length})`
                                    : activeTab === 'categories' ? `Kategori (${filteredCategories.length})`
                                        : `Pelanggan (${filteredCustomers.length})`}
                            </Text>
                            <TouchableOpacity
                                style={tw`bg-blue-600 flex-row items-center px-3 py-2 rounded-lg`}
                                onPress={() => {
                                    if (activeTab === 'products') openProductModal();
                                    else if (activeTab === 'categories') openCategoryModal();
                                    else openCustomerModal();
                                }}
                            >
                                <Icon name="plus" size={16} color="white" style={tw`mr-1`} />
                                <Text style={tw`text-white font-bold text-xs`}>Tambah</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Search */}
                        <View style={tw`flex-row items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 mb-4`}>
                            <Icon name="magnify" size={14} color={tw.color('gray-400')} style={tw`mr-2`} />
                            <TextInput
                                style={tw`flex-1 py-2.5 text-gray-800 dark:text-gray-100 text-sm`}
                                placeholder={
                                    activeTab === 'products' ? 'Cari produk...'
                                        : activeTab === 'categories' ? 'Cari kategori...'
                                            : 'Cari pelanggan...'
                                }
                                placeholderTextColor={tw.color('gray-400')}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Icon name="close" size={14} color={tw.color('gray-400')} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Products List */}
                        {activeTab === 'products' && (
                            <FlatList
                                data={filteredProducts}
                                keyExtractor={(item) => String(item.id)}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={tw`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm mb-3 border border-gray-100 dark:border-gray-800 flex-row justify-between items-center`}
                                        onPress={() => openProductModal(item)}
                                        activeOpacity={0.7}
                                    >
                                        <View style={tw`flex-1 mr-3`}>
                                            <Text style={tw`font-bold text-gray-800 dark:text-gray-100 text-base`}>{item.name}</Text>
                                            <View style={tw`flex-row items-center mt-1 flex-wrap`}>
                                                <Text style={tw`text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-md mr-2`}>{item.categoryName || 'Tanpa Kategori'}</Text>
                                                <Text style={tw`text-xs text-gray-500 dark:text-gray-400`}>Stok: <Text style={tw`font-bold`}>{item.isUnlimitedStock === 1 ? '∞' : item.stock}</Text></Text>
                                            </View>
                                            <Text style={tw`font-black text-blue-600 mt-1`}>{formatRp(item.price)}</Text>
                                            {item.enableCostPrice === 1 && item.costPrice > 0 && (
                                                <Text style={tw`text-xs text-gray-400 dark:text-gray-500`}>Modal: {formatRp(item.costPrice)}</Text>
                                            )}
                                            {item.barcode ? (
                                                <Text style={tw`text-xs text-blue-500 mt-1`}>Barcode: {item.barcode}</Text>
                                            ) : null}
                                        </View>
                                        <View style={tw`flex-row items-center gap-2`}>
                                            <TouchableOpacity style={tw`p-2 bg-blue-50 rounded-lg`} onPress={() => handlePrintBarcode(item)}>
                                                <Icon name="printer" size={16} color={tw.color('blue-600')} />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={tw`p-2 bg-red-50 rounded-lg`} onPress={() => handleDeleteProduct(item.id)}>
                                                <Icon name="delete-outline" size={16} color={tw.color('red-600')} />
                                            </TouchableOpacity>
                                        </View>
                                    </TouchableOpacity>
                                )}
                            />
                        )}

                        {/* Categories List */}
                        {activeTab === 'categories' && (
                            <FlatList
                                data={filteredCategories}
                                keyExtractor={(item) => String(item.id)}
                                renderItem={({ item }) => (
                                    <View style={tw`bg-white dark:bg-gray-800 px-4 py-3 rounded-xl shadow-sm mb-3 border border-gray-100 dark:border-gray-800 flex-row justify-between items-center`}>
                                        <TouchableOpacity style={tw`flex-1 mr-3`} onPress={() => openCategoryModal(item)} activeOpacity={0.7}>
                                            <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{item.name}</Text>
                                            <Text style={tw`text-[10px] text-gray-400 mt-0.5`}>Tap untuk edit</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={tw`p-2 bg-red-50 rounded-lg`} onPress={() => handleDeleteCategory(item.id)}>
                                            <Icon name="delete-outline" size={16} color={tw.color('red-600')} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            />
                        )}

                        {/* Customers List */}
                        {activeTab === 'customers' && (
                            <FlatList
                                data={filteredCustomers}
                                keyExtractor={(item) => String(item.id)}
                                ListEmptyComponent={() => (
                                    <View style={tw`items-center py-16`}>
                                        <Icon name="account-multiple" size={48} color={tw.color('gray-300')} />
                                        <Text style={tw`text-gray-400 font-bold mt-4`}>Belum ada data pelanggan</Text>
                                    </View>
                                )}
                                renderItem={({ item }) => (
                                    <View style={tw`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm mb-3 border border-gray-100 dark:border-gray-800 flex-row items-center`}>
                                        <TouchableOpacity style={tw`flex-row items-center flex-1 mr-2`} onPress={() => openCustomerModal(item)} activeOpacity={0.7}>
                                            <View style={tw`w-10 h-10 bg-blue-50 rounded-full items-center justify-center mr-3`}>
                                                <Icon name="account-multiple" size={18} color={tw.color('blue-600')} />
                                            </View>
                                            <View style={tw`flex-1`}>
                                                <Text style={tw`font-bold text-gray-800 dark:text-gray-100`}>{item.name}</Text>
                                                {item.phone ? (
                                                    <View style={tw`flex-row items-center mt-0.5`}>
                                                        <Icon name="phone" size={11} color={tw.color('gray-400')} />
                                                        <Text style={tw`text-xs text-gray-500 dark:text-gray-400 ml-1`}>{item.phone}</Text>
                                                    </View>
                                                ) : null}
                                                {item.notes ? <Text style={tw`text-xs text-gray-400 italic mt-0.5`}>{item.notes}</Text> : null}
                                                {item.loyaltyDiscount > 0 && (
                                                    <View style={tw`mt-1 self-start bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex-row items-center mr-2`}>
                                                        <Text style={tw`text-[10px] font-black text-green-600`}>Diskon {item.loyaltyDiscount}%</Text>
                                                    </View>
                                                )}
                                                <View style={tw`mt-1 self-start bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full flex-row items-center`}>
                                                    <Icon name="tag-outline" size={10} color={tw.color('blue-600')} style={tw`mr-1`} />
                                                    <Text style={tw`text-[10px] font-black text-blue-600`}>{item.points || 0} Poin</Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={tw`p-2 bg-red-50 rounded-lg`} onPress={() => handleDeleteCustomer(item.id)}>
                                            <Icon name="delete-outline" size={16} color={tw.color('red-600')} />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            />
                        )}
                    </>
                )}
            </View>

            {/* CATEGORY MODAL */}
            <Modal visible={isCategoryModalVisible} transparent animationType="fade">
                <View style={tw`flex-1 bg-black/50 justify-center px-4`}>
                    <View style={tw`bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl`}>
                        <View style={tw`flex-row justify-between items-center mb-5`}>
                            <Text style={tw`font-black text-xl text-gray-800 dark:text-gray-100`}>{editingCategory ? 'Edit Kategori' : 'Kategori Baru'}</Text>
                            <TouchableOpacity onPress={() => setCategoryModalVisible(false)}><Icon name="close" size={24} color={tw.color('gray-400')} /></TouchableOpacity>
                        </View>
                        <TextInput
                            style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-5 text-gray-800 dark:text-gray-100`}
                            placeholder="Contoh: Makanan Berat"
                            value={categoryName}
                            onChangeText={setCategoryName}
                        />
                        <TouchableOpacity style={tw`bg-blue-600 py-3 rounded-xl items-center flex-row justify-center`} onPress={handleSaveCategory}>
                            <Icon name="content-save" size={18} color="white" style={tw`mr-2`} />
                            <Text style={tw`font-bold text-white`}>Simpan Kategori</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* PRODUCT MODAL */}
            <Modal visible={isProductModalVisible} transparent animationType="slide">
                <View style={tw`flex-1 bg-black/50 justify-end`}>
                    {/* Fixed container with max height — header always visible */}
                    <View style={[tw`bg-white dark:bg-gray-800 rounded-t-3xl shadow-xl flex-col`, { maxHeight: screenH * 0.88 }]}>
                        {/* Sticky header — always at top, never scrolls away */}
                        <View style={tw`flex-row justify-between items-center px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800`}>
                            <Text style={tw`font-black text-xl text-gray-800 dark:text-gray-100`}>{editingProduct ? 'Edit Produk' : 'Produk Baru'}</Text>
                            <TouchableOpacity
                                onPress={() => setProductModalVisible(false)}
                                style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}
                            >
                                <Icon name="close" size={22} color={tw.color('gray-600')} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={tw`px-6 py-4 pb-8`}>

                            {/* ── Section: Informasi Dasar */}
                            <View style={tw`bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-4`}>
                                <Text style={tw`text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3`}>Informasi Dasar</Text>

                                <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300 mb-1`}>Nama Produk <Text style={tw`text-red-400`}>*</Text></Text>
                                <TextInput
                                    style={tw`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 mb-3`}
                                    placeholder="Contoh: Nasi Goreng"
                                    value={productName}
                                    onChangeText={setProductName}
                                />

                                <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300 mb-1`}>Barcode <Text style={tw`text-gray-400 font-normal`}>(opsional)</Text></Text>
                                <TextInput
                                    style={tw`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 mb-3`}
                                    placeholder="Scan atau ketik barcode..."
                                    value={productBarcode}
                                    onChangeText={setProductBarcode}
                                    autoCapitalize="none"
                                />

                                <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300 mb-1`}>Foto Produk <Text style={tw`text-gray-400 font-normal`}>(opsional)</Text></Text>
                                <TouchableOpacity
                                    style={tw`bg-white dark:bg-gray-800 border border-dashed border-blue-300 rounded-xl py-3 items-center flex-row justify-center`}
                                    onPress={async () => {
                                        const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 });
                                        if (result.didCancel) return;
                                        const asset = result.assets?.[0];
                                        if (asset) {
                                            if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
                                                Alert.alert('Gagal', 'Ukuran gambar maksimal 2MB.'); return;
                                            }
                                            setProductImageUrl(asset.uri || '');
                                        }
                                    }}
                                >
                                    {productImageUrl ? (
                                        <Image
                                            source={{ uri: resolveApiAssetUrl(productImageUrl, settings.apiBaseUrl) || undefined }}
                                            style={tw`w-12 h-12 rounded-lg mr-3`}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <Icon name="camera" size={22} color={tw.color('blue-400')} style={tw`mr-2`} />
                                    )}
                                    <Text style={tw`text-blue-600 font-bold text-sm`}>{productImageUrl ? 'Ganti Gambar' : 'Pilih dari Galeri'}</Text>
                                    {productImageUrl ? (
                                        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setProductImageUrl(''); }} style={tw`ml-3 p-1`}>
                                            <Icon name="close" size={14} color={tw.color('red-400')} />
                                        </TouchableOpacity>
                                    ) : null}
                                </TouchableOpacity>
                            </View>

                            {/* ── Section: Harga */}
                            <View style={tw`bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-4`}>
                                <Text style={tw`text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3`}>Harga &amp; HPP</Text>

                                <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300 mb-1`}>Harga Jual <Text style={tw`text-red-400`}>*</Text></Text>
                                <View style={tw`flex-row items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl mb-3 overflow-hidden`}>
                                    <View style={tw`bg-blue-50 px-3 py-3 border-r border-gray-200 dark:border-gray-700`}>
                                        <Text style={tw`font-black text-blue-600 text-sm`}>Rp</Text>
                                    </View>
                                    <TextInput
                                        style={tw`flex-1 px-4 py-3 text-gray-800 dark:text-gray-100 font-bold`}
                                        keyboardType="numeric"
                                        placeholder="15.000"
                                        value={productPrice ? parseInt(productPrice).toLocaleString('id-ID') : ''}
                                        onChangeText={(t) => setProductPrice(t.replace(/[^0-9]/g, ''))}
                                    />
                                </View>

                                <View style={tw`flex-row items-center justify-between mb-1`}>
                                    <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300`}>Harga Beli / HPP</Text>
                                    <View style={tw`flex-row items-center`}>
                                        <Text style={tw`text-xs text-gray-400 mr-2`}>{enableCostPrice ? 'Aktif' : 'Nonaktif'}</Text>
                                        <Switch
                                            value={enableCostPrice}
                                            onValueChange={setEnableCostPrice}
                                            trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                                            thumbColor={enableCostPrice ? '#2563eb' : '#f3f4f6'}
                                        />
                                    </View>
                                </View>
                                <View style={tw`flex-row items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden ${!enableCostPrice ? 'opacity-40' : ''}`}>
                                    <View style={tw`bg-gray-50 dark:bg-gray-900 px-3 py-3 border-r border-gray-200 dark:border-gray-700`}>
                                        <Text style={tw`font-black text-gray-500 text-sm`}>Rp</Text>
                                    </View>
                                    <TextInput
                                        style={tw`flex-1 px-4 py-3 text-gray-800 dark:text-gray-100 font-bold`}
                                        keyboardType="numeric"
                                        placeholder={enableCostPrice ? '10.000' : 'Nonaktif'}
                                        value={enableCostPrice ? (productCostPrice ? parseInt(productCostPrice).toLocaleString('id-ID') : '') : ''}
                                        onChangeText={(t) => setProductCostPrice(t.replace(/[^0-9]/g, ''))}
                                        editable={enableCostPrice}
                                    />
                                </View>
                                {enableCostPrice && productPrice && productCostPrice && (
                                    <View style={tw`flex-row items-center justify-between mt-2 bg-green-50 rounded-lg px-3 py-2`}>
                                        <Text style={tw`text-xs text-green-700`}>Margin / Keuntungan:</Text>
                                        <Text style={tw`text-sm font-black text-green-700`}>
                                            {formatRp(parseFloat(productPrice) - parseFloat(productCostPrice))}
                                            {' '}({Math.round((parseFloat(productPrice) - parseFloat(productCostPrice)) / parseFloat(productPrice) * 100)}%)
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <ProductDiscountFields values={productDiscount} onChange={setProductDiscount} />

                            {/* ── Section: Stok */}
                            <View style={tw`bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-4`}>
                                <Text style={tw`text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3`}>Stok</Text>
                                <View style={tw`flex-row items-center gap-2`}>
                                    <View style={tw`flex-1`}>
                                        <TextInput
                                            style={tw`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 ${isUnlimitedStock ? 'opacity-40' : ''}`}
                                            keyboardType="numeric"
                                            placeholder={isUnlimitedStock ? '∞ Tak terbatas' : '50'}
                                            value={productStock}
                                            onChangeText={(t) => setProductStock(t.replace(/[^0-9-]/g, ''))}
                                            editable={!isUnlimitedStock}
                                        />
                                    </View>
                                    <TouchableOpacity
                                        style={tw`flex-row items-center p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800`}
                                        onPress={() => { if (!isUnlimitedStock) setProductStock(''); setIsUnlimitedStock(!isUnlimitedStock); }}
                                    >
                                        <View style={tw`w-5 h-5 rounded border ${isUnlimitedStock ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'} items-center justify-center mr-2`}>
                                            {isUnlimitedStock && <Icon name="check" size={14} color="white" />}
                                        </View>
                                        <Text style={tw`text-xs text-gray-600 dark:text-gray-300 font-bold`}>Tak Terbatas</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Min Stock input - only when stock is finite */}
                                {!isUnlimitedStock && (
                                    <View style={tw`mt-3`}>
                                        <Text style={tw`text-[10px] font-bold text-gray-400 mb-1`}>Stok Minimal (Batas Darurat)</Text>
                                        <TextInput
                                            style={tw`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100`}
                                            keyboardType="numeric"
                                            placeholder="0 (tanpa batas darurat)"
                                            placeholderTextColor={tw.color('gray-400')}
                                            value={productMinStock}
                                            onChangeText={(t) => setProductMinStock(t.replace(/[^0-9]/g, ''))}
                                        />
                                        <Text style={tw`text-[10px] text-gray-400 mt-1`}>Produk tampil di Stok Darurat jika stok ≤ angka ini</Text>
                                    </View>
                                )}
                            </View>

                            {/* ── Section: Kategori */}
                            <View style={tw`bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-5`}>
                                <Text style={tw`text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3`}>Kategori <Text style={tw`text-red-400`}>*</Text></Text>
                                <View style={tw`flex-row flex-wrap`}>
                                    {categories.map((cat) => (
                                        <TouchableOpacity
                                            key={cat.id}
                                            style={tw`px-4 py-2 border rounded-full mr-2 mb-2 ${productCategoryId === cat.id.toString() ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
                                            onPress={() => setProductCategoryId(cat.id.toString())}
                                        >
                                            <Text style={tw`text-sm ${productCategoryId === cat.id.toString() ? 'text-white font-bold' : 'text-gray-600 dark:text-gray-300'}`}>{cat.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {/* ── Section: Add-ons */}
                            <View style={tw`bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-5`}>
                                <Text style={tw`text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1`}>Add-on / Pilihan Tambahan</Text>
                                <Text style={tw`text-xs text-gray-400 mb-3`}>Muncul sebagai pilihan saat item ini dipilih di kasir.</Text>

                                {productAddons.map(addon => (
                                    <View key={addon.id} style={tw`flex-row items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 mb-2`}>
                                        <View style={tw`flex-1`}>
                                            <Text style={tw`font-bold text-gray-800 dark:text-gray-100 text-sm`}>{addon.name}</Text>
                                            {addon.price > 0 && <Text style={tw`text-xs text-blue-600`}>+{formatRp(addon.price)}</Text>}
                                        </View>
                                        <TouchableOpacity onPress={() => handleDeleteAddon(addon.id)} style={tw`p-1.5 bg-red-50 rounded-lg`}>
                                            <Icon name="delete-outline" size={14} color={tw.color('red-500')} />
                                        </TouchableOpacity>
                                    </View>
                                ))}

                                <View style={tw`flex-row items-center gap-2 mt-1`}>
                                    <TextInput
                                        style={tw`flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-gray-800 dark:text-gray-100 text-sm`}
                                        placeholder="Nama (mis: Extra Keju)"
                                        value={newAddonName}
                                        onChangeText={setNewAddonName}
                                    />
                                    <TextInput
                                        style={tw`w-24 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-gray-800 dark:text-gray-100 text-sm`}
                                        placeholder="+Harga"
                                        keyboardType="numeric"
                                        value={newAddonPrice}
                                        onChangeText={t => setNewAddonPrice(t.replace(/[^0-9]/g, ''))}
                                    />
                                    <TouchableOpacity onPress={handleSaveAddon} style={tw`bg-blue-600 p-2.5 rounded-xl`}>
                                        <Icon name="plus" size={18} color="white" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity style={tw`bg-blue-600 py-4 rounded-xl items-center flex-row justify-center mb-4`} onPress={handleSaveProduct}>
                                <Icon name="content-save" size={18} color="white" style={tw`mr-2`} />
                                <Text style={tw`font-bold text-white text-lg`}>Simpan Produk</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* CUSTOMER MODAL */}
            <Modal visible={isCustomerModalVisible} transparent animationType="slide">
                <View style={tw`flex-1 bg-black/50 justify-end`}>
                    <View style={[tw`bg-white dark:bg-gray-800 rounded-t-3xl shadow-xl flex-col`, { maxHeight: screenH * 0.88 }]}>
                        {/* Sticky header */}
                        <View style={tw`flex-row justify-between items-center px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800`}>
                            <Text style={tw`font-black text-xl text-gray-800 dark:text-gray-100`}>{editingCustomer ? 'Edit Pelanggan' : 'Pelanggan Baru'}</Text>
                            <TouchableOpacity
                                onPress={() => setCustomerModalVisible(false)}
                                style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}
                            >
                                <Icon name="close" size={22} color={tw.color('gray-600')} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={tw`px-6 py-4`}>
                            <Text style={tw`font-bold text-gray-700 dark:text-gray-200 mb-2`}>Nama *</Text>
                            <TextInput
                                style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-4 text-gray-800 dark:text-gray-100`}
                                placeholder="Nama pelanggan"
                                value={customerName}
                                onChangeText={setCustomerName}
                            />
                            <Text style={tw`font-bold text-gray-700 dark:text-gray-200 mb-2`}>No. Telepon</Text>
                            <TextInput
                                style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-4 text-gray-800 dark:text-gray-100`}
                                placeholder="08xx-xxxx-xxxx"
                                keyboardType="phone-pad"
                                value={customerPhone}
                                onChangeText={value => setCustomerPhone(restrictPhoneInput(value))}
                                maxLength={16}
                            />
                            <Text style={tw`font-bold text-gray-700 dark:text-gray-200 mb-2`}>Catatan</Text>
                            <TextInput
                                style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-4 text-gray-800 dark:text-gray-100`}
                                placeholder="Contoh: Pelanggan VIP, alergi..."
                                value={customerNotes}
                                onChangeText={setCustomerNotes}
                            />
                            <View style={tw`flex-row gap-4 mb-2`}>
                                <View style={tw`flex-1`}>
                                    <Text style={tw`font-bold text-gray-700 dark:text-gray-200 mb-1`}>Poin Terkumpul</Text>
                                    <View style={tw`flex-row items-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden`}>
                                        <View style={tw`bg-blue-50 px-3 items-center justify-center`}>
                                            <Icon name="tag-outline" size={16} color={tw.color('blue-600')} />
                                        </View>
                                        <TextInput
                                            style={tw`flex-1 px-4 py-3 text-gray-800 dark:text-gray-100 font-bold text-lg`}
                                            placeholder="0"
                                            keyboardType="numeric"
                                            value={customerPoints}
                                            onChangeText={(t) => setCustomerPoints(t.replace(/[^0-9]/g, ''))}
                                        />
                                    </View>
                                </View>
                                <View style={tw`flex-1`}>
                                    <Text style={tw`font-bold text-gray-700 dark:text-gray-200 mb-1`}>Diskon Loyalitas (%)</Text>
                                    <View style={tw`flex-row items-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden`}>
                                        <TextInput
                                            style={tw`flex-1 px-4 py-3 text-gray-800 dark:text-gray-100 font-bold text-lg`}
                                            placeholder="0"
                                            keyboardType="numeric"
                                            value={customerLoyaltyDiscount}
                                            onChangeText={(t) => setCustomerLoyaltyDiscount(t.replace(/[^0-9.]/g, ''))}
                                        />
                                        <View style={tw`bg-green-50 dark:bg-green-900/30 px-3 items-center justify-center`}>
                                            <Text style={tw`font-black text-green-600 text-lg`}>%</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                            <TouchableOpacity style={tw`bg-blue-600 py-4 rounded-xl items-center flex-row justify-center mb-8`} onPress={handleSaveCustomer}>
                                <Icon name="content-save" size={18} color="white" style={tw`mr-2`} />
                                <Text style={tw`font-bold text-white text-base`}>Simpan Pelanggan</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
