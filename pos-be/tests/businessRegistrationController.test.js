const test = require('node:test');
const assert = require('node:assert/strict');
let scenario;
const db = new Proxy({}, { get: (_, key) => scenario[key] });
const prismaPath = require.resolve('../src/config/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { basePrisma: db, prisma: db } };
process.env.JWT_SECRET = 'test-only-registration-secret-not-used-in-production';
const { registerBusiness } = require('../src/controllers/authController');

const request = (email, username = '') => ({
  body: { ownerName: 'Owner test', businessName: 'Usaha test', email, username, password: 'Test-Only-Password-123', businessType: 'RETAIL' },
  ip: '127.0.0.1', get: () => 'test-agent',
});
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, cookie() {}, json(body) { this.body = body; return this; } });
const setup = () => {
  let store; let owner; let options; let sessionInsideTransaction = false; let inTransaction = false;
  const tx = {
    user: { findFirst: async () => null, create: async ({ data }) => (owner = { id: 1, ...data }) },
    store: { create: async ({ data }) => (store = { id: 2, ...data }) },
    storeMembership: { create: async () => ({}), findMany: async () => [{ store, storeId: store.id, role: 'OWNER' }] },
    storeSetting: { create: async () => ({}) }, loyaltyConfig: { create: async () => ({}) },
    storeLicense: { create: async () => ({}) }, category: { create: async () => ({}) },
    authSession: { create: async ({ data }) => { sessionInsideTransaction = inTransaction; return data; } },
  };
  scenario = {
    user: { findFirst: async () => null }, store: { findUnique: async () => null },
    $transaction: async (work, config) => { options = config; inTransaction = true; try { return await work(tx); } finally { inTransaction = false; } },
  };
  return { tx, inspect: () => ({ owner, options, sessionInsideTransaction }) };
};

test('email owner dengan titik diterima utuh; sesi pertama berada dalam transaksi pendaftaran', async () => {
  const fixture = setup(); const res = response();
  await registerBusiness(request('  nama.usaha@gmail.com  ', 'owner.test'), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.email, 'nama.usaha@gmail.com');
  assert.equal(res.body.user.username, 'owner.test');
  assert.equal(fixture.inspect().sessionInsideTransaction, true);
  assert.equal(fixture.inspect().options.timeout, 20000);
});
test('email bertitik juga berhasil ketika username dibuat otomatis', async () => {
  setup(); const res = response();
  await registerBusiness(request('nama.depan+usaha@gmail.com'), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.email, 'nama.depan+usaha@gmail.com');
  assert.match(res.body.user.username, /^nama\.depan/);
});
test('benturan username dibedakan dari email terdaftar', async () => {
  setup(); scenario.user.findFirst = async () => ({ id: 3, email: 'another@example.com', username: 'admin' });
  const res = response(); await registerBusiness(request('nama.depan@gmail.com', 'admin'), res);
  assert.equal(res.statusCode, 409); assert.match(res.body.message, /Username/);
});
test('timeout database menghasilkan respons coba lagi, tanpa menyalahkan format email', async () => {
  setup(); scenario.$transaction = async () => { throw Object.assign(new Error('private diagnostics'), { code: 'P2028' }); };
  const res = response(); await registerBusiness(request('nama.depan@gmail.com'), res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.code, 'REGISTRATION_RETRY');
  assert.doesNotMatch(JSON.stringify(res.body), /private diagnostics/);
});
