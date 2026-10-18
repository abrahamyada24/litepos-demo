import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { calculateCheckoutTotals } from '../src/utils/checkoutTotals.js';
import { validatePhoneInput, restrictPhoneInput } from '../src/utils/phone.js';
import { buildReportExport } from '../src/utils/reportExport.js';
const require = createRequire(import.meta.url);
const backend = require('../../pos-be/src/services/checkoutTotalsService');

test('tagihan frontend dan server sama untuk diskon nominal/persen dan pajak', () => {
  for (const subTotal of [0, 325000, 99999]) for (const discountType of ['amount', 'percent']) for (const taxRate of [0, 0.11]) {
    const input = { subTotal, discountType, discountAmount: 10, taxRate };
    assert.deepEqual(calculateCheckoutTotals(input), backend.calculateCheckoutTotals(input));
  }
});
test('input telepon menjaga nol awal, menolak huruf dan memvalidasi panjang', () => {
  assert.equal(restrictPhoneInput('0812abc3456789'), '08123456789');
  assert.equal(restrictPhoneInput('+62 (812) 345-6789'), '+628123456789');
  assert.equal(validatePhoneInput('08123456789'), '');
  assert.notEqual(validatePhoneInput('nama'), '');
});
test('ekspor laporan menampilkan nilai kategori pengeluaran dari respons API', () => {
  const report = buildReportExport('LABARUGI', { profitLossData: { grossRevenue: 500000, cogs: 130000, totalExpenses: 2500000, netProfit: -2130000, expenseBreakdown: [{ category: 'Gaji', amount: 2500000 }] } });
  const total = report.rows.find(row => row.component === 'Pengeluaran');
  const category = report.rows.find(row => row.component === 'Rincian pengeluaran: Gaji');
  assert.equal(category.amount, -2500000);
  assert.equal(category.amount, total.amount);
});
