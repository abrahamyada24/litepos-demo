const { basePrisma, prisma } = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const {
  LOGIN_LOCK_DURATION_MS,
  LOGIN_LOCK_THRESHOLD,
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  validatePassword,
} = require('../config/auth');
const {
  createAuthSession,
  revokeAllUserSessions,
  revokeSession,
} = require('../services/authSessionService');
const {
  generateUniqueUsername,
  normalizeUsername,
  validateUsername,
} = require('../services/usernameService');
const { listActiveMemberships, serializeStore } = require('../services/storeAccessService');
const {
  generateAvailableStoreSlug,
  normalizeStoreSlug,
  validateStoreSlug,
} = require('../services/businessRegistrationService');
const { createTrialLicenseData } = require('../services/licenseService');
const { getUploadedFileUrl } = require('../utils/uploadedFileUrl');

const PASSWORD_HASH_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('litepos-invalid-password-placeholder', PASSWORD_HASH_ROUNDS);

const clearSessionCookie = (res) => res.clearCookie(SESSION_COOKIE_NAME, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});

const publicUser = (user, memberships = [], activeStoreId = null) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username,
  role: memberships.find((membership) => membership.storeId === activeStoreId)?.role || user.role,
  imageUrl: user.imageUrl,
  mustChangePassword: Boolean(user.mustChangePassword),
  activeStoreId,
  stores: memberships.map(serializeStore),
});

const genericLoginFailure = (res) => res.status(401).json({
  success: false,
  code: 'INVALID_CREDENTIALS',
  message: 'Email/username atau password salah.',
});

exports.registerBusiness = async (req, res) => {
  try {
    const {
      ownerName,
      businessName,
      email,
      username,
      password,
      slug,
      businessType,
      storeType,
    } = req.body || {};
    const normalizedOwnerName = String(ownerName || '').trim();
    const normalizedBusinessName = String(businessName || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const requestedUsername = normalizeUsername(username);
    const requestedSlug = normalizeStoreSlug(slug);
    const normalizedBusinessType = String(businessType || storeType || 'RETAIL').trim().toUpperCase();
    // Store.type saat ini membedakan alur laundry dan POS umum. Preset F&B
    // memakai POS umum tanpa migrasi schema, dengan kategori dan pre-order yang sesuai.
    const persistedStoreType = normalizedBusinessType === 'LAUNDRY' ? 'LAUNDRY' : 'RETAIL';
    const passwordError = validatePassword(password);

    if (!normalizedOwnerName || !normalizedBusinessName || !normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nama owner, nama usaha, email, dan password wajib diisi.',
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
    }
    if (normalizedOwnerName.length > 255 || normalizedBusinessName.length > 255) {
      return res.status(400).json({ success: false, message: 'Nama maksimal 255 karakter.' });
    }
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      return res.status(503).json({ success: false, code: 'AUTH_CONFIG_MISSING', message: 'Konfigurasi login server belum lengkap. Pengelola perlu mengisi JWT_SECRET pada backend lalu redeploy.' });
    }
    if (!['RETAIL', 'FNB', 'LAUNDRY'].includes(normalizedBusinessType)) {
      return res.status(400).json({ success: false, message: 'Jenis usaha tidak valid.' });
    }
    if (requestedUsername) {
      const usernameError = validateUsername(requestedUsername);
      if (usernameError) return res.status(400).json({ success: false, message: usernameError });
    }
    if (slug !== undefined && slug !== null && String(slug).trim()) {
      const slugError = validateStoreSlug(slug);
      if (slugError) return res.status(400).json({ success: false, message: slugError });
    }

    const existingUser = await basePrisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          ...(requestedUsername ? [{ username: requestedUsername }] : []),
        ],
      },
      select: { id: true, email: true, username: true },
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        code: 'ACCOUNT_ALREADY_EXISTS',
        message: existingUser.email === normalizedEmail
          ? 'Email sudah terdaftar. Silakan login dengan akun tersebut.'
          : 'Username sudah digunakan. Pilih username lain atau kosongkan agar dibuat otomatis.',
      });
    }

    let finalSlug;
    if (requestedSlug) {
      const existingStore = await basePrisma.store.findUnique({
        where: { slug: requestedSlug },
        select: { id: true },
      });
      if (existingStore) {
        return res.status(409).json({
          success: false,
          code: 'STORE_SLUG_TAKEN',
          message: 'Slug usaha sudah digunakan. Pilih slug lain.',
        });
      }
      finalSlug = requestedSlug;
    } else {
      finalSlug = await generateAvailableStoreSlug(basePrisma, normalizedBusinessName);
    }

    const passwordHash = await bcrypt.hash(String(password), PASSWORD_HASH_ROUNDS);
    const now = new Date();
    const registration = await basePrisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: normalizedOwnerName,
          email: normalizedEmail,
          username: requestedUsername || await generateUniqueUsername(tx, normalizedEmail),
          password: passwordHash,
          role: 'OWNER',
          mustChangePassword: false,
        },
      });
      const store = await tx.store.create({
        data: {
          slug: finalSlug,
          name: normalizedBusinessName,
          type: persistedStoreType,
          isActive: true,
          isPublicDemo: false,
        },
      });

      await tx.storeMembership.create({
        data: { userId: user.id, storeId: store.id, role: 'OWNER', isActive: true },
      });
      await tx.storeSetting.create({
        data: {
          storeId: store.id,
          storeName: store.name,
          email: user.email,
          enableCash: true,
          enableQris: false,
          enableDebit: false,
          enableShift: true,
          enablePreOrder: normalizedBusinessType === 'FNB',
        },
      });
      await tx.loyaltyConfig.create({ data: { storeId: store.id } });
      await tx.storeLicense.create({
        data: { storeId: store.id, ...createTrialLicenseData(now) },
      });
      await tx.category.create({
        data: {
          storeId: store.id,
          name: normalizedBusinessType === 'LAUNDRY'
            ? 'Layanan Laundry'
            : normalizedBusinessType === 'FNB' ? 'Menu' : 'Produk Umum',
        },
      });

      // Semua data dan sesi pertama harus berhasil bersama-sama. Kegagalan
      // sesi tidak boleh meninggalkan email terdaftar tanpa bisa masuk.
      const memberships = await listActiveMemberships(tx, user.id);
      const { session, token } = await createAuthSession({
        prisma: tx, user, activeStoreId: store.id, clientType: 'WEB',
        deviceName: 'Web POS', ipAddress: req.ip, userAgent: req.get('user-agent'),
      });
      return { user, store, memberships, session, token };
    }, { maxWait: 10000, timeout: 20000 });

    const { memberships, session, token } = registration;

    res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    return res.status(201).json({
      success: true,
      message: 'Usaha dan akun Owner berhasil dibuat.',
      token,
      sessionExpiresAt: session.expiresAt,
      user: publicUser(registration.user, memberships, registration.store.id),
      store: serializeStore(memberships[0]),
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        code: 'REGISTRATION_CONFLICT',
        message: 'Email, username, atau slug usaha sudah digunakan.',
      });
    }
    const reference = randomUUID();
    const isTimeout = ['P2028', 'P2024', 'P1001', 'P1002', 'P1017'].includes(error.code);
    const schemaOutdated = ['P2021', 'P2022'].includes(error.code);
    // Jangan mencatat payload pendaftaran atau password ke log.
    console.error('[REGISTER BUSINESS ERROR]', JSON.stringify({ reference, code: error.code || 'INTERNAL_ERROR', type: error.name }));
    return res.status(isTimeout ? 503 : 500).json({
      success: false,
      code: isTimeout ? 'REGISTRATION_RETRY' : schemaOutdated ? 'REGISTRATION_SCHEMA_OUTDATED' : 'REGISTRATION_FAILED',
      reference,
      message: isTimeout
        ? 'Koneksi pendaftaran sedang lambat. Tunggu sebentar lalu coba kembali.'
        : schemaOutdated
          ? 'Struktur database belum sesuai versi aplikasi. Pengelola perlu memperbarui schema backend.'
          : `Pendaftaran usaha belum dapat diproses. Referensi: ${reference}`,
    });
  }
};

exports.register = async (req, res) => {
  try {
    const { name, email, username, password, role } = req.body;
    const normalizedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const requestedUsername = normalizeUsername(username);
    const normalizedRole = String(role || 'CASHIER').toUpperCase();
    const passwordError = validatePassword(password);

    if (!normalizedName || !normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi.' });
    }
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });
    if (requestedUsername) {
      const usernameError = validateUsername(requestedUsername);
      if (usernameError) return res.status(400).json({ success: false, message: usernameError });
    }
    if (!['ADMIN', 'CASHIER'].includes(normalizedRole)) {
      return res.status(400).json({ success: false, message: 'Role user tidak valid.' });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          ...(requestedUsername ? [{ username: requestedUsername }] : []),
        ],
      },
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email atau username sudah digunakan. Hubungi Owner untuk menambahkan akun lama ke usaha ini.',
      });
    }

    const user = await prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.create({
        data: {
          name: normalizedName,
          email: normalizedEmail,
          username: requestedUsername || await generateUniqueUsername(tx, normalizedEmail || normalizedName),
          password: await bcrypt.hash(String(password), PASSWORD_HASH_ROUNDS),
          role: normalizedRole,
          imageUrl: getUploadedFileUrl(req.file),
          mustChangePassword: true,
        },
      });
      await tx.storeMembership.create({
        data: { userId: targetUser.id, storeId: req.storeId, role: normalizedRole },
      });
      return targetUser;
    });

    const memberships = await listActiveMemberships(prisma, user.id);

    return res.status(201).json({
      success: true,
      message: 'User berhasil dibuat dan wajib mengganti password saat login pertama.',
      data: publicUser(user, memberships, req.storeId),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal membuat pengguna.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, email, password, clientType, deviceName } = req.body;
    const normalizedIdentifier = String(identifier || email || '').trim().toLowerCase();
    const normalizedClientType = String(clientType || 'WEB').toUpperCase() === 'ANDROID' ? 'ANDROID' : 'WEB';

    if (!normalizedIdentifier || !password) return genericLoginFailure(res);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedIdentifier },
          { username: normalizedIdentifier },
        ],
      },
    });
    if (!user) {
      await bcrypt.compare(String(password), DUMMY_PASSWORD_HASH);
      return genericLoginFailure(res);
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      return res.status(429).json({
        success: false,
        code: 'LOGIN_TEMPORARILY_LOCKED',
        message: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.',
      });
    }

    const passwordMatches = await bcrypt.compare(String(password), user.password);
    if (!passwordMatches || !user.isActive) {
      const failedAttempts = Number(user.failedLoginAttempts || 0) + 1;
      const shouldLock = failedAttempts >= LOGIN_LOCK_THRESHOLD;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : failedAttempts,
          lockedUntil: shouldLock ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS) : null,
        },
      });
      return genericLoginFailure(res);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });

    const memberships = await listActiveMemberships(prisma, user.id);
    if (memberships.length === 0) {
      return res.status(403).json({
        success: false,
        code: 'STORE_ACCESS_REQUIRED',
        message: 'Akun ini belum memiliki akses ke usaha mana pun.',
      });
    }
    const activeStoreId = memberships[0].storeId;

    const { session, token } = await createAuthSession({
      prisma,
      user,
      activeStoreId,
      clientType: normalizedClientType,
      deviceName,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    return res.json({
      success: true,
      message: 'Login berhasil.',
      token,
      sessionExpiresAt: session.expiresAt,
      user: publicUser(user, memberships, activeStoreId),
    });
  } catch (error) {
    console.error(`[LOGIN ERROR]: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Login belum dapat diproses.' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Password lama dan password baru wajib diisi.' });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan atau tidak aktif.' });
    }

    const currentPasswordMatches = await bcrypt.compare(String(oldPassword), user.password);
    if (!currentPasswordMatches) {
      return res.status(401).json({ success: false, message: 'Password lama salah.' });
    }
    if (await bcrypt.compare(String(newPassword), user.password)) {
      return res.status(400).json({ success: false, message: 'Password baru harus berbeda dari password lama.' });
    }

    const changedAt = new Date();
    const hashedPassword = await bcrypt.hash(String(newPassword), PASSWORD_HASH_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          mustChangePassword: false,
          passwordChangedAt: changedAt,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: changedAt, revokeReason: 'PASSWORD_CHANGED' },
      }),
    ]);

    clearSessionCookie(res);
    return res.json({
      success: true,
      code: 'PASSWORD_CHANGED_RELOGIN_REQUIRED',
      message: 'Password berhasil diubah. Silakan login kembali.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Password belum dapat diubah.' });
  }
};

exports.logout = async (req, res) => {
  await revokeSession(prisma, req.authSession.id, 'LOGOUT');
  clearSessionCookie(res);
  return res.json({ success: true, message: 'Logout berhasil.' });
};

exports.logoutAll = async (req, res) => {
  await revokeAllUserSessions(prisma, req.user.id, 'LOGOUT_ALL');
  clearSessionCookie(res);
  return res.json({ success: true, message: 'Semua perangkat berhasil dikeluarkan.' });
};

exports.getSessions = async (req, res) => {
  const sessions = await prisma.authSession.findMany({
    where: { userId: req.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      clientType: true,
      deviceName: true,
      userAgent: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
    orderBy: { lastSeenAt: 'desc' },
  });
  return res.json({ success: true, data: sessions });
};

exports.revokeSession = async (req, res) => {
  const result = await prisma.authSession.updateMany({
    where: { id: req.params.id, userId: req.user.id, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: 'USER_REVOKED' },
  });
  if (result.count === 0) {
    return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan.' });
  }
  if (req.params.id === req.authSession.id) clearSessionCookie(res);
  return res.json({ success: true, message: 'Sesi berhasil dicabut.' });
};

exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan atau tidak aktif.' });
    }
    const memberships = await listActiveMemberships(prisma, user.id);
    return res.json({ success: true, user: publicUser(user, memberships, req.storeId) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Data pengguna belum dapat dimuat.' });
  }
};

exports.getStores = async (req, res) => {
  const memberships = await listActiveMemberships(prisma, req.user.id);
  return res.json({
    success: true,
    data: memberships.map(serializeStore),
    activeStoreId: req.storeId,
  });
};

exports.switchStore = async (req, res) => {
  const storeId = Number(req.body?.storeId);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ success: false, message: 'Usaha yang dipilih tidak valid.' });
  }

  const membership = await prisma.storeMembership.findUnique({
    where: { userId_storeId: { userId: req.user.id, storeId } },
    include: { store: true },
  });
  if (!membership?.isActive || !membership.store?.isActive) {
    return res.status(403).json({
      success: false,
      code: 'STORE_ACCESS_DENIED',
      message: 'Anda tidak memiliki akses ke usaha tersebut.',
    });
  }

  await prisma.authSession.update({
    where: { id: req.authSession.id },
    data: { activeStoreId: storeId },
  });
  return res.json({ success: true, data: serializeStore(membership) });
};
