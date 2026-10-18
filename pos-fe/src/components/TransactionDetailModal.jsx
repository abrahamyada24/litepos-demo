"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Package,
  Printer,
  RotateCcw,
  Share2,
  Store,
  User,
  X,
} from "lucide-react";
import {
  DEFAULT_DEVICE_PREFERENCES,
  getDevicePreferences,
  getPaperWidthMm,
} from "@/utils/devicePreferences";
import { useStore } from "@/store/useStore";
import { showAlert } from "@/utils/swal";
import { createReceiptImageBlob, downloadReceiptImage, getReceiptImageFilename, shareReceiptImage } from "@/utils/receiptImage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function TransactionDetailModal({
  isOpen,
  onClose,
  transaction,
  canReturn = false,
  isReturning = false,
  onReturn,
}) {
  const receiptRef = useRef(null);
  const [storeSettings, setStoreSettings] = useState(null);
  const [devicePreferences, setDevicePreferences] = useState(DEFAULT_DEVICE_PREFERENCES);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const license = useStore((state) => state.license);

  useEffect(() => {
    if (!isOpen) return;

    setDevicePreferences(getDevicePreferences());
    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/api/settings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
          cache: "no-store",
        });
        const payload = await response.json();
        if (!cancelled && payload.success && payload.data) setStoreSettings(payload.data);
      } catch (error) {
        console.error("Gagal memuat pengaturan untuk nota", error);
      }
    };

    fetchSettings();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen || !transaction) return null;

  const { items = [], payments = [], user, customer } = transaction;
  const formatRp = (value) =>
    `Rp ${(Number(value) || 0).toLocaleString("id-ID")}`;
  const formatNumber = (value) => (Number(value) || 0).toLocaleString("id-ID");
  const formatDate = (value) =>
    new Date(value).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const taxPct =
    Number(transaction.subTotal) > 0 && Number(transaction.taxAmount) > 0
      ? Math.round((Number(transaction.taxAmount) / Number(transaction.subTotal)) * 100)
      : 0;
  const storeName = storeSettings?.storeName || "WARNA WARNI BONEKA";
  const storeAddress = storeSettings?.address || "";
  const storePhone = storeSettings?.phone || "";
  const receiptFooter =
    storeSettings?.receiptFooter || "Terima kasih sudah berbelanja di Warna Warni Boneka";
  const storeLogo = storeSettings?.logoUrl
    ? storeSettings.logoUrl.startsWith("http")
      ? storeSettings.logoUrl
      : `${API_URL}${storeSettings.logoUrl}`
    : "";
  const paperWidthMm = getPaperWidthMm(devicePreferences);
  const logoMaxWidthMm = paperWidthMm === 80 ? 58 : 42;
  const paymentType = payments[0]?.paymentType || "TUNAI";
  const paymentAmount = Number(payments[0]?.amount || transaction.grandTotal);
  const changeAmount = Math.max(0, paymentAmount - Number(transaction.grandTotal || 0));
  const isReturned = transaction.status === "RETURNED";
  const orderLabel = transaction.orderType === "PRE_ORDER" ? "Pre-order" : "Penjualan toko";
  const showLitePosBranding = !(license?.isActive && license?.plan === "PREMIUM");

  const createHistoryReceiptImage = async () => {
    if (!receiptRef.current) throw new Error("Nota belum siap dibuat menjadi gambar.");
    return createReceiptImageBlob(receiptRef.current);
  };

  const handleDownloadImage = async () => {
    if (isExportingImage) return;
    setIsExportingImage(true);
    try {
      const filename = getReceiptImageFilename(transaction.invoiceNumber);
      const blob = await createHistoryReceiptImage();
      downloadReceiptImage(blob, filename);
      showAlert.success("Gambar Disimpan", `${filename} berhasil diunduh.`);
    } catch (error) {
      showAlert.error("Gagal Membuat Gambar", error?.message || "Nota belum dapat diunduh.");
    } finally {
      setIsExportingImage(false);
    }
  };

  const handleShareImage = async () => {
    if (isExportingImage) return;
    setIsExportingImage(true);
    try {
      const filename = getReceiptImageFilename(transaction.invoiceNumber);
      const blob = await createHistoryReceiptImage();
      const result = await shareReceiptImage({ blob, filename, title: `Struk ${transaction.invoiceNumber}`, text: `Struk transaksi ${storeName}` });
      if (result === "downloaded") await showAlert.info("Gambar Struk Diunduh", "Pilih gambar dari folder Download saat membuka WhatsApp.");
    } catch (error) {
      if (error?.name !== "AbortError") showAlert.error("Gagal Membagikan Gambar", error?.message || "Menu berbagi belum dapat dibuka.");
    } finally {
      setIsExportingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #history-receipt-print, #history-receipt-print * { visibility: visible !important; }
          #history-receipt-print {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidthMm}mm !important;
            padding: ${devicePreferences.printMarginMm}mm !important;
            box-sizing: border-box !important;
            background: #fff !important;
            color: #000 !important;
            font-family: "Courier New", monospace !important;
            line-height: 1.25 !important;
          }
          #history-receipt-print .receipt-logo {
            display: block !important;
            width: 100% !important;
            height: 16mm !important;
            max-width: ${logoMaxWidthMm}mm !important;
            margin: 0 auto 3mm !important;
            object-fit: contain !important;
            object-position: center !important;
          }
          .no-print { display: none !important; }
          @page { size: ${paperWidthMm}mm auto; margin: 0; }
        }
      `}</style>

      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="no-print flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-100 p-2.5 text-orange-600">
              <FileText size={19} />
            </div>
            <div>
              <h3 className="font-black text-gray-900">Detail Transaksi</h3>
              <p className="font-mono text-[10px] font-bold uppercase text-gray-400">
                {transaction.invoiceNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail transaksi"
            className="rounded-full bg-white p-2 text-gray-400 shadow-sm hover:text-gray-700"
          >
            <X size={19} />
          </button>
        </div>

        <div className="no-print space-y-5 overflow-y-auto p-5">
          <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-orange-800">
              <Calendar size={16} /> {formatDate(transaction.createdAt)}
            </div>
            <span
              className={`rounded-lg border px-3 py-1 text-[10px] font-black tracking-wider ${
                isReturned
                  ? "border-red-200 bg-red-100 text-red-700"
                  : transaction.status === "PAID"
                    ? "border-green-200 bg-green-100 text-green-700"
                    : "border-gray-200 bg-gray-100 text-gray-600"
              }`}
            >
              {transaction.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase text-gray-400">Kasir</p>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                <User size={13} /> {user?.name || "Kasir"}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase text-gray-400">Pelanggan</p>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                <User size={13} /> {transaction.customerName || customer?.name || "Umum"}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-3">
            <p className="mb-1 text-[10px] font-bold uppercase text-gray-400">Jenis transaksi</p>
            <div className="flex items-center gap-2 text-xs font-bold text-orange-700">
              <Package size={14} /> {orderLabel}
            </div>
            {transaction.preOrderDate && (
              <p className="mt-1 text-xs text-gray-500">
                Pengambilan: {formatDate(transaction.preOrderDate)}
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Produk
            </p>
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-3 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item, index) => (
                    <tr key={`${item.productId || index}-${index}`}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-bold text-gray-800">
                          {item.product?.name || item.name || "Produk"}
                        </p>
                        <p className="text-[10px] text-gray-400">@ {formatRp(item.price)}</p>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-bold">{item.qty}</td>
                      <td className="px-4 py-3 text-right text-xs font-black">
                        {formatRp(Number(item.price) * Number(item.qty))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gray-950 p-5 text-white shadow-xl">
            <Store className="absolute -right-3 -top-3 opacity-5" size={92} />
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <span>Metode pembayaran</span>
              <span className="flex items-center gap-1 text-orange-400">
                <CreditCard size={12} /> {paymentType}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-gray-400">Subtotal</span><span>{formatRp(transaction.subTotal)}</span></div>
              {Number(transaction.discountAmount) > 0 && (
                <div className="flex justify-between text-red-300"><span>Diskon</span><span>-{formatRp(transaction.discountAmount)}</span></div>
              )}
              {taxPct > 0 && (
                <div className="flex justify-between"><span className="text-gray-400">Pajak ({taxPct}%)</span><span>{formatRp(transaction.taxAmount)}</span></div>
              )}
              <div className="flex items-end justify-between border-t border-white/10 pt-3">
                <span className="font-black uppercase text-orange-400">Total</span>
                <span className="text-2xl font-black">{formatRp(transaction.grandTotal)}</span>
              </div>
              {paymentType === "CASH" && changeAmount > 0 && (
                <div className="flex justify-between border-t border-white/10 pt-2 text-green-300"><span>Kembali</span><span>{formatRp(changeAmount)}</span></div>
              )}
            </div>
          </div>
        </div>

        <div
          id="history-receipt-print"
          data-print-surface
          ref={receiptRef}
          aria-hidden="true"
          className="fixed -left-[10000px] top-0 block bg-white font-mono text-[10px] text-black"
          style={{ width: `${paperWidthMm}mm`, padding: `${devicePreferences.printMarginMm}mm`, boxSizing: "border-box", lineHeight: 1.25 }}
        >
          <div style={{ textAlign: "center", marginBottom: "12px" }}>
            {storeLogo && (
              <img
                className="receipt-logo"
                src={storeLogo}
                alt="Logo toko"
                style={{
                  display: "block",
                  width: "100%",
                  height: "16mm",
                  maxWidth: `${logoMaxWidthMm}mm`,
                  margin: "0 auto 3mm",
                  objectFit: "contain",
                  objectPosition: "center",
                }}
              />
            )}
            <div style={{ fontSize: "14px", fontWeight: 900 }}>{storeName.toUpperCase()}</div>
            {storeAddress && <div>{storeAddress}</div>}
            {storePhone && <div>Telp: {storePhone}</div>}
          </div>

          <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div>No: {transaction.invoiceNumber}</div>
          <div>{formatDate(transaction.createdAt)}</div>
          <div>Kasir: {user?.name || "Kasir"}</div>
          <div>Pelanggan: {transaction.customerName || customer?.name || "Umum"}</div>
          <div>Jenis: {orderLabel}</div>

          <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          {items.map((item, index) => (
            <div key={`${item.productId || index}-print`} style={{ marginBottom: "7px" }}>
              <div style={{ fontWeight: 700, textTransform: "uppercase" }}>
                {item.product?.name || item.name || "Produk"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <span>{item.qty} x {formatNumber(item.price)}</span>
                <span>{formatNumber(Number(item.price) * Number(item.qty))}</span>
              </div>
              {item.notes && <div style={{ fontSize: "9px", fontStyle: "italic" }}>CATATAN: {item.notes}</div>}
            </div>
          ))}

          <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>SUBTOTAL</span><span>{formatNumber(transaction.subTotal)}</span></div>
          {Number(transaction.discountAmount) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>DISKON</span><span>-{formatNumber(transaction.discountAmount)}</span></div>
          )}
          {Number(transaction.taxAmount) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>PAJAK</span><span>{formatNumber(transaction.taxAmount)}</span></div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #000", marginTop: "5px", paddingTop: "5px", fontSize: "13px", fontWeight: 900 }}><span>TOTAL</span><span>{formatNumber(transaction.grandTotal)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>BAYAR ({paymentType})</span><span>{formatNumber(paymentAmount)}</span></div>
          {paymentType === "CASH" && changeAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>KEMBALI</span><span>{formatNumber(changeAmount)}</span></div>
          )}

          <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div style={{ whiteSpace: "pre-wrap", textAlign: "center" }}>{receiptFooter}</div>
          {showLitePosBranding && (
            <div style={{ marginTop: "6px", textAlign: "center", fontSize: "8px" }}>
              Powered by LitePOS
            </div>
          )}
        </div>

        <div className="no-print flex flex-wrap gap-2 border-t border-gray-100 bg-gray-50 p-4">
          {canReturn && !isReturned && (
            <button
              type="button"
              disabled={isReturning}
              onClick={onReturn}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 text-xs font-black text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {isReturning ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              Retur Transaksi
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-11 rounded-xl bg-gray-100 px-4 text-xs font-black text-gray-600 hover:bg-gray-200"
          >
            Tutup
          </button>
          <button
            type="button"
            disabled={isExportingImage}
            onClick={handleDownloadImage}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-xs font-black text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {isExportingImage ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} PNG
          </button>
          <button
            type="button"
            disabled={isExportingImage}
            onClick={handleShareImage}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isExportingImage ? <Loader2 className="animate-spin" size={16} /> : <Share2 size={16} />} Bagikan
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 text-xs font-black text-white hover:bg-orange-600"
          >
            <Printer size={16} /> Cetak Nota
          </button>
        </div>
      </div>
    </div>
  );
}
