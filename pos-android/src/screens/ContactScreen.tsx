import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, FlatList, TextInput, Alert, Modal, ScrollView, Image
} from 'react-native';
import tw, { useAppColorScheme } from 'twrnc';
import { getDBConnection } from '../database/db';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import { resolveApiAssetUrl } from '../services/api';
import api from '../services/api';
import { useStore } from '../store/useStore';
import { restrictPhoneInput, normalizeCustomerPhone, customerPhoneAliases } from '../utils/customerPhone';

type ContactTab = 'supplier' | 'customer';

export default function ContactScreen({ navigation }: any) {
    useAppColorScheme(tw);
    const user = useStore(state => state.user);
    const canEditPoints = ['ADMIN', 'OWNER'].includes(String(user?.role || '').toUpperCase());
    const [activeTab, setActiveTab] = useState<ContactTab>('customer');
    const [searchQuery, setSearchQuery] = useState('');

    // Data
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [formName, setFormName] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formAddress, setFormAddress] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [formImageUrl, setFormImageUrl] = useState('');
    const [formDisplayType, setFormDisplayType] = useState('normal');
    const [formLoyalty, setFormLoyalty] = useState('0');
    const [formPoints, setFormPoints] = useState('0');

    // Menu popup
    const [menuItemId, setMenuItemId] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        try {
            const db = await getDBConnection();
            const [sRes] = await db.executeSql('SELECT * FROM suppliers ORDER BY name');
            const sArr: any[] = [];
            for (let i = 0; i < sRes.rows.length; i++) sArr.push(sRes.rows.item(i));
            setSuppliers(sArr);

            const [cRes] = await db.executeSql(`
                SELECT c.*,
                    COUNT(t.id) as totalVisits,
                    COALESCE(SUM(CASE
                        WHEN COALESCE(t.paidAmount, 0) > 0 THEN t.paidAmount
                        ELSE t.grandTotal
                    END), 0) as totalSpent
                FROM customers c
                LEFT JOIN transactions t ON t.customerId = c.id
                    AND UPPER(COALESCE(t.status, 'COMPLETED')) IN ('PAID', 'COMPLETED')
                    AND UPPER(COALESCE(t.paymentStatus, 'PAID')) = 'PAID'
                GROUP BY c.id
                ORDER BY c.name
            `);
            const cArr: any[] = [];
            for (let i = 0; i < cRes.rows.length; i++) cArr.push(cRes.rows.item(i));
            try {
                const response = await api.get('/customers');
                const serverCustomers = Array.isArray(response.data?.data) ? response.data.data : [];
                const serverById = new Map(serverCustomers.map((item: any) => [Number(item.id), item]));
                setCustomers(cArr.map(item => {
                    const remote: any = serverById.get(Number(item.serverId || item.id));
                    return remote ? {
                        ...item,
                        memberId: remote.memberId || item.memberId,
                        points: Number(remote.points || 0),
                        totalVisits: Number(remote.totalVisits || 0),
                        totalSpent: Number(remote.totalSpent || 0),
                    } : item;
                }));
            } catch {
                setCustomers(cArr);
            }
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        loadData();
        const unsub = navigation.addListener('focus', loadData);
        return unsub;
    }, [navigation, loadData]);

    const resetForm = () => {
        setEditing(null);
        setFormName('');
        setFormPhone('');
        setFormEmail('');
        setFormAddress('');
        setFormNotes('');
        setFormImageUrl('');
        setFormDisplayType('normal');
        setFormLoyalty('0');
        setFormPoints('0');
    };

    const openAdd = () => {
        resetForm();
        setShowModal(true);
    };

    const openEdit = (item: any) => {
        setEditing(item);
        setFormName(item.name || '');
        setFormPhone(item.phone || '');
        setFormEmail(item.email || '');
        setFormAddress(item.address || '');
        setFormNotes(item.notes || '');
        setFormImageUrl(item.imageUrl || '');
        setFormDisplayType(item.displayType || 'normal');
        setFormLoyalty((item.loyaltyDiscount || 0).toString());
        setFormPoints((item.points || 0).toString());
        setMenuItemId(null);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formName.trim()) return Alert.alert('Validasi', 'Nama wajib diisi.');
        if (activeTab === 'customer') {
            try { normalizeCustomerPhone(formPhone); } catch (error: any) { return Alert.alert('Validasi', error.message); }
        }
        if (formPhone.trim().length > 20) return Alert.alert('Validasi', 'Nomor telepon maksimal 20 karakter.');
        try {
            const db = await getDBConnection();
            if (activeTab === 'supplier') {
                if (editing) {
                    await db.executeSql(
                        'UPDATE suppliers SET name = ?, phone = ?, address = ?, notes = ?, isSynced = 0 WHERE id = ?',
                        [formName.trim(), formPhone, formAddress, formNotes, editing.id]
                    );
                } else {
                    await db.executeSql(
                        'INSERT INTO suppliers (name, phone, address, notes) VALUES (?, ?, ?, ?)',
                        [formName.trim(), formPhone, formAddress, formNotes]
                    );
                }
            } else {
                const loyalty = parseFloat(formLoyalty.replace(/[^0-9.]/g, '') || '0');
                const points = canEditPoints
                    ? parseInt(formPoints.replace(/[^0-9]/g, '') || '0')
                    : Number(editing?.points || 0);
                if (loyalty < 0 || loyalty > 100) return Alert.alert('Validasi', 'Diskon pelanggan harus antara 0 sampai 100%.');
                const phone = normalizeCustomerPhone(formPhone);
                if (phone) {
                    const aliases = customerPhoneAliases(phone);
                    const [duplicateResult] = await db.executeSql(
                        `SELECT id FROM customers WHERE phone IN (${aliases.map(() => '?').join(',')}) AND id != ? LIMIT 1`,
                        [...aliases, editing?.id || -1]
                    );
                    if (duplicateResult.rows.length > 0) return Alert.alert('Nomor sudah terdaftar', 'Pilih atau edit pelanggan yang sudah menggunakan nomor tersebut.');
                }
                if (editing) {
                    const pointsManuallyEdited = canEditPoints && points !== Number(editing.points || 0) ? 1 : Number(editing.pointsManuallyEdited || 0);
                    await db.executeSql(
                        'UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, imageUrl = ?, displayType = ?, loyaltyDiscount = ?, points = ?, pointsManuallyEdited = ?, isSynced = 0 WHERE id = ?',
                        [formName.trim(), phone, formEmail.trim() || null, formNotes.trim() || null, formImageUrl || null, formDisplayType, loyalty, points, pointsManuallyEdited, editing.id]
                    );
                } else {
                    await db.executeSql(
                        'INSERT INTO customers (name, phone, email, notes, imageUrl, displayType, loyaltyDiscount, points, pointsManuallyEdited, isSynced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
                        [formName.trim(), phone, formEmail.trim() || null, formNotes.trim() || null, formImageUrl || null, formDisplayType, loyalty, points, canEditPoints && points > 0 ? 1 : 0]
                    );
                }
            }
            setShowModal(false);
            resetForm();
            loadData();
        } catch (e) {
            Alert.alert('Error', 'Gagal menyimpan data.');
        }
    };

    const handleDelete = (id: number) => {
        const label = activeTab === 'supplier' ? 'supplier' : 'pelanggan';
        Alert.alert('Hapus', `Yakin hapus ${label} ini?`, [
            { text: 'Batal', style: 'cancel' },
            {
                text: 'Hapus', style: 'destructive', onPress: async () => {
                    try {
                        const db = await getDBConnection();
                        const table = activeTab === 'supplier' ? 'suppliers' : 'customers';
                        await db.executeSql(`DELETE FROM ${table} WHERE id = ?`, [id]);
                        setMenuItemId(null);
                        loadData();
                    } catch (e) { Alert.alert('Error', 'Gagal menghapus data.'); }
                }
            }
        ]);
    };

    const data = activeTab === 'supplier' ? suppliers : customers;
    const filtered = searchQuery.trim()
        ? data.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (d.phone || '').includes(searchQuery))
        : data;

    const renderContactItem = ({ item }: { item: any }) => (
        <View style={tw`bg-white dark:bg-gray-800 flex-row items-center px-5 py-4 border-b border-gray-100 dark:border-gray-800`}>
            {/* Avatar */}
            {activeTab === 'customer' && item.imageUrl ? (
                <Image source={{ uri: resolveApiAssetUrl(item.imageUrl) || item.imageUrl }} style={tw`w-11 h-11 rounded-full mr-4 bg-gray-100`} />
            ) : (
                <View style={tw`w-11 h-11 bg-gray-100 dark:bg-gray-700 rounded-full items-center justify-center mr-4`}>
                    <Icon name="account" size={20} color={tw.color('gray-500')} />
                </View>
            )}

            {/* Info */}
            <TouchableOpacity style={tw`flex-1`} onPress={() => openEdit(item)} activeOpacity={0.7}>
                <Text style={tw`font-bold text-gray-800 dark:text-gray-100 text-base`}>{item.name}</Text>
                {item.phone ? (
                    <Text style={tw`text-gray-500 dark:text-gray-400 text-sm mt-0.5`}>{item.phone}</Text>
                ) : null}
                {activeTab === 'customer' && (
                    <View style={tw`flex-row items-center mt-1 flex-wrap gap-1`}>
                        {item.memberId ? (
                            <View style={tw`bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full`}>
                                <Text style={tw`text-[10px] font-black text-gray-600`}>{item.memberId}</Text>
                            </View>
                        ) : null}
                        {item.points > 0 && (
                            <View style={tw`bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full`}>
                                <Text style={tw`text-[10px] font-black text-blue-600`}>{item.points} Poin</Text>
                            </View>
                        )}
                        <View style={tw`bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full`}>
                            <Text style={tw`text-[10px] font-black text-purple-600`}>{Number(item.totalVisits || 0)} Kunjungan</Text>
                        </View>
                        <View style={tw`bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full`}>
                            <Text style={tw`text-[10px] font-black text-amber-700`}>Rp {Number(item.totalSpent || 0).toLocaleString('id-ID')}</Text>
                        </View>
                        {item.loyaltyDiscount > 0 && (
                            <View style={tw`bg-green-50 border border-green-200 px-2 py-0.5 rounded-full`}>
                                <Text style={tw`text-[10px] font-black text-green-600`}>Diskon {item.loyaltyDiscount}%</Text>
                            </View>
                        )}
                    </View>
                )}
                {activeTab === 'supplier' && item.address ? (
                    <Text style={tw`text-gray-400 dark:text-gray-500 text-xs mt-0.5`} numberOfLines={1}>{item.address}</Text>
                ) : null}
            </TouchableOpacity>

            {/* Menu */}
            <TouchableOpacity
                style={tw`p-2`}
                onPress={() => setMenuItemId(menuItemId === item.id ? null : item.id)}
            >
                <Icon name="dots-vertical" size={18} color={tw.color('gray-400')} />
            </TouchableOpacity>

            {/* Popup menu */}
            {menuItemId === item.id && (
                <View style={tw`absolute right-4 top-14 bg-white dark:bg-gray-700 rounded-xl shadow-lg border border-gray-200 dark:border-gray-600 z-50 overflow-hidden`}>
                    <TouchableOpacity style={tw`px-4 py-3 flex-row items-center`} onPress={() => openEdit(item)}>
                        <Icon name="pencil" size={14} color={tw.color('blue-600')} style={tw`mr-2`} />
                        <Text style={tw`text-blue-600 font-bold text-sm`}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={tw`px-4 py-3 flex-row items-center border-t border-gray-100 dark:border-gray-600`} onPress={() => handleDelete(item.id)}>
                        <Icon name="delete-outline" size={14} color={tw.color('red-500')} style={tw`mr-2`} />
                        <Text style={tw`text-red-500 font-bold text-sm`}>Hapus</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    return (
        <View style={tw`flex-1 bg-gray-50 dark:bg-gray-900`}>
            {/* Header */}
            <View style={tw`bg-white dark:bg-gray-800 px-6 pt-4 pb-4 border-b border-gray-100 dark:border-gray-700`}>
                <View style={tw`flex-row items-center justify-between mb-3`}>
                    <View>
                        <Text style={tw`text-2xl font-black text-gray-800 dark:text-gray-100`}>Kontak</Text>
                        <Text style={tw`text-gray-500 dark:text-gray-400 text-sm mt-0.5`}>Kelola supplier dan customer</Text>
                    </View>
                    <TouchableOpacity
                        style={tw`w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full items-center justify-center`}
                        onPress={() => setSearchQuery(searchQuery ? '' : ' ')}
                    >
                        <Icon name="magnify" size={18} color={tw.color('gray-600')} />
                    </TouchableOpacity>
                </View>

                {/* Tabs */}
                <View style={tw`flex-row bg-gray-100 dark:bg-gray-700 rounded-xl p-1`}>
                    {(['supplier', 'customer'] as const).map(tab => (
                        <TouchableOpacity
                            key={tab}
                            style={tw`flex-1 py-2.5 rounded-lg items-center ${activeTab === tab ? 'bg-blue-600 dark:bg-blue-500' : ''}`}
                            onPress={() => { setActiveTab(tab); setSearchQuery(''); setMenuItemId(null); }}
                        >
                            <Text style={tw`font-bold text-sm ${activeTab === tab ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                                {tab === 'supplier' ? 'Supplier' : 'Customer'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Search */}
            {searchQuery !== '' && (
                <View style={tw`bg-white dark:bg-gray-800 px-5 py-2 border-b border-gray-100 dark:border-gray-800`}>
                    <View style={tw`flex-row items-center bg-gray-50 dark:bg-gray-900 rounded-xl px-3`}>
                        <Icon name="magnify" size={14} color={tw.color('gray-400')} style={tw`mr-2`} />
                        <TextInput
                            style={tw`flex-1 py-2.5 text-gray-800 dark:text-gray-100 text-sm`}
                            placeholder={`Cari ${activeTab === 'supplier' ? 'supplier' : 'customer'}...`}
                            placeholderTextColor={tw.color('gray-400')}
                            value={searchQuery.trim() === '' ? '' : searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                        />
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Icon name="close" size={14} color={tw.color('gray-400')} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* List */}
            <FlatList
                data={filtered}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderContactItem}
                ListEmptyComponent={() => (
                    <View style={tw`items-center py-20`}>
                        <Icon name="account" size={48} color={tw.color('gray-300')} />
                        <Text style={tw`text-gray-400 font-bold mt-4`}>
                            Belum ada data {activeTab === 'supplier' ? 'supplier' : 'customer'}
                        </Text>
                        <TouchableOpacity
                            style={tw`mt-4 bg-blue-600 px-5 py-2.5 rounded-xl`}
                            onPress={openAdd}
                        >
                            <Text style={tw`text-white font-bold text-sm`}>+ Tambah {activeTab === 'supplier' ? 'Supplier' : 'Customer'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
                onScrollBeginDrag={() => setMenuItemId(null)}
            />

            {/* FAB */}
            <TouchableOpacity
                style={tw`absolute bottom-6 right-6 w-14 h-14 bg-blue-600 rounded-full items-center justify-center shadow-lg`}
                onPress={openAdd}
                activeOpacity={0.8}
            >
                <Icon name="plus" size={26} color="white" />
            </TouchableOpacity>

            {/* Add/Edit Modal */}
            <Modal visible={showModal} transparent animationType="slide">
                <View style={tw`flex-1 bg-black/50 justify-end`}>
                    <View style={tw`bg-white dark:bg-gray-800 rounded-t-3xl shadow-xl`}>
                        {/* Header */}
                        <View style={tw`flex-row justify-between items-center px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800`}>
                            <Text style={tw`font-black text-xl text-gray-800 dark:text-gray-100`}>
                                {editing ? 'Edit' : 'Tambah'} {activeTab === 'supplier' ? 'Supplier' : 'Customer'}
                            </Text>
                            <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }} style={tw`p-2 bg-gray-100 dark:bg-gray-700 rounded-full`}>
                                <Icon name="close" size={20} color={tw.color('gray-600')} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={tw`px-6 py-4 pb-8`} keyboardShouldPersistTaps="handled">
                            {/* Name */}
                            <View style={tw`flex-row items-center mb-1`}>
                                <Icon name="account" size={14} color={tw.color('gray-500')} style={tw`mr-2`} />
                                <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300`}>Nama <Text style={tw`text-red-400`}>*</Text></Text>
                            </View>
                            <TextInput
                                style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 mb-4`}
                                placeholder="Nama lengkap"
                                placeholderTextColor={tw.color('gray-400')}
                                value={formName}
                                onChangeText={setFormName}
                            />

                            {/* Phone */}
                            <View style={tw`flex-row items-center mb-1`}>
                                <Icon name="phone" size={14} color={tw.color('gray-500')} style={tw`mr-2`} />
                                <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300`}>No. Telepon</Text>
                            </View>
                            <TextInput
                                style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 mb-4`}
                                placeholder="08xx-xxxx-xxxx"
                                placeholderTextColor={tw.color('gray-400')}
                                keyboardType="phone-pad"
                                value={formPhone}
                                onChangeText={value => setFormPhone(activeTab === 'customer' ? restrictPhoneInput(value) : value)}
                                maxLength={activeTab === 'customer' ? 16 : 20}
                            />

                            {activeTab === 'customer' && (
                                <>
                                    <View style={tw`flex-row items-center mb-1`}>
                                        <Icon name="email-outline" size={14} color={tw.color('gray-500')} style={tw`mr-2`} />
                                        <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300`}>Email</Text>
                                    </View>
                                    <TextInput
                                        style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 mb-4`}
                                        placeholder="email@pelanggan.com"
                                        placeholderTextColor={tw.color('gray-400')}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={formEmail}
                                        onChangeText={setFormEmail}
                                    />

                                    <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300 mb-2`}>Foto Profil</Text>
                                    <TouchableOpacity
                                        style={tw`h-28 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl items-center justify-center mb-4 overflow-hidden bg-gray-50 dark:bg-gray-900`}
                                        onPress={async () => {
                                            const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 });
                                            const uri = result.assets?.[0]?.uri;
                                            if (uri) setFormImageUrl(uri);
                                        }}
                                    >
                                        {formImageUrl ? (
                                            <Image source={{ uri: resolveApiAssetUrl(formImageUrl) || formImageUrl }} style={tw`w-full h-full`} resizeMode="cover" />
                                        ) : (
                                            <View style={tw`items-center`}>
                                                <Icon name="cloud-upload-outline" size={26} color={tw.color('gray-400')} />
                                                <Text style={tw`text-xs text-gray-400 mt-1`}>Pilih foto</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>

                                    <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300 mb-2`}>Highlight Card</Text>
                                    <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
                                        {[
                                            ['normal', 'Normal'], ['tall', 'Tinggi'], ['wide', 'Lebar'], ['large', 'VIP Besar']
                                        ].map(([value, label]) => (
                                            <TouchableOpacity key={value} onPress={() => setFormDisplayType(value)} style={tw`px-3 py-2 rounded-xl border ${formDisplayType === value ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`}>
                                                <Text style={tw`text-xs font-bold ${formDisplayType === value ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>{label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {editing?.memberId ? (
                                        <View style={tw`bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4`}>
                                            <Text style={tw`text-[10px] text-blue-500 font-bold uppercase`}>Member ID</Text>
                                            <Text style={tw`text-sm text-gray-800 font-black mt-0.5`}>{editing.memberId}</Text>
                                        </View>
                                    ) : null}
                                </>
                            )}

                            {/* Address (supplier only) */}
                            {activeTab === 'supplier' && (
                                <>
                                    <View style={tw`flex-row items-center mb-1`}>
                                        <Icon name="map-marker" size={14} color={tw.color('gray-500')} style={tw`mr-2`} />
                                        <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300`}>Alamat</Text>
                                    </View>
                                    <TextInput
                                        style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 mb-4`}
                                        placeholder="Alamat supplier"
                                        placeholderTextColor={tw.color('gray-400')}
                                        multiline
                                        value={formAddress}
                                        onChangeText={setFormAddress}
                                    />
                                </>
                            )}

                            {/* Notes */}
                            <View style={tw`flex-row items-center mb-1`}>
                                <Icon name="file-document-outline" size={14} color={tw.color('gray-500')} style={tw`mr-2`} />
                                <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300`}>Catatan</Text>
                            </View>
                            <TextInput
                                style={tw`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 mb-4`}
                                placeholder="Catatan tambahan..."
                                placeholderTextColor={tw.color('gray-400')}
                                multiline
                                value={formNotes}
                                onChangeText={setFormNotes}
                            />

                            {/* Loyalty Discount & Points (customer only) */}
                            {activeTab === 'customer' && (
                                <View style={tw`flex-row gap-4 mb-5`}>
                                    <View style={tw`flex-1`}>
                                        <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300 mb-1`}>Diskon (%)</Text>
                                        <View style={tw`flex-row items-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden`}>
                                            <TextInput
                                                style={tw`flex-1 px-4 py-3 text-gray-800 dark:text-gray-100 font-bold`}
                                                keyboardType="numeric"
                                                placeholder="0"
                                                value={formLoyalty}
                                                onChangeText={t => setFormLoyalty(t.replace(/[^0-9.]/g, ''))}
                                            />
                                            <View style={tw`bg-gray-100 dark:bg-gray-700 px-3 py-3`}>
                                                <Text style={tw`font-black text-gray-500`}>%</Text>
                                            </View>
                                        </View>
                                    </View>
                                    <View style={tw`flex-1`}>
                                        <Text style={tw`text-xs font-bold text-gray-600 dark:text-gray-300 mb-1`}>Poin</Text>
                                        <View style={tw`flex-row items-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden`}>
                                            <TextInput
                                                style={tw`flex-1 px-4 py-3 font-bold ${canEditPoints ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                                                keyboardType="numeric"
                                                placeholder="0"
                                                value={formPoints}
                                                onChangeText={t => setFormPoints(t.replace(/[^0-9]/g, ''))}
                                                editable={canEditPoints}
                                            />
                                        </View>
                                        {!canEditPoints && <Text style={tw`text-[10px] text-gray-400 mt-1`}>Saldo poin hanya dapat diubah Admin/Owner.</Text>}
                                    </View>
                                </View>
                            )}

                            {/* Save Button */}
                            <TouchableOpacity
                                style={tw`bg-blue-600 py-4 rounded-2xl items-center flex-row justify-center`}
                                onPress={handleSave}
                            >
                                <Icon name="content-save" size={18} color="white" style={tw`mr-2`} />
                                <Text style={tw`font-bold text-white text-base`}>Simpan</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
