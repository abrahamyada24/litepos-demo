const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCheckoutTotals } = require('./checkoutTotalsService');
const { normalizeCustomerPhone, customerPhoneAliases } = require('./customerPhoneService');

test('diskon persen diterapkan sebelum pajak dan cocok dengan pembayaran', () => {
  assert.deepEqual(calculateCheckoutTotals({ subTotal: 325000, taxRate: 0.11, discountType: 'percent', discountAmount: 10 }), {
    discount: 32500, taxAmount: 32175, grandTotal: 324675,
  });
});
test('nominal diskon dibatasi subtotal dan tidak menghasilkan tagihan negatif', () => {
  assert.deepEqual(calculateCheckoutTotals({ subTotal: 50000, discountAmount: 100000, taxRate: 0.11 }), { discount: 50000, taxAmount: 0, grandTotal: 0 });
});
test('nilai diskon negatif, bukan angka, dan persen berlebih ditolak server', () => {
  for (const discountAmount of [-1, NaN, Infinity, 'abc']) assert.throws(() => calculateCheckoutTotals({ subTotal: 50000, discountAmount }), /Diskon/);
  assert.throws(() => calculateCheckoutTotals({ subTotal: 50000, discountAmount: 101, discountType: 'percent' }), /Diskon/);
});
test('nomor HP dinormalisasi dan format 08, 62, +62 dianggap nomor yang sama', () => {
  for (const value of ['081234567890', '+62 812-3456-7890', '6281234567890']) assert.equal(normalizeCustomerPhone(value), '+6281234567890');
  assert.deepEqual(customerPhoneAliases('+6281234567890'), ['+6281234567890', '6281234567890', '081234567890']);
  assert.equal(normalizeCustomerPhone(''), null);
  assert.equal(normalizeCustomerPhone('+14155552671'), '+14155552671');
});
test('huruf, simbol di tengah, nomor terlalu pendek dan terlalu panjang ditolak', () => {
  for (const value of ['nama', '0812abc12345', '081+23456789', '123', '+1234567890123456']) assert.throws(() => normalizeCustomerPhone(value), /Nomor HP/);
});
