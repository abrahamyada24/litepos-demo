"use client";

import { useState, useEffect } from 'react';
import { X, UploadCloud, User, Save, ImageIcon, LayoutGrid, ShoppingBag, Coins } from 'lucide-react';
import { restrictPhoneInput, validatePhoneInput } from '@/utils/phone';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function CustomerModal({ isOpen, onClose, onSave, initialData }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    loyaltyDiscount: '0',
    points: '0',
    displayType: 'normal',
    imageFile: null
  });
  const [previewUrl, setPreviewUrl] = useState('');
  const phoneError = validatePhoneInput(formData.phone);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          name: initialData.name,
          phone: initialData.phone || '',
          email: initialData.email || '',
          notes: initialData.notes || '',
          loyaltyDiscount: String(initialData.loyaltyDiscount || 0),
          points: String(initialData.points || 0),
          displayType: initialData.displayType || 'normal',
          imageFile: null
        });
        setPreviewUrl(initialData.imageUrl ? `${API_URL}${initialData.imageUrl}` : '');
      } else {
        setFormData({
          name: '',
          phone: '',
          email: '',
          notes: '',
          loyaltyDiscount: '0',
          points: '0',
          displayType: 'normal',
          imageFile: null
        });
        setPreviewUrl('');
      }
    }
  }, [isOpen, initialData]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({ ...formData, imageFile: file });
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (phoneError) return;
    onSave(formData);
  };

  const formatRp = (num) => "Rp " + (Number(num) || 0).toLocaleString('id-ID');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
          <h3 className="font-bold text-lg text-gray-800">
            {initialData ? 'Edit Data Pelanggan' : 'Registrasi Member Baru'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-6 overflow-y-auto">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-1/3 space-y-4">
                <label className="block text-sm font-medium text-gray-700">Foto Profil</label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 bg-gray-50 overflow-hidden relative cursor-pointer hover:border-blue-400 transition-colors group">
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer z-20"
                    />
                    {previewUrl ? (
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex flex-col items-center gap-2 group-hover:text-blue-500">
                            <UploadCloud size={24} />
                            <span className="text-[10px]">Upload Foto</span>
                        </div>
                    )}
                </div>

                <div>
                    <label className="text-xs text-gray-500 mb-2 block flex items-center gap-1">
                        <LayoutGrid size={12}/> Highlight Card (Bento)
                    </label>
                    <select 
                        value={formData.displayType} 
                        onChange={(e) => setFormData({...formData, displayType: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-blue-500 outline-none cursor-pointer"
                    >
                        <option value="normal">Normal (1x1)</option>
                        <option value="tall">Tinggi (1x2)</option>
                        <option value="wide">Lebar (2x1)</option>
                        <option value="large">VIP Besar (2x2)</option>
                    </select>
                </div>

                {initialData && (
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 space-y-2">
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Statistik Member</p>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 flex items-center gap-1"><ShoppingBag size={12}/> Visits</span>
                            <span className="font-bold text-gray-700">{initialData.totalVisits}x</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 flex items-center gap-1"><Coins size={12}/> Spent</span>
                            <span className="font-bold text-gray-700">{formatRp(initialData.totalSpent)}</span>
                        </div>
                    </div>
                )}
              </div>

              <div className="flex-1 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                    <input 
                        required
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                        placeholder="Nama Pelanggan"
                    />
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">No. Telepon <span className="text-gray-400 text-xs">(Unik)</span></label>
                        <input 
                            type="tel"
                            inputMode="tel"
                            maxLength={16}
                            aria-invalid={Boolean(phoneError)}
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: restrictPhoneInput(e.target.value)})}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                            placeholder="0812..."
                        />
                        {phoneError && <p className="mt-1 text-xs text-red-600" role="alert">{phoneError}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input 
                            type="email" 
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                            placeholder="email@pelanggan.com"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Pelanggan</label>
                    <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={2} maxLength={500} className="w-full resize-none px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Contoh: menyukai boneka warna pastel" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Diskon Member (%)</label>
                        <input type="number" min="0" max="100" step="0.01" value={formData.loyaltyDiscount} onChange={(e) => setFormData({...formData, loyaltyDiscount: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Poin</label>
                        <input type="number" min="0" step="1" value={formData.points} onChange={(e) => setFormData({...formData, points: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500" />
                    </div>
                </div>

                {initialData && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100 flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-blue-500 font-bold border border-gray-200">ID</div>
                        <div>
                            <p className="text-xs text-gray-400">Member ID (Auto)</p>
                            <p className="text-sm font-bold text-gray-800 font-mono">{initialData.memberId}</p>
                        </div>
                    </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0 bg-white">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
            >
              Batal
            </button>
            <button 
              type="submit"
              className="px-5 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 shadow-lg shadow-blue-200 font-medium flex items-center gap-2 transition-colors"
            >
              <Save size={18} />
              Simpan Data
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
