"use client";

import { useState } from 'react';
import { ArrowLeft, LogOut, X, UserPlus, ShoppingCart, Minus, Plus, User, Package, Tag, Save, ShoppingBag, MessageSquare, Loader2, ChevronRight } from 'lucide-react';
import { showAlert } from '@/utils/swal';

export default function CartSidebar({ 
    cart, 
    mobileView, 
    setMobileView, 
    selectedMember, 
    setSelectedMember, 
    guestCustomerName,
    setGuestCustomerName,
    setIsMemberModalOpen, 
    removeFromCart, 
    updateQty, 
    handlePaymentOpen, 
    setCart,
    handleLogout,
    getImageUrl,
    grandTotal,
    subTotal,
    taxAmount,
    orderType,
    setOrderType,
    preOrderDate,
    setPreOrderDate,
    taxRate,
    // New props for enhanced features
    discount,
    onOpenDiscountModal,
    onRemoveDiscount,
    onSaveTransaction,
    isSavingTransaction,
    savedTransactionCount,
    onOpenSavedTransactions,
    onUpdateItemNotes,
    onEditItemAddons
}) {
  const [editingNoteId, setEditingNoteId] = useState(null);
  const clearCart = async () => {
    const confirmed = await showAlert.confirmDanger(
      'Kosongkan pesanan?',
      'Semua item yang sedang dipilih akan dihapus dari keranjang.',
      'Ya, Kosongkan'
    );
    if (confirmed) setCart([]);
  };
  return (
    <div className={`w-full lg:w-[400px] bg-white border-l border-gray-100 flex-col shadow-2xl z-30 relative ${mobileView === 'menu' ? 'hidden lg:flex' : 'flex fixed inset-0 lg:static h-full'}`}>
        
        {/* Cart Header */}
        <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center bg-white flex-shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={() => setMobileView('menu')} className="lg:hidden p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 active:scale-95 transition-transform">
                    <ArrowLeft size={20} />
                </button>
                <h2 className="font-bold text-lg text-gray-800">Pesanan</h2>
            </div>
            
            <div className="flex items-center gap-3">
                {/* Saved Transactions Badge */}
                {savedTransactionCount > 0 && (
                    <button 
                        onClick={onOpenSavedTransactions}
                        className="relative p-2 text-gray-400 hover:text-blue-500 transition-colors"
                        title="Transaksi Tersimpan"
                    >
                        <ShoppingBag size={18} />
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                            {savedTransactionCount}
                        </span>
                    </button>
                )}
                {/* Logout Mobile */}
                <button onClick={handleLogout} className="lg:hidden text-gray-400 hover:text-red-500">
                    <LogOut size={18}/>
                </button>
                {cart.length > 0 && (
                    <button onClick={clearCart} className="text-sm text-red-500 font-bold hover:text-red-600 transition-colors">
                        Hapus
                    </button>
                )}
            </div>
        </div>

        {/* Customer Selection Area */}
        <div className="px-6 py-2 border-b border-gray-50 space-y-3">
            {selectedMember ? (
                <div className="flex items-center justify-between text-sm bg-blue-50 text-blue-700 px-3 py-2 rounded-lg border border-blue-100">
                    <span className="font-bold"><span className="flex items-center gap-2"><User size={14}/> {selectedMember.name}</span><span className="mt-1 block text-xs font-medium">Saldo: {Number(selectedMember.points || 0).toLocaleString('id-ID')} poin</span></span>
                    <button onClick={()=>setSelectedMember(null)}><X size={14}/></button>
                </div>
            ) : (
                <div className="space-y-2">
                    <label htmlFor="guest-customer-name" className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Nama pelanggan di nota (opsional)
                    </label>
                    <input
                        id="guest-customer-name"
                        type="text"
                        maxLength={100}
                        value={guestCustomerName}
                        onChange={(event) => setGuestCustomerName(event.target.value)}
                        placeholder="Contoh: Pak Budi"
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
                    />
                    <button onClick={() => setIsMemberModalOpen(true)} className="text-xs flex items-center gap-1 text-gray-500 hover:text-blue-500 transition-colors w-full justify-center py-2 border border-dashed rounded-lg border-gray-200 hover:border-blue-200">
                        <UserPlus size={14}/> Pilih dari daftar member
                    </button>
                </div>
            )}

            {/* Retail transaction type */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                    onClick={() => setOrderType('TAKE_AWAY')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${orderType === 'TAKE_AWAY' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                >
                    Penjualan
                </button>
                <button 
                    onClick={() => setOrderType('PRE_ORDER')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${orderType === 'PRE_ORDER' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                >
                    Pre Order
                </button>
            </div>

            {/* Pre Order Date Input (Only if Pre Order) */}
            {orderType === 'PRE_ORDER' && (
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-600">Waktu Pengambilan</label>
                    <input 
                        type="datetime-local" 
                        value={preOrderDate}
                        onChange={(e) => setPreOrderDate(e.target.value)}
                        className="w-full text-sm bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300 transition-colors text-gray-800"
                    />
                </div>
            )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
            {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50 space-y-4">
                    <ShoppingCart size={64} strokeWidth={1} />
                    <p className="font-medium">Keranjang kosong</p>
                </div>
            ) : (
                cart.map(item => (
                    <div key={item.id} className="flex gap-4 p-3 rounded-2xl border border-gray-100 bg-white hover:border-blue-100 transition-colors relative group">
                        {/* Image */}
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
                            {item.imageUrl ? (
                                <img src={getImageUrl(item.imageUrl)} className="w-full h-full object-cover" alt={item.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={24}/></div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                            <div>
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-gray-800 text-sm line-clamp-2 leading-snug pr-6">{item.name}</h3>
                                    <button 
                                        onClick={() => removeFromCart(item.id)} 
                                        className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{item.category ? item.category.name : 'Produk'}</p>
                            </div>
                            
                            <div className="flex justify-between items-end mt-2">
                                <p className="text-blue-600 font-bold text-sm">Rp {Number(item.price).toLocaleString('id-ID')}</p>
                                
                                {/* Qty Control */}
                                <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-2 py-1 border border-gray-100">
                                    <button onClick={() => updateQty(item.id, -1)} className="text-gray-500 hover:text-blue-600 transition-colors"><Minus size={14} /></button>
                                    <span className="text-sm font-bold min-w-8 text-center text-gray-800">
                                        {item.qty}{item.unitLabel && item.unitLabel !== 'item' ? ` ${item.unitLabel}` : ''}
                                    </span>
                                    <button onClick={() => updateQty(item.id, 1)} className="text-gray-500 hover:text-blue-600 transition-colors"><Plus size={14} /></button>
                                </div>
                            </div>

                            {item.addons?.length > 0 && (
                                <div className="mt-2 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-2 text-[10px] text-orange-800">
                                    <p className="font-black uppercase tracking-wide">Opsi tambahan</p>
                                    {item.addons.map(addon => (
                                        <div key={addon.id} className="mt-1 flex justify-between gap-2">
                                            <span className="truncate">{addon.name}{Number(addon.quantity || 1) > 1 ? ` ×${Number(addon.quantity)}` : ''}</span>
                                            <span className="shrink-0 font-bold">+ Rp {(Number(addon.price || 0) * Number(addon.quantity || 1)).toLocaleString('id-ID')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {item.hasAvailableAddons && (
                                <button type="button" onClick={() => onEditItemAddons?.(item)} className="mt-2 flex items-center gap-1 text-[10px] font-bold text-orange-700 hover:text-orange-800">
                                    <Plus size={11} /> Ubah opsi
                                </button>
                            )}

                            {/* Per-item Notes */}
                            {editingNoteId === item.id ? (
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Catatan item..."
                                    defaultValue={item.customerNotes ?? item.notes ?? ''}
                                    onBlur={(e) => {
                                        onUpdateItemNotes && onUpdateItemNotes(item.id, e.target.value);
                                        setEditingNoteId(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            onUpdateItemNotes && onUpdateItemNotes(item.id, e.target.value);
                                            setEditingNoteId(null);
                                        }
                                    }}
                                    className="w-full mt-2 text-[11px] px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-300 text-gray-600 transition-colors"
                                />
                            ) : (
                                <button
                                    onClick={() => setEditingNoteId(item.id)}
                                    className="flex items-center gap-1 mt-2 text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
                                >
                                    <MessageSquare size={10} />
                                    {item.customerNotes || (!item.addons?.length && item.notes) ? <span className="text-blue-500 italic">{item.customerNotes || item.notes}</span> : 'Tambah catatan'}
                                </button>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>

        {/* Footer Summary */}
        <div className="bg-gray-50 p-6 rounded-t-3xl border-t border-gray-100 mt-auto shadow-[0_-5px_30px_rgba(0,0,0,0.02)]">
            <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span className="font-medium text-gray-900">Rp {subTotal.toLocaleString('id-ID')}</span>
                </div>

                {/* Discount Section */}
                {discount && discount.amount > 0 ? (
                    <div className="flex justify-between text-sm items-center">
                        <div className="flex items-center gap-1.5">
                            <Tag size={12} className="text-orange-500" />
                            <span className="text-orange-600 font-medium">
                                Diskon {discount.type === 'percent' ? `(${discount.value}%)` : ''}
                            </span>
                            <button 
                                onClick={onRemoveDiscount}
                                className="text-gray-300 hover:text-red-500 transition-colors ml-1"
                            >
                                <X size={12} />
                            </button>
                        </div>
                        <span className="font-medium text-orange-600">- Rp {discount.amount.toLocaleString('id-ID')}</span>
                    </div>
                ) : (
                    <button
                        onClick={onOpenDiscountModal}
                        disabled={cart.length === 0}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Tag size={12} /> Tambah Diskon
                    </button>
                )}

                <div className="flex justify-between text-sm text-gray-500">
                    <span>Pajak ({taxRate * 100}%)</span>
                    <span className="font-medium text-gray-900">Rp {taxAmount.toLocaleString('id-ID')}</span>
                </div>
                <div className="border-t border-dashed border-gray-200 pt-3 flex justify-between items-center">
                    <span className="text-gray-900 font-bold text-lg">Total Tagihan</span>
                    <span className="text-2xl font-black text-gray-900">Rp {grandTotal.toLocaleString('id-ID')}</span>
                </div>
            </div>
            
            <div className="flex gap-2">
                {/* Save Transaction Button */}
                <button 
                    disabled={cart.length === 0 || isSavingTransaction}
                    onClick={onSaveTransaction}
                    className="py-4 px-4 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 hover:border-gray-300 disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    title="Simpan Pesanan"
                >
                    {isSavingTransaction ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {isSavingTransaction ? 'Menyimpan' : 'Simpan'}
                </button>
                
                {/* Payment Button */}
                <button 
                    disabled={cart.length === 0}
                    onClick={handlePaymentOpen}
                    className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-bold text-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-xl shadow-gray-200 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                    Pembayaran <ChevronRight size={20} />
                </button>
            </div>
        </div>
    </div>
  );
}
