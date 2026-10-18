export const restrictPhoneInput = (value) => {
  const text = String(value || '').replace(/[\s()-]/g, '');
  return `${text.startsWith('+') ? '+' : ''}${text.replace(/\D/g, '')}`.slice(0, text.startsWith('+') ? 16 : 15);
};

export const validatePhoneInput = (value) => !value || /^\+?\d{7,15}$/.test(value)
  ? ''
  : 'Nomor HP harus berisi 7–15 angka, dengan + hanya di awal.';
