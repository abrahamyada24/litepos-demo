"use client";

import { useState, useEffect } from 'react';
import {
  X, UploadCloud, Save, LayoutGrid, Package,
  Tag, Info, Edit3, Boxes,
  Monitor, CheckCircle2, AlertCircle, Trash2, Plus, ScanBarcode,
  Percent, CalendarClock
} from 'lucide-react';
import { showAlert } from '@/utils/swal';
import { useStore } from '@/store/useStore';
import CurrencyInput from '@/components/CurrencyInput';

export default function ProductModal({ isOpen, onClose, onSave, initialData, categories }) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  const activeStore = useStore((state) => state.activeStore);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    price: '',
    costPrice: '',
    stock: '',
    minStock: '',
    isUnlimitedStock: false,
    unitLabel: 'item',
    status: 'active',
    displayType: 'normal',
    imageFile: null,
    discountActive: false,
    discountType: 'PERCENT',
    discountValue: '',
    discountStartAt: '',
    discountEndAt: '',
    discountDateEnabled: false,
    discountStartTime: '',
    discountEndTime: '',
    discountTimeEnabled: false,
    discountDays: [],
    discountDaysEnabled: false,
    discountLabel: ''
  });
  const [previewUrl, setPreviewUrl] = useState('');

  // ADDONS STATE
  const [addons, setAddons] = useState([]);
  const [newAddon, setNewAddon] = useState({ name: '', price: '' });

  // --- HELPER UNTUK PREVIEW GAMBAR CLOUDINARY ---
  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('//')) {
      return path.startsWith('//') ? `https:${path}` : path;
    }
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${API_URL}/${cleanPath}`;
  };

  const fetchAddons = async (productId) => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/addons/${productId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if(json.success) setAddons(json.data);
    } catch(e) { console.error(e); }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          name: initialData.name,
          sku: initialData.sku || '',
          barcode: initialData.barcode || '',
          categoryId: initialData.categoryId || '',
          price: initialData.price || '',
          costPrice: initialData.costPrice || '',
          stock: initialData.stock || '',
          minStock: initialData.minStock || '',
          isUnlimitedStock: initialData.isUnlimitedStock || false,
          unitLabel: initialData.unitLabel || 'item',
          status: initialData.isActive ? 'active' : 'inactive',
          displayType: initialData.displayType || 'normal',
          imageFile: null,
          discountActive: initialData.discountActive || false,
          discountType: initialData.discountType || 'PERCENT',
          discountValue: initialData.discountValue || '',
          discountStartAt: initialData.discountStartAt ? initialData.discountStartAt.slice(0, 10) : '',
          discountEndAt: initialData.discountEndAt ? initialData.discountEndAt.slice(0, 10) : '',
          discountDateEnabled: Boolean(initialData.discountStartAt || initialData.discountEndAt),
          discountStartTime: initialData.discountStartTime || '',
          discountEndTime: initialData.discountEndTime || '',
          discountTimeEnabled: Boolean(initialData.discountStartTime || initialData.discountEndTime),
          discountDays: initialData.discountDays ? String(initialData.discountDays).split(',').map(Number) : [],
          discountDaysEnabled: Boolean(initialData.discountDays),
          discountLabel: initialData.discountLabel || ''
        });
        setPreviewUrl(getImageUrl(initialData.imageUrl));
        fetchAddons(initialData.id);
      } else {
        setFormData({
          name: '',
          sku: '',
          barcode: '',
          categoryId: categories && categories.length > 0 ? categories[0].id : '',
          price: '',
          costPrice: '',
          stock: '',
          minStock: '',
          isUnlimitedStock: false,
          unitLabel: activeStore?.type === 'LAUNDRY' ? 'kg' : 'pcs',
          status: 'active',
          displayType: 'normal',
          imageFile: null,
          discountActive: false,
          discountType: 'PERCENT',
          discountValue: '',
          discountStartAt: '',
          discountEndAt: '',
          discountDateEnabled: false,
          discountStartTime: '',
          discountEndTime: '',
          discountTimeEnabled: false,
          discountDays: [],
          discountDaysEnabled: false,
          discountLabel: ''
        });
        setPreviewUrl('');
        setAddons([]);
      }
    }
  }, [isOpen, initialData, categories, activeStore?.type]);

  const handleAddAddon = async () => {
      if(!newAddon.name || !newAddon.price || !initialData) return;
      try {
          const token = localStorage.getItem('token');
          const res = await fetch(`${API_URL}/api/addons`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ productId: initialData.id, name: newAddon.name, price: newAddon.price })
          });
          const json = await res.json();
          if(json.success) {
              setNewAddon({ name: '', price: '' });
              fetchAddons(initialData.id);
          } else {
              showAlert.error('Gagal menambah addon', json.message || json.error || 'Terjadi kesalahan.');
          }
      } catch(e) {
          console.error(e);
          showAlert.error('Gagal menambah addon', 'Koneksi ke server bermasalah.');
      }
  };

  const handleDeleteAddon = async (id) => {
      const confirmed = await showAlert.confirmDanger('Hapus addon?', 'Pilihan tambahan ini akan dihapus dari produk.', 'Ya, Hapus Addon');
      if (!confirmed) return;
      try {
          const token = localStorage.getItem('token');
          const res = await fetch(`${API_URL}/api/addons/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.message || data.error);
          await fetchAddons(initialData.id);
          showAlert.success('Addon dihapus', 'Pilihan tambahan berhasil dihapus.');
      } catch(e) { showAlert.error('Gagal menghapus addon', e.message || 'Coba lagi.'); }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({ ...formData, imageFile: file });
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.discountActive && formData.discountDateEnabled) {
      if (!formData.discountStartAt || !formData.discountEndAt) {
        showAlert.warning('Periode tanggal belum lengkap', 'Isi tanggal mulai dan tanggal selesai.');
        return;
      }
      if (formData.discountEndAt < formData.discountStartAt) {
        showAlert.warning('Periode tanggal tidak valid', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
        return;
      }
    }
    if (formData.discountActive && formData.discountTimeEnabled && (!formData.discountStartTime || !formData.discountEndTime)) {
      showAlert.warning('Jam berlaku belum lengkap', 'Isi jam mulai dan jam selesai.');
      return;
    }
    if (formData.discountActive && formData.discountDaysEnabled && formData.discountDays.length === 0) {
      showAlert.warning('Hari berlaku belum dipilih', 'Pilih minimal satu hari untuk jadwal diskon.');
      return;
    }

    onSave({
      ...formData,
      discountStartAt: formData.discountDateEnabled ? formData.discountStartAt : '',
      discountEndAt: formData.discountDateEnabled ? formData.discountEndAt : '',
      discountStartTime: formData.discountTimeEnabled ? formData.discountStartTime : '',
      discountEndTime: formData.discountTimeEnabled ? formData.discountEndTime : '',
      discountDays: formData.discountDaysEnabled ? formData.discountDays : [],
    });
  };

  const toggleDiscountDay = (day) => {
    const days = formData.discountDays.includes(day)
      ? formData.discountDays.filter(item => item !== day)
      : [...formData.discountDays, day].sort();
    setFormData({ ...formData, discountDays: days });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl sm:rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-300 max-h-[98vh] sm:max-h-[95vh]">

        {/* Futuristic Dark Header */}
        <div className="px-4 py-4 sm:px-10 sm:py-8 flex justify-between items-center bg-gray-950 text-white relative flex-shrink-0">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="hidden sm:block p-3 bg-blue-500 rounded-2xl shadow-lg shadow-blue-500/20">
              <Boxes size={28} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-lg sm:text-2xl tracking-tight leading-tight sm:leading-none uppercase">
                {initialData ? 'Edit Inventory Item' : 'New Product Record'}
              </h3>
              <p className="hidden sm:block text-gray-500 text-[10px] uppercase font-bold tracking-[0.4em] mt-2">LitePOS Enterprise System v1.0</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-500 hover:text-white">
            <X size={32} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 sm:p-10 space-y-6 sm:space-y-10 overflow-y-auto no-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12">

              {/* LEFT SIDE: Visuals & Bento Layout */}
              <div className="lg:col-span-4 space-y-8">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 ml-1">Asset Image</label>
                  <div className="aspect-[4/5] rounded-[2.5rem] bg-gray-50 border-4 border-gray-100 flex flex-col items-center justify-center text-gray-400 relative overflow-hidden group hover:border-blue-500/30 transition-all cursor-pointer shadow-inner">
                    <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer z-20" />
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                    ) : (
                      <div className="flex flex-col items-center gap-3 group-hover:text-blue-500 transition-colors">
                        <div className="p-5 bg-white rounded-3xl shadow-sm border border-gray-100">
                          <UploadCloud size={40} strokeWidth={1} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Pilih Gambar</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <Edit3 className="text-white" size={32} />
                    </div>
                  </div>
                </div>

                {/* Visual Bento Selection */}
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4 ml-1 flex items-center gap-2">
                    <Monitor size={12} /> Grid Appearance
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'normal', label: '1x1', desc: 'Base' },
                      { id: 'wide', label: '2x1', desc: 'Horizontal' },
                      { id: 'tall', label: '1x2', desc: 'Portrait' },
                      { id: 'large', label: '2x2', desc: 'Hero' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, displayType: opt.id })}
                        className={`p-4 rounded-2xl border-2 text-left transition-all relative ${formData.displayType === opt.id
                          ? 'border-blue-500 bg-blue-50/50 text-blue-950 shadow-md ring-8 ring-blue-500/5'
                          : 'border-gray-100 text-gray-400 hover:border-gray-200 bg-white'
                          }`}
                      >
                        <p className="font-black text-xs">{opt.label}</p>
                        <p className="text-[8px] uppercase tracking-tighter opacity-60 font-bold">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE: Main Data Input */}
              <div className="lg:col-span-8 space-y-8">
                {/* Product Name */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Identitas Produk</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-8 py-6 bg-gray-50 border-2 border-gray-100 rounded-[1.5rem] text-gray-950 font-black text-2xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all placeholder:text-gray-200"
                    placeholder="Nasi Goreng Wagyu..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">SKU</label>
                    <div className="relative">
                      <Tag className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <input type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-gray-700 focus:outline-none focus:border-blue-500 transition-all placeholder:text-gray-300" placeholder="AUTO_GENERATE" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Barcode Scanner</label>
                    <div className="relative">
                      <ScanBarcode className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <input type="text" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-gray-700 focus:outline-none focus:border-blue-500 transition-all placeholder:text-gray-300" placeholder="Opsional Barcode" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Classification</label>
                  <div className="relative">
                    <LayoutGrid className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-gray-700 focus:outline-none focus:border-blue-500 bg-white appearance-none cursor-pointer">
                      {categories.map((cat) => (
                        cat.id !== 0 && <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pricing Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-8 bg-gray-50 rounded-2xl sm:rounded-[2.5rem] border border-gray-100 shadow-inner">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block ml-1">Harga Jual</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-blue-500">Rp</span>
                      <CurrencyInput
                        required
                        value={formData.price}
                        onChange={(value) => setFormData({ ...formData, price: value })}
                        className="w-full pl-14 pr-6 py-5 bg-white border-2 border-blue-100 rounded-2xl font-black text-xl text-gray-900 focus:outline-none focus:border-blue-500 transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Harga Pokok (HPP)</label>
                    <div className="relative opacity-60 hover:opacity-100 transition-opacity">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-gray-400">Rp</span>
                      <CurrencyInput
                        value={formData.costPrice}
                        onChange={(value) => setFormData({ ...formData, costPrice: value })}
                        className="w-full pl-14 pr-6 py-5 bg-white border-2 border-gray-100 rounded-2xl font-bold text-xl text-gray-700 focus:outline-none focus:border-gray-400 transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Satuan Penjualan</label>
                  <select
                    value={formData.unitLabel}
                    onChange={(event) => setFormData({ ...formData, unitLabel: event.target.value })}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-gray-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="item">Item</option>
                    <option value="pcs">Pcs</option>
                    <option value="kg">Kilogram (kg)</option>
                  </select>
                </div>

                <section className="p-5 border border-red-100 bg-red-50/40 rounded-xl space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                        <Percent size={18} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-sm text-gray-900">Diskon Produk</h4>
                        <p className="text-xs text-gray-500 truncate">Harga promo terjadwal per produk</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.discountActive}
                      onClick={() => setFormData({ ...formData, discountActive: !formData.discountActive })}
                      className={`w-12 h-7 rounded-full p-1 transition-colors ${formData.discountActive ? 'bg-red-600' : 'bg-gray-300'}`}
                    >
                      <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${formData.discountActive ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>

                  {formData.discountActive && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="grid grid-cols-2 p-1 bg-white border border-red-100 rounded-lg">
                          {[
                            { id: 'PERCENT', label: 'Persen' },
                            { id: 'NOMINAL', label: 'Nominal' }
                          ].map(option => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setFormData({ ...formData, discountType: option.id })}
                              className={`h-10 rounded-md text-xs font-black ${formData.discountType === option.id ? 'bg-red-600 text-white' : 'text-gray-500'}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">
                            {formData.discountType === 'PERCENT' ? '%' : 'Rp'}
                          </span>
                          {formData.discountType === 'PERCENT' ? (
                            <input
                              required
                              type="number"
                              min="0"
                              max="100"
                              value={formData.discountValue}
                              onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                              className="w-full h-12 pl-12 pr-4 bg-white border border-red-100 rounded-lg font-black outline-none focus:border-red-400"
                              placeholder="0"
                            />
                          ) : (
                            <CurrencyInput
                              required
                              value={formData.discountValue}
                              onChange={(value) => setFormData({ ...formData, discountValue: value })}
                              className="w-full h-12 pl-12 pr-4 bg-white border border-red-100 rounded-lg font-black outline-none focus:border-red-400"
                              placeholder="0"
                            />
                          )}
                        </div>
                      </div>

                      <input
                        value={formData.discountLabel}
                        onChange={(e) => setFormData({ ...formData, discountLabel: e.target.value })}
                        className="w-full h-11 px-4 bg-white border border-red-100 rounded-lg text-sm font-bold outline-none focus:border-red-400"
                        placeholder="Nama promo / event, mis. Promo Agustus"
                      />

                      <div className="space-y-2">
                        <label className="flex w-fit cursor-pointer items-center gap-2 text-[10px] font-black text-gray-600 uppercase">
                          <input type="checkbox" checked={formData.discountDateEnabled} onChange={(e) => setFormData({ ...formData, discountDateEnabled: e.target.checked })} className="h-4 w-4 rounded border-red-200 accent-red-600" />
                          Periode tanggal aktif
                        </label>
                        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${formData.discountDateEnabled ? '' : 'opacity-45'}`}>
                          <label className="text-[10px] font-black text-gray-500 uppercase">
                            Mulai tanggal
                            <input disabled={!formData.discountDateEnabled} type="date" value={formData.discountStartAt} onChange={(e) => setFormData({ ...formData, discountStartAt: e.target.value })} className="mt-1 w-full h-11 px-3 bg-white border border-red-100 rounded-lg text-sm text-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100" />
                          </label>
                          <label className="text-[10px] font-black text-gray-500 uppercase">
                            Sampai tanggal
                            <input disabled={!formData.discountDateEnabled} type="date" value={formData.discountEndAt} onChange={(e) => setFormData({ ...formData, discountEndAt: e.target.value })} className="mt-1 w-full h-11 px-3 bg-white border border-red-100 rounded-lg text-sm text-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100" />
                          </label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="flex w-fit cursor-pointer items-center gap-2 text-[10px] font-black text-gray-600 uppercase">
                          <input type="checkbox" checked={formData.discountTimeEnabled} onChange={(e) => setFormData({ ...formData, discountTimeEnabled: e.target.checked })} className="h-4 w-4 rounded border-red-200 accent-red-600" />
                          Jam berlaku aktif
                        </label>
                        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${formData.discountTimeEnabled ? '' : 'opacity-45'}`}>
                          <label className="text-[10px] font-black text-gray-500 uppercase">
                            Jam mulai
                            <input disabled={!formData.discountTimeEnabled} type="time" value={formData.discountStartTime} onChange={(e) => setFormData({ ...formData, discountStartTime: e.target.value })} className="mt-1 w-full h-11 px-3 bg-white border border-red-100 rounded-lg text-sm text-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100" />
                          </label>
                          <label className="text-[10px] font-black text-gray-500 uppercase">
                            Jam selesai
                            <input disabled={!formData.discountTimeEnabled} type="time" value={formData.discountEndTime} onChange={(e) => setFormData({ ...formData, discountEndTime: e.target.value })} className="mt-1 w-full h-11 px-3 bg-white border border-red-100 rounded-lg text-sm text-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100" />
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-[10px] font-black text-gray-600 uppercase">
                          <input type="checkbox" checked={formData.discountDaysEnabled} onChange={(e) => setFormData({ ...formData, discountDaysEnabled: e.target.checked })} className="h-4 w-4 rounded border-red-200 accent-red-600" />
                          <CalendarClock size={14} /> Hari berlaku aktif
                        </label>
                        <div className="grid grid-cols-7 gap-1">
                          {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((label, day) => (
                            <button
                              key={label}
                              type="button"
                              disabled={!formData.discountDaysEnabled}
                              onClick={() => toggleDiscountDay(day)}
                              className={`h-9 rounded-md text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-45 ${formData.discountDays.includes(day) ? 'bg-red-600 text-white' : 'bg-white border border-red-100 text-gray-500'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Stok Awal</label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={formData.isUnlimitedStock} onChange={(e) => setFormData({...formData, isUnlimitedStock: e.target.checked})} className="w-3 h-3 text-blue-500 rounded border-gray-300 focus:ring-blue-500" />
                        <span className="text-[9px] font-bold text-gray-500 uppercase">Stok Tak Terbatas</span>
                      </label>
                    </div>
                    <div className="relative">
                      <Package className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                      <input
                        required={!formData.isUnlimitedStock}
                        disabled={formData.isUnlimitedStock}
                        type="number"
                        value={formData.isUnlimitedStock ? 999 : formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                        className={`w-full pl-14 pr-6 py-4 border-2 rounded-2xl font-bold transition-all ${formData.isUnlimitedStock ? 'bg-gray-100 border-gray-100 text-gray-400' : 'bg-gray-50 border-gray-100 text-gray-800 focus:outline-none focus:border-gray-500'}`}
                        placeholder="Units"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Stok Minimal (Darurat)</label>
                    <div className="relative">
                      <AlertCircle className="absolute left-5 top-1/2 -translate-y-1/2 text-orange-300" size={18} />
                      <input
                        type="number"
                        value={formData.minStock}
                        onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                        className="w-full pl-14 pr-6 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-gray-800 focus:outline-none focus:border-orange-400 transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mt-6">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Status Control</label>
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl h-[58px]">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: 'active' })}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${formData.status === 'active' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <CheckCircle2 size={14} /> Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: 'inactive' })}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${formData.status === 'inactive' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <AlertCircle size={14} /> Disabled
                    </button>
                  </div>
                </div>
                
                {initialData && (
                  <div className="p-4 sm:p-6 bg-blue-50/50 rounded-2xl sm:rounded-[2rem] border border-blue-100 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Plus size={18} className="text-blue-500" />
                        <h4 className="font-black text-sm text-blue-900 uppercase tracking-widest">Pilihan Tambahan Produk</h4>
                    </div>
                    <div className="space-y-2">
                        {addons.map(addon => (
                            <div key={addon.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-blue-50 shadow-sm">
                                <div>
                                    <p className="font-bold text-sm text-gray-800">{addon.name}</p>
                                    <p className="text-xs text-blue-500 font-bold">Rp {parseInt(addon.price).toLocaleString('id-ID')}</p>
                                </div>
                                <button type="button" onClick={() => handleDeleteAddon(addon.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"><Trash2 size={16}/></button>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-blue-100/50 mt-4">
                        <input type="text" value={newAddon.name} onChange={(e) => setNewAddon({...newAddon, name: e.target.value})} placeholder="Contoh: Bungkus kado" className="w-full sm:flex-1 px-4 py-2 rounded-xl border border-blue-100 text-sm focus:outline-none focus:border-blue-300 bg-white" />
                        <CurrencyInput value={newAddon.price} onChange={(value) => setNewAddon({...newAddon, price: value})} placeholder="Harga" className="w-full sm:w-28 px-4 py-2 rounded-xl border border-blue-100 text-sm focus:outline-none focus:border-blue-300 bg-white" />
                        <button type="button" onClick={handleAddAddon} className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-bold text-sm">Tambah</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer with Floating Effect */}
          <div className="px-4 py-4 sm:px-10 sm:py-8 border-t border-gray-100 flex flex-col-reverse sm:flex-row justify-end items-stretch sm:items-center gap-3 sm:gap-6 flex-shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="py-2 text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-gray-400 hover:text-gray-900 transition-colors"
            >
              Dismiss Changes
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto justify-center px-5 py-4 sm:px-12 sm:py-5 bg-gray-950 text-white rounded-2xl sm:rounded-[1.8rem] hover:bg-blue-600 shadow-2xl shadow-gray-200 transition-all active:scale-95 font-black text-xs sm:text-sm flex items-center gap-2 sm:gap-3 uppercase tracking-wider sm:tracking-widest"
            >
              <Save size={20} />
              Confirm Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

