"use client";

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Save, User, X } from 'lucide-react';
import { restrictPhoneInput, validatePhoneInput } from '@/utils/phone';

export default function MemberModal({ isOpen, onClose, memberSearch, setMemberSearch, filteredMembers, handleMemberSelect, getImageUrl, onCreateMember }) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
  const phoneError = validatePhoneInput(formData.phone);

  useEffect(() => {
    if (!isOpen) {
      setShowCreateForm(false);
      setIsSubmitting(false);
      setFormData({ name: '', phone: '', email: '' });
    }
  }, [isOpen]);

  const openCreateForm = () => {
    setFormData(current => ({ ...current, name: memberSearch.trim() }));
    setShowCreateForm(true);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!formData.name.trim() || phoneError || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onCreateMember({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden zoom-in-95">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            {showCreateForm && (
              <button type="button" onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600" aria-label="Kembali ke daftar pelanggan">
                <ArrowLeft size={20}/>
              </button>
            )}
            <h3 className="font-bold text-gray-800">{showCreateForm ? 'Tambah Pelanggan' : 'Pilih Pelanggan'}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Tutup"><X size={20}/></button>
        </div>

        {showCreateForm ? (
          <form onSubmit={handleCreate} className="p-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">Nama pelanggan <span className="text-red-500">*</span></label>
              <input
                autoFocus
                required
                maxLength={255}
                value={formData.name}
                onChange={(event) => setFormData(current => ({ ...current, name: event.target.value }))}
                placeholder="Contoh: Budi Santoso"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">Nomor HP</label>
              <input
                type="tel"
                inputMode="tel"
                maxLength={16}
                aria-invalid={Boolean(phoneError)}
                value={formData.phone}
                onChange={(event) => setFormData(current => ({ ...current, phone: restrictPhoneInput(event.target.value) }))}
                placeholder="08xxxxxxxxxx (opsional)"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {phoneError && <p className="mt-1 text-xs text-red-600" role="alert">{phoneError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">Email</label>
              <input
                type="email"
                maxLength={255}
                value={formData.email}
                onChange={(event) => setFormData(current => ({ ...current, email: event.target.value }))}
                placeholder="email@contoh.com (opsional)"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !formData.name.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={17} className="animate-spin"/> : <Save size={17}/>} Simpan & Pilih Pelanggan
            </button>
          </form>
        ) : (
          <div className="p-4">
            <input
              autoFocus
              type="text"
              placeholder="Ketik nama, ID member, atau No HP..."
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              className="w-full pl-4 pr-4 py-2 bg-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-200 mb-3"
            />
            <button
              type="button"
              onClick={openCreateForm}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-100"
            >
              <Plus size={16}/> Tambah Pelanggan Baru
            </button>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredMembers.length > 0 ? (
                filteredMembers.map(member => (
                  <button key={member.id} onClick={() => handleMemberSelect(member)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-100 text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                        {member.imageUrl ? <img src={getImageUrl(member.imageUrl)} alt={member.name} className="w-full h-full object-cover"/> : <User className="m-2 text-gray-500"/>}
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">{member.name}</p>
                        <p className="text-xs text-gray-500">{[member.memberId, member.phone].filter(Boolean).join(' • ') || 'Tanpa nomor HP'}</p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-center text-gray-400 text-sm py-4">Tidak ada pelanggan ditemukan.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
