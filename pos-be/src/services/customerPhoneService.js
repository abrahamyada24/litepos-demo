// Nomor disimpan sebagai teks agar nol awal dan kode negara tidak hilang.
const normalizeCustomerPhone = (value) => {
  const phone = String(value ?? '').trim().replace(/[\s()-]/g, '');
  if (!phone) return null;
  if (!/^\+?\d{7,15}$/.test(phone)) {
    const error = new Error('Nomor HP harus berisi 7–15 angka, dengan + hanya di awal.');
    error.code = 'INVALID_PHONE';
    throw error;
  }
  if (phone.startsWith('0')) return `+62${phone.slice(1)}`;
  if (phone.startsWith('62')) return `+${phone}`;
  return phone;
};

const customerPhoneAliases = (phone) => {
  if (!phone) return [];
  return phone.startsWith('+62')
    ? [phone, phone.slice(1), `0${phone.slice(3)}`]
    : [phone];
};

module.exports = { normalizeCustomerPhone, customerPhoneAliases };
