"use client";

import { useState, useEffect, useRef } from 'react';
import { useNavigationGuard } from '@/components/NavigationGuard';
import { 
  Save, Store, CreditCard, ShieldCheck, UploadCloud, 
  Receipt, Printer, Smartphone, DollarSign, Loader2, Image as ImageIcon,
  Gift, Layout,
  Moon, Info
} from 'lucide-react';
import { useStore } from '../../../store/useStore';
import { showAlert } from '../../../utils/swal';
import CurrencyInput from '../../../components/CurrencyInput';
import { formatNumberId } from '../../../utils/currency';
import {
  DEFAULT_DEVICE_PREFERENCES,
  getDevicePreferences,
  getPaperWidthMm,
  saveDevicePreferences,
} from '../../../utils/devicePreferences';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const settingsSignature = value => JSON.stringify(value, (key, item) =>
  ['taxRate', 'serviceCharge', 'shiftDurationMinutes', 'shiftReminderMinutes', 'pointMultiplier', 'multiplierAmount', 'pointValue', 'minRedemptionPoints'].includes(key) ? Number(item) : item);

export default function SettingsPage() {
  const navigation = useNavigationGuard();
  const savedForm = useRef(null);
  const savedLoyalty = useRef(null);
  const { settings, fetchDataMaster, fetchSettings, user } = useStore();
  const canManageBusinessSettings = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState(canManageBusinessSettings ? 'general' : 'theme');
  const [isLoading, setIsLoading] = useState(false);
  const [devicePreferences, setDevicePreferences] = useState(DEFAULT_DEVICE_PREFERENCES);

  const [form, setForm] = useState({
    storeName: '',
    phone: '',
    address: '',
    email: '',
    website: '',
    enableCash: true,
    enableQris: false,
    enableDebit: false,
    taxRate: 0,
    serviceCharge: 0,
    autoPrintReceipt: true,
    receiptFooter: '',
    logoFile: null,
    allowNegativeStock: false,
    showImages: true,
    theme: 'light',
    enablePreOrder: false,
    enableShift: true,
    enableShiftReminder: true,
    shiftDurationMinutes: 480,
    shiftReminderMinutes: 15,
    shiftDayCutoff: '23:50'
  });

  const [loyaltyForm, setLoyaltyForm] = useState({
    pointMultiplier: 1,
    multiplierAmount: 10000,
    pointValue: 100,
    minRedemptionPoints: 10,
    isActive: true
  });

  const [logoPreview, setLogoPreview] = useState('');
  const formRef = useRef(form);
  const loyaltyRef = useRef(loyaltyForm);
  formRef.current = form;
  loyaltyRef.current = loyaltyForm;
  const hasSettingsChanges = Boolean(savedForm.current && settingsSignature(form) !== settingsSignature(savedForm.current));
  const hasLoyaltyChanges = Boolean(savedLoyalty.current && settingsSignature(loyaltyForm) !== settingsSignature(savedLoyalty.current));
  const hasUnsavedChanges = hasSettingsChanges || hasLoyaltyChanges;

  const [passForm, setPassForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchDataMaster();
    if (canManageBusinessSettings) fetchLoyaltyConfig();
  }, [canManageBusinessSettings]);

  useEffect(() => {
    setDevicePreferences(getDevicePreferences());
  }, []);

  useEffect(() => {
    if (!canManageBusinessSettings && !['theme', 'printer', 'about'].includes(activeTab)) {
      setActiveTab('theme');
    }
  }, [activeTab, canManageBusinessSettings]);

  const fetchLoyaltyConfig = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/settings/loyalty`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
            if (savedLoyalty.current && settingsSignature(loyaltyRef.current) !== settingsSignature(savedLoyalty.current)) return;
            savedLoyalty.current = data.data;
            setLoyaltyForm(data.data);
        }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (settings) {
      if (savedForm.current && settingsSignature(formRef.current) !== settingsSignature(savedForm.current)) return;
      const nextForm = {
        storeName: settings.storeName || '',
        phone: settings.phone || '',
        address: settings.address || '',
        email: settings.email || '',
        website: settings.website || '',
        enableCash: settings.enableCash,
        enableQris: settings.enableQris,
        enableDebit: settings.enableDebit,
        taxRate: Number(settings.taxRate) || 0,
        serviceCharge: Number(settings.serviceCharge) || 0,
        autoPrintReceipt: settings.autoPrintReceipt,
        receiptFooter: settings.receiptFooter || '',
        logoFile: null,
        allowNegativeStock: settings.allowNegativeStock,
        showImages: settings.showImages,
        theme: settings.theme || 'light',
        enablePreOrder: settings.enablePreOrder || false,
        enableShift: settings.enableShift !== undefined ? settings.enableShift : true,
        enableShiftReminder: settings.enableShiftReminder !== false,
        shiftDurationMinutes: Number(settings.shiftDurationMinutes) || 480,
        shiftReminderMinutes: Number.isFinite(Number(settings.shiftReminderMinutes)) ? Number(settings.shiftReminderMinutes) : 15,
        shiftDayCutoff: settings.shiftDayCutoff || '23:50'
      };
      savedForm.current = nextForm;
      setForm(nextForm);
      if (settings.logoUrl) {
          setLogoPreview(settings.logoUrl.startsWith('http') ? settings.logoUrl : `${API_URL}${settings.logoUrl}`);
      }
    }
  }, [settings]);


  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleToggle = (name) => {
    setForm(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setForm(prev => ({ ...prev, logoFile: file }));
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSaveSettings = async ({ silent = false } = {}) => {
    if (!canManageBusinessSettings) {
      showAlert.error('Akses ditolak', 'Pengaturan outlet hanya dapat diubah oleh Admin atau Owner.');
      return false;
    }
    setIsLoading(true);
    try {
        const token = localStorage.getItem('token');
        const formData = new FormData();

        Object.keys(form).forEach(key => {
            if (key !== 'logoFile') {
                formData.append(key, form[key]);
            }
        });

        if (form.logoFile) {
            formData.append('logo', form.logoFile);
        }

        const res = await fetch(`${API_URL}/api/settings`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || result.error || "Gagal menyimpan pengaturan");

        // Endpoint settings jauh lebih ringan daripada memuat semua master data
        // dan langsung memicu render ulang menu Sidebar.
        savedForm.current = { ...form };
        await fetchSettings();
        if (!silent) showAlert.success('Pengaturan tersimpan', 'Konfigurasi aplikasi berhasil diperbarui.');
        return true;

    } catch (error) {
        showAlert.error('Gagal menyimpan pengaturan', error.message);
        return false;
    } finally {
        setIsLoading(false);
    }
  };

  const updateDevicePreferences = (nextValue) => {
    setDevicePreferences(saveDevicePreferences(nextValue));
  };

  const printableLogoUrl = settings?.logoUrl
    ? (settings.logoUrl.startsWith('http') ? settings.logoUrl : `${API_URL}${settings.logoUrl}`)
    : '';
  const paperWidthMm = getPaperWidthMm(devicePreferences);

  const handleSaveLoyalty = async ({ silent = false } = {}) => {
    setIsLoading(true);
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/settings/loyalty`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(loyaltyForm)
        });

        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || "Gagal menyimpan konfigurasi loyalitas");
        savedLoyalty.current = result.data || { ...loyaltyForm };
        setLoyaltyForm(result.data || { ...loyaltyForm });
        if (!silent) showAlert.success('Loyalitas tersimpan', 'Konfigurasi loyalitas berhasil diperbarui.');
        return true;
    } catch (error) {
        showAlert.error('Gagal menyimpan loyalitas', error.message);
        return false;
    } finally {
        setIsLoading(false);
    }
  };

  const saveAllChanges = async () => {
    if (isLoading) return false;
    if (hasSettingsChanges && !await handleSaveSettings({ silent: true })) return false;
    if (hasLoyaltyChanges && !await handleSaveLoyalty({ silent: true })) return false;
    return true;
  };

  const discardChanges = () => {
    if (savedForm.current) setForm({ ...savedForm.current });
    if (savedLoyalty.current) setLoyaltyForm({ ...savedLoyalty.current });
    setLogoPreview(settings?.logoUrl ? (settings.logoUrl.startsWith('http') ? settings.logoUrl : `${API_URL}${settings.logoUrl}`) : '');
  };

  useEffect(() => navigation?.setGuard({
    isDirty: () => hasUnsavedChanges,
    save: saveAllChanges,
    discard: discardChanges,
    url: window.location.href,
    historyState: window.history.state,
  }), [navigation, form, loyaltyForm, isLoading, hasUnsavedChanges]);

  const changeTab = async id => {
    if (id === activeTab) return;
    if (!navigation || await navigation.confirmNavigation()) setActiveTab(id);
  };

  const handleUpdatePassword = async () => {
    if (passForm.newPassword !== passForm.confirmPassword) {
        return showAlert.warning('Konfirmasi tidak cocok', 'Password baru dan konfirmasi harus sama.');
    }
    
    setIsLoading(true);
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/auth/change-password`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                oldPassword: passForm.oldPassword,
                newPassword: passForm.newPassword
            })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        showAlert.success('Password diubah', 'Silakan login ulang menggunakan password baru.');
        setPassForm({ oldPassword: '', newPassword: '', confirmPassword: '' });

    } catch (error) {
        showAlert.error('Gagal mengubah password', error.message);
    } finally {
        setIsLoading(false);
    }
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => changeTab(id)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
        activeTab === id 
          ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm' 
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 border border-transparent'
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="space-y-6 pb-20">
      <style jsx global>{`
        @media print {
          @page { size: ${paperWidthMm}mm auto; margin: 0; }
          body * { visibility: hidden !important; }
          #settings-printer-test, #settings-printer-test * { visibility: visible !important; }
          #settings-printer-test {
            display: block !important;
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: ${paperWidthMm}mm !important;
            padding: ${devicePreferences.printMarginMm}mm !important;
            box-sizing: border-box !important;
            background: #fff !important;
            color: #000 !important;
            font-family: monospace !important;
          }
          #settings-printer-test .receipt-logo {
            display: block !important;
            width: auto !important;
            height: auto !important;
            max-width: ${paperWidthMm === 80 ? 58 : 42}mm !important;
            max-height: 16mm !important;
            margin: 0 auto 3mm !important;
            object-fit: contain !important;
          }
        }
      `}</style>

      <div id="settings-printer-test" data-print-surface className="hidden text-[10px] leading-tight">
        {printableLogoUrl && (
          <img className="receipt-logo" src={printableLogoUrl} alt="Logo toko" />
        )}
        <div className="text-center text-sm font-bold">{settings?.storeName || 'LITEPOS'}</div>
        <div className="my-2 border-t border-dashed border-black" />
        <div>TEST PRINT — {paperWidthMm} MM</div>
        <div>Rasio logo dipertahankan otomatis</div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center">Printer browser siap digunakan</div>
      </div>

      <div className="sticky -top-4 sm:-top-6 lg:-top-8 z-30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Pengaturan</h2>
          <p className="text-gray-400 text-sm">Kelola profil toko, pembayaran, dan sistem.</p>
          {hasUnsavedChanges && <p role="status" className="mt-1 text-xs font-bold text-amber-700">Perubahan belum disimpan</p>}
        </div>
        {canManageBusinessSettings && !['security', 'theme', 'printer', 'about'].includes(activeTab) && (
            <button 
                onClick={async () => { if (await saveAllChanges()) showAlert.success('Pengaturan tersimpan', 'Semua perubahan berhasil disimpan.'); }}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 shadow-lg shadow-blue-200 transition-colors font-medium disabled:opacity-70"
            >
                {isLoading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} />} 
                Simpan Perubahan
            </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-100 pb-2 overflow-x-auto no-scrollbar">
        {canManageBusinessSettings && <TabButton id="general" label="Profil Toko" icon={Store} />}
        {canManageBusinessSettings && <TabButton id="payment" label="Pembayaran" icon={CreditCard} />}
        {canManageBusinessSettings && <TabButton id="system" label="Sistem & Struk" icon={Receipt} />}
        {canManageBusinessSettings && <TabButton id="loyalty" label="Poin Pelanggan" icon={Gift} />}
        {canManageBusinessSettings && <TabButton id="security" label="Keamanan" icon={ShieldCheck} />}
        <TabButton id="theme" label="Tema" icon={Moon} />
        <TabButton id="printer" label="Printer" icon={Printer} />
        <TabButton id="about" label="Tentang Aplikasi" icon={Info} />
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="lg:col-span-1">
            <div className="card-base p-6 text-center h-full">
                <h3 className="font-bold text-gray-800 mb-4">Logo Struk</h3>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl h-48 flex flex-col items-center justify-center bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer group relative overflow-hidden">
                    <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer z-20"
                    />
                    {logoPreview ? (
                        <img src={logoPreview} alt="Logo Toko" className="w-full h-full object-contain p-2" />
                    ) : (
                        <>
                            <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <Store size={32} className="text-blue-500" />
                            </div>
                            <p className="text-xs text-gray-500 font-medium">Klik untuk upload logo</p>
                            <p className="text-[10px] text-gray-400 mt-1">Format: JPG, PNG (Max 2MB)</p>
                        </>
                    )}
                </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="card-base p-6 space-y-5">
                <h3 className="font-bold text-gray-800 border-b border-gray-100 pb-3">Informasi Dasar</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nama Toko</label>
                        <input name="storeName" value={form.storeName} onChange={handleChange} type="text" className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-all bg-gray-50/50 focus:bg-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">No. Telepon</label>
                        <input name="phone" value={form.phone} onChange={handleChange} type="text" className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-all bg-gray-50/50 focus:bg-white" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Lengkap</label>
                    <textarea name="address" value={form.address} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-all bg-gray-50/50 focus:bg-white" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Toko</label>
                        <input name="email" value={form.email} onChange={handleChange} type="email" className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-all bg-gray-50/50 focus:bg-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Website / Sosmed</label>
                        <input name="website" value={form.website} onChange={handleChange} type="text" className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-all bg-gray-50/50 focus:bg-white" />
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payment' && (
        <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="card-base p-6">
                <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-100 pb-3">Metode Pembayaran Aktif</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors bg-white">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-green-100 text-green-600 rounded-xl"><DollarSign size={24} /></div>
                            <div>
                                <p className="font-bold text-gray-800">Tunai (Cash)</p>
                                <p className="text-xs text-gray-500">Terima pembayaran uang fisik</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.enableCash} onChange={() => handleToggle('enableCash')} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors bg-white">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><Smartphone size={24} /></div>
                            <div>
                                <p className="font-bold text-gray-800">Midtrans (Payment Gateway)</p>
                                <p className="text-xs text-gray-500">Aktifkan hanya setelah akun dan API key Midtrans siap</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.enableQris} onChange={() => handleToggle('enableQris')} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-blue-200 transition-colors bg-white">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-purple-100 text-purple-600 rounded-xl"><CreditCard size={24} /></div>
                            <div>
                                <p className="font-bold text-gray-800">EDC / Debit</p>
                                <p className="text-xs text-gray-500">Mesin EDC Bank (Manual Input)</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.enableDebit} onChange={() => handleToggle('enableDebit')} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="card-base p-6">
                <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-100 pb-3">Konfigurasi Keuangan</h3>
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-bold text-gray-800 text-sm">Pajak (PPN)</p>
                            <p className="text-xs text-gray-500">Persentase pajak yang ditanggung pelanggan.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="number" name="taxRate" value={form.taxRate} onChange={handleChange} className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-right font-bold focus:border-blue-500 outline-none" />
                            <span className="text-sm font-bold text-gray-600">%</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-bold text-gray-800 text-sm">Service Charge</p>
                            <p className="text-xs text-gray-500">Biaya layanan tambahan (opsional).</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="number" name="serviceCharge" value={form.serviceCharge} onChange={handleChange} className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-right font-bold focus:border-blue-500 outline-none" />
                            <span className="text-sm font-bold text-gray-600">%</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card-base p-6">
                <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-100 pb-3 flex items-center gap-2">
                    <Layout size={18} /> Pengaturan Tampilan & Inventori
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-800 text-sm">Izinkan Stok Negatif</p>
                            <p className="text-xs text-gray-500">Tetap bisa jualan meski stok habis/nol di sistem.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.allowNegativeStock} onChange={() => handleToggle('allowNegativeStock')} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-800 text-sm">Tampilkan Gambar Produk</p>
                            <p className="text-xs text-gray-500">Munculkan foto produk di layar kasir (Android).</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.showImages} onChange={() => handleToggle('showImages')} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>

                </div>
            </div>

            <div className="card-base p-6 mt-6">
                <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-100 pb-3 flex items-center gap-2">
                    <Smartphone size={18} /> Fitur Operasional POS
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-800 text-sm">Fitur Kas Kasir / Shift</p>
                            <p className="text-xs text-gray-500">Mewajibkan buka/tutup kasir setiap hari.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.enableShift} onChange={() => handleToggle('enableShift')} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                            <p className="font-bold text-gray-800 text-sm">Fitur Pre-Order</p>
                            <p className="text-xs text-gray-500">Izinkan input tanggal pengambilan di checkout.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.enablePreOrder} onChange={() => handleToggle('enablePreOrder')} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>

                    {form.enableShift && (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">Pengingat Closing Shift</p>
                                    <p className="text-xs text-gray-500">Alert sebelum target tutup dan pergantian hari.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={form.enableShiftReminder} onChange={() => handleToggle('enableShiftReminder')} />
                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                                </label>
                            </div>
                            {form.enableShiftReminder && (
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <label className="text-xs font-bold text-gray-600">
                                        Durasi shift (jam)
                                        <input
                                            type="number"
                                            min="0.5"
                                            max="48"
                                            step="0.5"
                                            value={form.shiftDurationMinutes / 60}
                                            onChange={(event) => setForm(prev => ({ ...prev, shiftDurationMinutes: Math.round(Number(event.target.value || 0) * 60) }))}
                                            className="mt-1.5 w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400"
                                        />
                                    </label>
                                    <label className="text-xs font-bold text-gray-600">
                                        Ingatkan sebelumnya
                                        <div className="relative mt-1.5">
                                            <input
                                                type="number"
                                                min="0"
                                                max="240"
                                                step="5"
                                                value={form.shiftReminderMinutes}
                                                onChange={handleChange}
                                                name="shiftReminderMinutes"
                                                className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 pr-14 text-sm text-gray-800 outline-none focus:border-blue-400"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">menit</span>
                                        </div>
                                    </label>
                                    <label className="text-xs font-bold text-gray-600">
                                        Jam peringatan pergantian hari
                                        <input
                                            type="time"
                                            name="shiftDayCutoff"
                                            value={form.shiftDayCutoff}
                                            onChange={handleChange}
                                            className="mt-1.5 w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400"
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            <div className="card-base p-6">
                <h3 className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-3 flex items-center gap-2">
                    <Receipt size={18} /> Catatan di Nota
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                    Teks ini tercetak di bagian bawah nota web, desktop, dan Android.
                </p>
                <textarea
                    name="receiptFooter"
                    value={form.receiptFooter}
                    onChange={handleChange}
                    maxLength={500}
                    rows={4}
                    placeholder="Contoh: Terima kasih sudah berbelanja di Warna Warni Boneka"
                    className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                />
                <p className="mt-1 text-right text-[10px] text-gray-400">{form.receiptFooter.length}/500</p>
            </div>
        </div>
      )}

      {activeTab === 'loyalty' && (
        <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="card-base p-6 border-l-4 border-l-blue-500">
                <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <Gift className="text-blue-500" size={20} /> Program Loyalitas Poin
                </h3>
                <p className="text-xs text-gray-500 mb-6">Berikan poin kepada pelanggan setiap kelipatan pembelian tertentu. Poin dapat ditukar menjadi potongan harga.</p>

                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div>
                            <p className="font-bold text-gray-800 text-sm">Status Program Poin</p>
                            <p className="text-xs text-gray-500">Aktifkan atau nonaktifkan fitur poin di kasir.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={loyaltyForm.isActive} 
                                onChange={() => setLoyaltyForm({...loyaltyForm, isActive: !loyaltyForm.isActive})} 
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">Setiap Belanja Kelipatan</label>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400 font-bold">Rp</span>
                                <CurrencyInput
                                    value={loyaltyForm.multiplierAmount} 
                                    onChange={(value) => setLoyaltyForm({...loyaltyForm, multiplierAmount: value})}
                                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">Mendapatkan Poin</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    value={loyaltyForm.pointMultiplier} 
                                    onChange={(e) => setLoyaltyForm({...loyaltyForm, pointMultiplier: e.target.value})}
                                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold text-center"
                                />
                                <span className="text-gray-400 font-bold">Poin</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">Nilai 1 Poin (Penukaran)</label>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-400 font-bold">Rp</span>
                                <CurrencyInput
                                    value={loyaltyForm.pointValue} 
                                    onChange={(value) => setLoyaltyForm({...loyaltyForm, pointValue: value})}
                                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700">Min. Poin Untuk Tukar</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    value={loyaltyForm.minRedemptionPoints} 
                                    onChange={(e) => setLoyaltyForm({...loyaltyForm, minRedemptionPoints: e.target.value})}
                                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 font-bold text-center"
                                />
                                <span className="text-gray-400 font-bold">Poin</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <p className="text-xs text-blue-700 font-medium leading-relaxed">
                            <strong>Simulasi:</strong> Jika pelanggan belanja Rp 50.000, maka ia akan mendapatkan 
                            <span className="font-bold underline mx-1">
                                {Math.floor(50000 / (loyaltyForm.multiplierAmount || 10000)) * (loyaltyForm.pointMultiplier || 1)} Poin
                            </span>. 
                            10 Poin dapat ditukar dengan potongan belanja senilai 
                            <span className="font-bold underline ml-1">Rp {formatNumberId(10 * (loyaltyForm.pointValue || 100))}</span>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="card-base p-6 border border-red-100 bg-white">
                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2 text-red-600 pb-4 border-b border-red-50">
                    <ShieldCheck size={20} /> Ganti Password Akun
                </h3>
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password Lama</label>
                        <input 
                            type="password" 
                            value={passForm.oldPassword} 
                            onChange={(e) => setPassForm({...passForm, oldPassword: e.target.value})} 
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-red-300 transition-all bg-gray-50 focus:bg-white" 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru</label>
                        <input 
                            type="password" 
                            value={passForm.newPassword} 
                            onChange={(e) => setPassForm({...passForm, newPassword: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-red-300 transition-all bg-gray-50 focus:bg-white" 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password Baru</label>
                        <input 
                            type="password" 
                            value={passForm.confirmPassword} 
                            onChange={(e) => setPassForm({...passForm, confirmPassword: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-red-300 transition-all bg-gray-50 focus:bg-white" 
                        />
                    </div>
                    <div className="pt-4">
                        <button 
                            onClick={handleUpdatePassword}
                            disabled={isLoading}
                            className="w-full px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-70 flex justify-center items-center gap-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin"/> : <ShieldCheck size={18}/>}
                            Update Password
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'theme' && (
        <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="card-base p-6">
            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
              <Moon size={20} className="text-indigo-500" /> Tema Perangkat
            </h3>
            <p className="text-sm text-gray-500 mb-5">Tema hanya berlaku di browser ini dan tidak mengubah perangkat kasir lain.</p>
            <label className="block text-sm font-bold text-gray-700 mb-2">Tampilan aplikasi</label>
            <select
              value={devicePreferences.theme}
              onChange={(event) => updateDevicePreferences({ theme: event.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-all text-sm"
            >
              <option value="light">Terang</option>
              <option value="dark">Gelap</option>
              <option value="system">Ikuti sistem perangkat</option>
            </select>
          </div>
        </div>
      )}

      {activeTab === 'printer' && (
        <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="card-base p-6 space-y-6">
            <div>
              <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Printer size={20} className="text-teal-600" /> Printer Perangkat
              </h3>
              <p className="text-sm text-gray-500">Browser memilih printer fisik melalui dialog cetak. Ukuran berikut disimpan khusus di perangkat ini.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Lebar kertas</label>
                <select
                  value={devicePreferences.paperWidth}
                  onChange={(event) => updateDevicePreferences({ paperWidth: event.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="58">58 mm</option>
                  <option value="80">80 mm</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Margin struk</label>
                <select
                  value={devicePreferences.printMarginMm}
                  onChange={(event) => updateDevicePreferences({ printMarginMm: Number(event.target.value) })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value={0}>Tanpa margin</option>
                  <option value={2}>2 mm</option>
                  <option value={3}>3 mm</option>
                  <option value={5}>5 mm</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:w-auto rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white hover:bg-teal-700 flex items-center justify-center gap-2"
            >
              <Printer size={17} /> Test Print
            </button>
          </div>
        </div>
      )}

      {activeTab === 'about' && (
        <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="card-base p-8 text-center">
            <img src="/icon.png" alt="LitePOS Warna Warni" className="mx-auto mb-4 h-20 w-20 object-contain" />
            <h3 className="text-2xl font-black text-gray-800">LitePOS</h3>
            <p className="mt-1 text-sm text-gray-500">Point of Sale untuk operasional outlet</p>
            <p className="mt-5 text-xs text-gray-400">Pengaturan tema dan printer disimpan per perangkat.</p>
          </div>
        </div>
      )}

    </div>
  );
}
