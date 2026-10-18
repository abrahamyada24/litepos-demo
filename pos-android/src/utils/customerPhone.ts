export const restrictPhoneInput = (value: string): string => {
    const text = String(value || '').replace(/[\s()-]/g, '');
    return `${text.startsWith('+') ? '+' : ''}${text.replace(/\D/g, '')}`.slice(0, text.startsWith('+') ? 16 : 15);
};

export const normalizeCustomerPhone = (value: string): string | null => {
    const phone = String(value || '').trim().replace(/[\s()-]/g, '');
    if (!phone) return null;
    if (!/^\+?\d{7,15}$/.test(phone)) throw new Error('Nomor HP harus berisi 7–15 angka, dengan + hanya di awal.');
    if (phone.startsWith('0')) return `+62${phone.slice(1)}`;
    if (phone.startsWith('62')) return `+${phone}`;
    return phone;
};

export const customerPhoneAliases = (phone: string | null): string[] => !phone ? [] : phone.startsWith('+62')
    ? [phone, phone.slice(1), `0${phone.slice(3)}`]
    : [phone];
