"use client";

import React, { useState, useEffect } from 'react';
import { X, Percent, CheckCircle2 } from 'lucide-react';
import { showAlert } from '@/utils/swal';
import CurrencyInput from '@/components/CurrencyInput';

export default function DiscountModal({ isOpen, onClose, onApply, subTotal, initialDiscount = 0, initialType = 'amount' }) {
    const [discountType, setDiscountType] = useState(initialType);
    const [discountValue, setDiscountValue] = useState(initialDiscount.toString() || '');

    useEffect(() => {
        if (isOpen) {
            setDiscountType(initialType);
            setDiscountValue(initialDiscount > 0 ? initialDiscount.toString() : '');
        }
    }, [isOpen, initialDiscount, initialType]);

    if (!isOpen) return null;

    const handleApply = () => {
        const val = Number(discountValue || 0);
        if (!Number.isFinite(val) || val < 0 || (discountType === 'percent' && val > 100)) {
            showAlert.warning('Diskon tidak valid', 'Isi nominal positif atau persentase 0–100%.');
            return;
        }
        let amount = 0;
        
        if (discountType === 'percent') {
            amount = Math.round(subTotal * (val / 100));
        } else {
            amount = val;
        }

        // Validate max discount
        if (amount > subTotal) {
            showAlert.warning('Diskon terlalu besar', 'Diskon tidak boleh melebihi subtotal.');
            return;
        }

        onApply(val, discountType, amount);
        onClose();
    };

    const handleClear = () => {
        onApply(0, 'amount', 0);
        onClose();
    };

    const handlePresetPercent = (percent) => {
        setDiscountType('percent');
        setDiscountValue(percent.toString());
    };

    const handlePresetAmount = (amount) => {
        setDiscountType('amount');
        setDiscountValue(amount.toString());
    };

    // Calculate preview amount
    const val = Number(discountValue) || 0;
    const previewAmount = discountType === 'percent' 
        ? Math.round(subTotal * (val / 100)) 
        : val;
        
    const previewTotal = Math.max(0, subTotal - previewAmount);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="discount-title" className="bg-white rounded-2xl w-full max-w-md max-h-[90dvh] shadow-2xl flex flex-col overflow-y-auto">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h2 id="discount-title" className="text-xl font-bold text-gray-800">Tambahkan Diskon</h2>
                        <p className="text-sm text-gray-500 mt-1">Pilih jenis dan nominal diskon</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-xl transition-colors">
                        <X size={24} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Toggle Type */}
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                        <button 
                            className={`flex-1 py-2.5 flex items-center justify-center gap-2 rounded-lg font-bold text-sm transition-all ${
                                discountType === 'amount' 
                                    ? 'bg-white text-blue-600 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                            onClick={() => setDiscountType('amount')}
                        >
                            <span className="font-bold">Rp</span> Nominal (Rp)
                        </button>
                        <button 
                            className={`flex-1 py-2.5 flex items-center justify-center gap-2 rounded-lg font-bold text-sm transition-all ${
                                discountType === 'percent' 
                                    ? 'bg-white text-blue-600 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                            onClick={() => setDiscountType('percent')}
                        >
                            <Percent size={16} /> Persentase (%)
                        </button>
                    </div>

                    {/* Input Area */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                            {discountType === 'percent' ? 'Persentase Diskon' : 'Nominal Diskon'}
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
                                {discountType === 'percent' ? '%' : 'Rp'}
                            </span>
                            {discountType === 'percent' ? (
                                <input
                                    type="number"
                                    aria-label="Persentase Diskon"
                                    value={discountValue}
                                    onChange={(e) => setDiscountValue(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold text-xl text-gray-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                                    placeholder="0"
                                    min="0"
                                    max="100"
                                />
                            ) : (
                                <CurrencyInput
                                    aria-label="Nominal Diskon"
                                    value={discountValue}
                                    onChange={setDiscountValue}
                                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold text-xl text-gray-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                                    placeholder="0"
                                    max={subTotal}
                                />
                            )}
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Preset Cepat</label>
                        <div className="flex gap-2">
                            {discountType === 'percent' ? (
                                <>
                                    {[5, 10, 15, 20, 25].map(p => (
                                        <button 
                                            key={p}
                                            onClick={() => handlePresetPercent(p)}
                                            className="flex-1 py-2 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 border border-gray-100 rounded-lg text-sm font-bold text-gray-600 transition-colors"
                                        >
                                            {p}%
                                        </button>
                                    ))}
                                </>
                            ) : (
                                <>
                                    {[5000, 10000, 20000, 50000].map(a => (
                                        <button 
                                            key={a}
                                            onClick={() => handlePresetAmount(a)}
                                            className="flex-1 py-2 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 border border-gray-100 rounded-lg text-sm font-bold text-gray-600 transition-colors"
                                        >
                                            {(a/1000)}k
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Preview Summary */}
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <div className="flex justify-between items-center mb-1 text-sm text-blue-700">
                            <span>Subtotal</span>
                            <span className="font-medium">Rp {subTotal.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between items-center mb-3 text-sm text-red-600">
                            <span>Diskon</span>
                            <span className="font-bold">-Rp {previewAmount.toLocaleString('id-ID')}</span>
                        </div>
                        <div className="pt-3 border-t border-blue-200/50 flex justify-between items-center">
                            <span className="font-bold text-blue-900">Total Setelah Diskon</span>
                            <span className="text-xl font-black text-blue-700">
                                Rp {previewTotal.toLocaleString('id-ID')}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 flex gap-3 bg-gray-50/50">
                    <button 
                        onClick={handleClear}
                        className="flex-1 py-3.5 bg-white border border-gray-200 text-red-600 font-bold rounded-xl hover:bg-red-50 hover:border-red-200 transition-colors"
                    >
                        Hapus Diskon
                    </button>
                    <button 
                        onClick={handleApply}
                        className="flex-[2] py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={20} />
                        Terapkan
                    </button>
                </div>
            </div>
        </div>
    );
}
