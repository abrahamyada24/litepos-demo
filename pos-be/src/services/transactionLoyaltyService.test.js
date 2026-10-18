const test = require('node:test');
const assert = require('node:assert/strict');
const { earnedPointsFor, awardTransactionPoints, reverseTransactionPoints } = require('./transactionLoyaltyService');
const config = { isActive: true, multiplierAmount: 10000, pointMultiplier: 1 };
const fixture = (overrides = {}) => {
  const transaction = { id: 1, customerId: 2, status: 'PAID', grandTotal: 1000000, pointsEarned: null, loyaltyReversed: false, ...overrides };
  const customer = { id: 2, points: 50 };
  const tx = {
    loyaltyConfig: { findFirst: async () => config },
    transaction: {
      updateMany: async ({ where, data }) => {
        if ('pointsEarned' in where && transaction.pointsEarned !== where.pointsEarned) return { count: 0 };
        if ('loyaltyReversed' in where && transaction.loyaltyReversed !== where.loyaltyReversed) return { count: 0 };
        Object.assign(transaction, data); return { count: 1 };
      },
      update: async ({ data }) => Object.assign(transaction, data),
    },
    customer: {
      findUnique: async () => ({ ...customer }),
      updateMany: async ({ where, data }) => {
        if (typeof where.points === 'object' && customer.points < where.points.gte) return { count: 0 };
        if (typeof where.points === 'number' && customer.points !== where.points) return { count: 0 };
        customer.points = typeof data.points === 'number' ? data.points : customer.points + data.points.increment;
        return { count: 1 };
      },
    },
  };
  return { tx, transaction, customer };
};

test('Rp1 juta mendapat 100 poin; nilai di bawah ambang tidak dibulatkan naik', () => {
  assert.equal(earnedPointsFor(1000000, config), 100);
  assert.equal(earnedPointsFor(9999, config), 0);
  assert.equal(earnedPointsFor(1000000, { ...config, isActive: false }), 0);
  assert.equal(earnedPointsFor(1000000, { ...config, multiplierAmount: 0 }), 0);
});
test('checkout menyimpan snapshot saldo dan request ulang tidak menggandakan poin', async () => {
  const { tx, transaction, customer } = fixture();
  const snapshot = await awardTransactionPoints(tx, { ...transaction });
  assert.deepEqual(snapshot, { pointsEarned: 100, pointsRedeemed: 0, pointsBalanceAfter: 150 });
  assert.equal(await awardTransactionPoints(tx, { ...transaction, pointsEarned: null }), null);
  assert.equal(customer.points, 150);
  customer.points += 25; // transaksi berikutnya tidak boleh mengubah snapshot struk lama
  assert.equal(transaction.pointsBalanceAfter, 150);
});
test('pending dan pelanggan umum tidak mendapat poin; settlement mendapat poin sekali', async () => {
  const { tx, transaction, customer } = fixture({ status: 'PENDING' });
  assert.equal(await awardTransactionPoints(tx, transaction), null);
  assert.equal(await awardTransactionPoints(tx, { ...transaction, status: 'PAID', customerId: null }), null);
  assert.equal(customer.points, 50);
  assert.equal((await awardTransactionPoints(tx, { ...transaction, status: 'PAID' })).pointsEarned, 100);
});
test('penukaran dan retur memulihkan poin satu kali; snapshot asli tidak ditulis ulang', async () => {
  const { tx, transaction, customer } = fixture({ grandTotal: 90000 });
  assert.deepEqual(await awardTransactionPoints(tx, transaction, 10), { pointsEarned: 9, pointsRedeemed: 10, pointsBalanceAfter: 49 });
  await reverseTransactionPoints(tx, { ...transaction });
  await reverseTransactionPoints(tx, { ...transaction, loyaltyReversed: false });
  assert.equal(customer.points, 50);
  assert.equal(transaction.pointsBalanceAfter, 49);
  assert.equal(transaction.loyaltyReversed, true);
});
test('transaksi historis tanpa snapshot tidak mengubah poin ketika diretur', async () => {
  const { tx, transaction, customer } = fixture();
  await reverseTransactionPoints(tx, transaction);
  assert.equal(customer.points, 50);
});
