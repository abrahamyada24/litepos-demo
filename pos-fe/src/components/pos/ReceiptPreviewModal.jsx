"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Printer, Share2, X } from 'lucide-react';
import { DEFAULT_DEVICE_PREFERENCES, getDevicePreferences, getPaperWidthMm } from '@/utils/devicePreferences';
import { useStore } from '@/store/useStore';
import { showAlert } from '@/utils/swal';
import { createReceiptImageBlob, downloadReceiptImage, getReceiptImageFilename, shareReceiptImage } from '@/utils/receiptImage';

export default function ReceiptPreviewModal({ isOpen, onClose, transaction, store, formatNumber }) {
    const receiptRef = useRef(null);
    const imageGenerationRef = useRef(0);
    const [devicePreferences, setDevicePreferences] = useState(DEFAULT_DEVICE_PREFERENCES);
    const [receiptImageBlob, setReceiptImageBlob] = useState(null);
    const [receiptImageError, setReceiptImageError] = useState('');
    const [isPreparingImage, setIsPreparingImage] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const license = useStore((state) => state.license);

    const prepareReceiptImage = useCallback(async () => {
        const node = receiptRef.current;
        if (!node) throw new Error('Preview struk belum siap.');
        const generation = ++imageGenerationRef.current;
        setIsPreparingImage(true);
        setReceiptImageError('');
        try {
            const blob = await createReceiptImageBlob(node);
            if (imageGenerationRef.current === generation) setReceiptImageBlob(blob);
            return blob;
        } catch (error) {
            if (imageGenerationRef.current === generation) {
                setReceiptImageBlob(null);
                setReceiptImageError(error?.message || 'Gambar struk belum dapat disiapkan.');
            }
            throw error;
        } finally {
            if (imageGenerationRef.current === generation) setIsPreparingImage(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) setDevicePreferences(getDevicePreferences());
    }, [isOpen]);

    useEffect(() => {
        imageGenerationRef.current += 1;
        setReceiptImageBlob(null);
        setReceiptImageError('');
        setIsPreparingImage(false);
        if (!isOpen || !transaction) return undefined;
        const timer = window.setTimeout(() => prepareReceiptImage().catch(() => undefined), 150);
        return () => {
            window.clearTimeout(timer);
            imageGenerationRef.current += 1;
        };
    }, [devicePreferences, isOpen, prepareReceiptImage, store, transaction]);

    if (!isOpen || !transaction) return null;

    const numberFormat = (value) => {
        const numericValue = Number(value) || 0;
        return formatNumber ? formatNumber(numericValue) : numericValue.toLocaleString('id-ID');
    };

    const formatDate = (dateString) => new Date(dateString).toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    const paperWidthMm = getPaperWidthMm(devicePreferences);
    const logoMaxWidthMm = paperWidthMm === 80 ? 58 : 42;
    const showLitePosBranding = !(license?.isActive && license?.plan === 'PREMIUM');
    const receiptImageFilename = getReceiptImageFilename(transaction.invoiceNumber);

    const handleDownloadImage = async () => {
        try {
            const blob = receiptImageBlob || await prepareReceiptImage();
            downloadReceiptImage(blob, receiptImageFilename);
            showAlert.success('Gambar Disimpan', `${receiptImageFilename} berhasil diunduh.`);
        } catch (error) {
            showAlert.error('Gagal Membuat Gambar', error?.message || 'Struk belum dapat diunduh.');
        }
    };

    const handleShareImage = async () => {
        if (!receiptImageBlob || isSharing) return;
        setIsSharing(true);
        try {
            const result = await shareReceiptImage({
                blob: receiptImageBlob,
                filename: receiptImageFilename,
                title: `Struk ${transaction.invoiceNumber || ''}`.trim(),
                text: `Struk transaksi ${store?.storeName || 'Warna Warni Boneka'}`,
            });
            if (result === 'downloaded') {
                await showAlert.info('Gambar Struk Diunduh', 'Pilih gambar dari folder Download saat membuka WhatsApp.');
            }
        } catch (error) {
            if (error?.name !== 'AbortError') showAlert.error('Gagal Membagikan Gambar', error?.message || 'Menu berbagi belum dapat dibuka.');
        } finally {
            setIsSharing(false);
        }
    };

    const handlePrint = async () => {
        if (typeof window === 'undefined') return;

        if (window.electronAPI?.printReceipt && receiptRef.current) {
            const html = `<!doctype html><html><head><meta charset="utf-8"><style>
                @page { size: ${paperWidthMm}mm auto; margin: 0; }
                body { width: ${paperWidthMm}mm; margin: 0; padding: ${devicePreferences.printMarginMm}mm; box-sizing: border-box; font-family: monospace; color: #000; }
                .receipt-logo { display: block; width: 100%; height: 16mm; max-width: ${logoMaxWidthMm}mm; margin: 0 auto 2mm; object-fit: contain; object-position: center; }
            </style></head><body>${receiptRef.current.innerHTML}</body></html>`;
            try {
                await window.electronAPI.printReceipt(html);
            } catch (error) {
                window.alert(error?.message || 'Gagal mencetak nota. Periksa printer default Windows.');
            }
            return;
        }

        window.print();
    };

    const paymentType = transaction.payments?.[0]?.paymentType || 'CASH';
    const paidAmount = transaction.cashAmount ?? transaction.payments?.[0]?.amount ?? transaction.grandTotal;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <style jsx global>{`
                @media print {
                    @page { size: ${paperWidthMm}mm auto; margin: 0; }
                    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                    body * { visibility: hidden !important; }
                    #pos-receipt-print, #pos-receipt-print * { visibility: visible !important; }
                    #pos-receipt-print {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: ${paperWidthMm}mm !important;
                        padding: ${devicePreferences.printMarginMm}mm !important;
                        box-sizing: border-box !important;
                        box-shadow: none !important;
                        color: #000 !important;
                        background: #fff !important;
                    }
                    #pos-receipt-print .receipt-logo {
                        display: block !important;
                        width: 100% !important;
                        height: 16mm !important;
                        max-width: ${logoMaxWidthMm}mm !important;
                        margin: 0 auto 2mm !important;
                        object-fit: contain !important;
                        object-position: center !important;
                    }
                }
            `}</style>

            <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <div>
                        <h2 className="font-bold text-gray-900">Preview Struk {paperWidthMm} mm</h2>
                        <p className="text-[11px] text-gray-400">Pilih kertas {paperWidthMm} mm pada dialog printer.</p>
                    </div>
                    <button aria-label="Tutup preview struk" onClick={onClose} className="rounded-full bg-gray-100 p-2 text-gray-500 hover:bg-gray-200">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-100 p-5">
                    <div
                        id="pos-receipt-print"
                        data-print-surface
                        ref={receiptRef}
                        className="mx-auto bg-white font-mono text-[10px] leading-tight text-black shadow-md"
                        style={{
                            overflowWrap: 'anywhere',
                            width: `${paperWidthMm}mm`,
                            padding: `${devicePreferences.printMarginMm}mm`,
                            boxSizing: 'border-box',
                        }}
                    >
                        <div className="mb-3 text-center">
                            {store?.logoUrl && (
                                <img
                                    src={store.logoUrl.startsWith('http') ? store.logoUrl : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}${store.logoUrl}`}
                                    alt="Logo toko"
                                    className="receipt-logo grayscale"
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        height: '16mm',
                                        maxWidth: `${logoMaxWidthMm}mm`,
                                        margin: '0 auto 2mm',
                                        objectFit: 'contain',
                                        objectPosition: 'center',
                                    }}
                                />
                            )}
                            <div className="text-[14px] font-black uppercase">{store?.storeName || 'LITEPOS'}</div>
                            {store?.address && <div className="mt-1 whitespace-pre-wrap">{store.address}</div>}
                            {store?.phone && <div>Telp: {store.phone}</div>}
                        </div>

                        <div className="my-2 border-t border-dashed border-black" />
                        <div className="space-y-0.5">
                            <div>No: {transaction.invoiceNumber}</div>
                            <div>{formatDate(transaction.createdAt)}</div>
                            <div>Kasir: {transaction.user?.name || 'Kasir'}</div>
                            <div>Pelanggan: {transaction.customerName || transaction.customer?.name || 'Umum'}</div>
                            <div>Jenis: {transaction.orderType === 'PRE_ORDER' ? 'Pre-order' : 'Penjualan toko'}</div>
                        </div>

                        <div className="my-2 border-t border-dashed border-black" />
                        <div className="space-y-2">
                            {transaction.items?.map((item, index) => (
                                <div key={`${item.productId || index}-${index}`}>
                                    <div className="font-bold uppercase">{item.product?.name || item.name || 'Produk'}</div>
                                    <div className="flex justify-between gap-2">
                                        <span>{item.qty || item.quantity} x {numberFormat(item.price)}</span>
                                        <span>{numberFormat(Number(item.price) * Number(item.qty || item.quantity))}</span>
                                    </div>
                                    {item.notes && <div className="italic">Catatan: {item.notes}</div>}
                                </div>
                            ))}
                        </div>

                        <div className="my-2 border-t border-dashed border-black" />
                        <div className="space-y-0.5">
                            <div className="flex justify-between"><span>Subtotal</span><span>{numberFormat(transaction.subTotal)}</span></div>
                            {Number(transaction.discountAmount) > 0 && (
                                <div className="flex justify-between"><span>Diskon</span><span>-{numberFormat(transaction.discountAmount)}</span></div>
                            )}
                            {Number(transaction.taxAmount) > 0 && (
                                <div className="flex justify-between"><span>Pajak</span><span>{numberFormat(transaction.taxAmount)}</span></div>
                            )}
                            <div className="mt-1 flex justify-between border-t border-black pt-1 text-[12px] font-black">
                                <span>TOTAL</span><span>{numberFormat(transaction.grandTotal)}</span>
                            </div>
                            <div className="flex justify-between"><span>Bayar ({paymentType})</span><span>{numberFormat(paidAmount)}</span></div>
                            {Number(transaction.changeAmount) > 0 && (
                                <div className="flex justify-between font-bold"><span>Kembali</span><span>{numberFormat(transaction.changeAmount)}</span></div>
                            )}
                        </div>

                        <div className="my-2 border-t border-dashed border-black" />
                        <div className="whitespace-pre-wrap text-center">
                            {transaction.customerId && transaction.pointsBalanceAfter != null && (
                                <div className="mb-2 space-y-0.5 text-left">
                                    <div className="flex justify-between"><span>Poin didapat</span><span>+{numberFormat(transaction.pointsEarned)}</span></div>
                                    <div className="flex justify-between"><span>Poin ditukar</span><span>{numberFormat(transaction.pointsRedeemed)}</span></div>
                                    <div className="flex justify-between font-bold"><span>Saldo poin setelah transaksi</span><span>{numberFormat(transaction.pointsBalanceAfter)}</span></div>
                                    {transaction.loyaltyReversed && <div>Poin transaksi sudah dibatalkan/ diretur.</div>}
                                </div>
                            )}
                            {store?.receiptFooter || 'Terima kasih atas kunjungan Anda'}
                        </div>
                        {showLitePosBranding && (
                            <div className="mt-2 text-center text-[8px]">Powered by LitePOS</div>
                        )}
                    </div>
                </div>

                <div className="border-t border-gray-100 p-4">
                    {receiptImageError && (
                        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-[11px] font-medium text-amber-700">
                            Gambar belum siap. Tekan Unduh untuk mencoba lagi.
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button onClick={onClose} className="rounded-xl bg-gray-100 px-3 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200">
                        Tutup
                    </button>
                    <button onClick={handleDownloadImage} disabled={isPreparingImage} className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50">
                        {isPreparingImage ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                        {isPreparingImage ? 'Menyiapkan' : 'Unduh PNG'}
                    </button>
                    <button onClick={handleShareImage} disabled={!receiptImageBlob || isPreparingImage || isSharing} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50">
                        {isSharing ? <Loader2 size={17} className="animate-spin" /> : <Share2 size={17} />}
                        {isSharing ? 'Membuka' : 'Bagikan WA'}
                    </button>
                    <button onClick={handlePrint} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white hover:bg-blue-700">
                        <Printer size={17} /> Cetak Struk
                    </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
