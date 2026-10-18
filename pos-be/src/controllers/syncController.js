const { prisma } = require('../config/prisma');
const { enterDataSync } = require('../services/dataResetCoordinator');
const { normalizeCustomerPhone, customerPhoneAliases } = require('../services/customerPhoneService');
const loyaltySnapshotFromAndroid = transaction => {
  if (String(transaction.status).toUpperCase() === 'PENDING' || ['PARTIAL', 'UNPAID'].includes(String(transaction.paymentStatus).toUpperCase())) return {};
  const keys = ['pointsEarned', 'pointsRedeemed', 'pointsBalanceAfter'];
  if (!keys.every(key => transaction[key] != null && Number.isSafeInteger(Number(transaction[key])) && Number(transaction[key]) >= 0)) return {};
  return Object.fromEntries(keys.map(key => [key, Number(transaction[key])]));
};

const normalizeAndroidPayment = (transaction) => {
  const grandTotal = Math.max(0, Number(transaction.grandTotal) || 0);
  const requestedStatus = String(transaction.paymentStatus || 'PAID').toUpperCase();
  const paymentStatus = ['PAID', 'PARTIAL', 'UNPAID'].includes(requestedStatus)
    ? requestedStatus
    : 'PAID';
  const paidAmount = paymentStatus === 'PAID'
    ? grandTotal
    : paymentStatus === 'PARTIAL'
      ? Math.min(grandTotal, Math.max(0, Number(transaction.paidAmount) || 0))
      : 0;

  return {
    grandTotal,
    paymentStatus: paidAmount >= grandTotal && grandTotal > 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
    paidAmount,
    remainingAmount: Math.max(0, grandTotal - paidAmount)
  };
};

const summarizePayments = (transaction) => {
  const grandTotal = Math.max(0, Number(transaction.grandTotal) || 0);
  let paidAmount = 0;
  let paidAt = null;

  for (const payment of transaction.payments || []) {
    const status = String(payment.paymentStatus || '').toUpperCase();
    if (!['FAILED', 'PENDING', 'UNPAID'].includes(status)) {
      paidAmount += Math.max(0, Number(payment.amount) || 0);
      if (!paidAt || payment.createdAt > paidAt) paidAt = payment.createdAt;
    }
  }

  paidAmount = Math.min(grandTotal, paidAmount);
  return {
    paymentStatus: paidAmount >= grandTotal && grandTotal > 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
    paidAmount,
    remainingAmount: Math.max(0, grandTotal - paidAmount),
    paidAt: paidAt ? paidAt.toISOString() : null
  };
};

/**
 * 1. GET MASTER DATA
 * Mengembalikan semua data katalog yang dibutuhkan aplikasi Android
 * untuk disimpan ke dalam database SQLite lokal.
 */
exports.getMasterData = async (req, res) => {
  try {
    const [
      settings,
      loyaltyConfig,
      categories,
      products,
      addons,
      users,
      customers,
      suppliers,
      packages,
      packageItems
    ] = await Promise.all([
      prisma.storeSetting.findFirst(),
      prisma.loyaltyConfig.findFirst(),
      prisma.category.findMany(),
      prisma.product.findMany(),
      prisma.productAddon.findMany(),
      prisma.storeMembership.findMany({
        where: { storeId: req.storeId, isActive: true },
        include: { user: { select: { id: true, name: true, email: true, username: true } } }
      }),
      prisma.customer.findMany(),
      prisma.supplier.findMany(),
      prisma.package.findMany(),
      prisma.packageItem.findMany({ where: { package: { storeId: req.storeId } } })
    ]);

    const storeUsers = users.map(({ user, role }) => ({ ...user, role }));

    // Format settings to Key-Value array as expected by Android SQLite
    const formattedSettings = settings ? [
      { key: 'storeName', value: settings.storeName },
      { key: 'storeAddress', value: settings.address || '' },
      { key: 'storePhone', value: settings.phone || '' },
      { key: 'storeLogo', value: settings.logoUrl || '' },
      { key: 'enablePreOrder', value: settings.enablePreOrder ? 'true' : 'false' },
      { key: 'enableShift', value: settings.enableShift ? 'true' : 'false' },
      { key: 'enableShiftReminder', value: settings.enableShiftReminder ? 'true' : 'false' },
      { key: 'shiftDurationMinutes', value: settings.shiftDurationMinutes.toString() },
      { key: 'shiftReminderMinutes', value: settings.shiftReminderMinutes.toString() },
      { key: 'shiftDayCutoff', value: settings.shiftDayCutoff || '23:50' },
      { key: 'enableDineTable', value: 'false' },
      { key: 'receiptFooter', value: settings.receiptFooter || '' },
      { key: 'taxRate', value: settings.taxRate.toString() },
      { key: 'serviceCharge', value: settings.serviceCharge.toString() },
      { key: 'takeawayOptions', value: settings.takeawayOptions || '[]' },
      { key: 'allowNegativeStock', value: settings.allowNegativeStock ? 'true' : 'false' },
      { key: 'showImages', value: settings.showImages ? 'true' : 'false' },
      { key: 'theme', value: settings.theme || 'light' },
      { key: 'dataResetVersion', value: settings.dataResetVersion.toString() },
      { key: 'dataResetAt', value: settings.dataResetAt?.toISOString() || '' }
    ] : [];

    // Add loyalty config as settings too for easy access in Android
    if (loyaltyConfig) {
      formattedSettings.push(
        { key: 'loyalty_multiplier', value: loyaltyConfig.pointMultiplier.toString() },
        { key: 'loyalty_multiplier_amount', value: loyaltyConfig.multiplierAmount.toString() },
        { key: 'loyalty_point_value', value: loyaltyConfig.pointValue.toString() },
        { key: 'loyalty_min_points', value: loyaltyConfig.minRedemptionPoints.toString() },
        { key: 'loyalty_active', value: loyaltyConfig.isActive ? 'true' : 'false' }
      );
    }

    console.log(`[SYNC] getMasterData → store=${req.storeId}, settings: ${formattedSettings.length}, categories: ${categories.length}, products: ${products.length}, users: ${storeUsers.length}, customers: ${customers.length}, suppliers: ${suppliers.length}, packages: ${packages.length}, addons: ${addons.length}`);

    res.json({
      success: true,
      data: {
        settings: formattedSettings,
        categories,
        products,
        addons,
        users: storeUsers,
        activeStore: { id: req.store.id, slug: req.store.slug, name: req.store.name, type: req.store.type },
        customers,
        suppliers,
        packages,
        package_items: packageItems
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 2. PUSH LOCAL DATA
 * Menerima data transaksi, pengeluaran, dan shift yang dibuat secara offline di perangkat Android,
 * lalu menyimpannya secara massal ke database MySQL server.
 */
exports.pushLocalData = async (req, res) => {
  let releaseDataSync = null;
  try {
    releaseDataSync = enterDataSync();
    const { transactions, expenses, shifts, categories, products, customers, settings, stockReceipts, suppliers: pushSuppliers, packages: pushPackages, addons: pushAddons, dataResetVersion } = req.body;
    const resetState = await prisma.storeSetting.findFirst({
      select: { dataResetVersion: true, dataResetInProgress: true, dataResetAt: true },
    });
    const serverResetVersion = resetState?.dataResetVersion || 0;
    const clientResetVersion = Number(dataResetVersion || 0);
    if (resetState?.dataResetInProgress) {
      return res.status(423).json({
        success: false,
        code: 'DATA_RESET_IN_PROGRESS',
        message: 'Reset data outlet sedang berlangsung. Sinkronisasi ditunda.',
      });
    }
    if (!Number.isInteger(clientResetVersion) || clientResetVersion !== serverResetVersion) {
      return res.status(409).json({
        success: false,
        code: 'RESET_REQUIRED',
        message: 'Data perangkat berasal dari sebelum reset outlet dan tidak boleh diunggah.',
        data: {
          version: serverResetVersion,
          resetAt: resetState?.dataResetAt || null,
        },
      });
    }
    const canManageMasterData = ['ADMIN', 'OWNER'].includes(req.user.role);
    const restrictedPayloads = [settings, categories, products, stockReceipts, pushSuppliers, pushPackages, pushAddons];
    if (!canManageMasterData && restrictedPayloads.some(items => Array.isArray(items) && items.length > 0)) {
      return res.status(403).json({
        success: false,
        message: 'Hanya Admin/Owner yang dapat mengubah pengaturan, katalog, supplier, paket, dan stok.'
      });
    }
    let savedTransactions = 0;
    let savedExpenses = 0;
    let savedShifts = 0;
    let savedCategories = 0;
    let savedProducts = 0;
    let savedCustomers = 0;
    let savedStockReceipts = 0;
    let savedSuppliers = 0;
    let savedPackages = 0;
    let savedAddons = 0;
    const syncWarnings = [];
    const syncedTransactionIds = [];
    const syncedExpenseIds = [];
    const syncedShiftIds = [];
    const syncedStockReceiptIds = [];
    const syncUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { name: true }
    });

    const addSyncWarning = (entity, id, error) => {
        const message = error?.message || String(error);
        console.error(`[SYNC] Gagal proses ${entity} id=${id ?? '-'}:`, message);
        syncWarnings.push({ entity, id: id ?? null, message });
    };

    const nonEmptyString = (value) => {
        if (value === null || value === undefined) return null;
        const normalized = String(value).trim();
        return normalized || null;
    };

    const finiteNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    };

    // 0. Proses Settings dari Android → update StoreSetting & LoyaltyConfig di server
    if (settings && Array.isArray(settings) && settings.length > 0) {
        const settingsMap = {};
        for (const s of settings) {
            settingsMap[s.key] = s.value;
        }

        // Update StoreSetting — "non-empty wins" merge strategy
        // String fields: only update if Android value is non-empty (prevent overwriting website data with empty)
        // Boolean fields: always sync (false is a valid value)
        const storeSettingData = {};
        const storeName = nonEmptyString(settingsMap.storeName);
        const storeAddress = nonEmptyString(settingsMap.storeAddress);
        const storePhone = nonEmptyString(settingsMap.storePhone);
        const receiptFooter = nonEmptyString(settingsMap.receiptFooter);
        const theme = nonEmptyString(settingsMap.theme);
        if (storeName) storeSettingData.storeName = storeName;
        if (storeAddress) storeSettingData.address = storeAddress;
        if (storePhone) storeSettingData.phone = storePhone;
        if (receiptFooter) storeSettingData.receiptFooter = receiptFooter;
        if (settingsMap.enablePreOrder !== undefined) storeSettingData.enablePreOrder = settingsMap.enablePreOrder === 'true';
        if (settingsMap.enableShift !== undefined) storeSettingData.enableShift = settingsMap.enableShift === 'true';
        if (settingsMap.enableShiftReminder !== undefined) storeSettingData.enableShiftReminder = settingsMap.enableShiftReminder === 'true';
        const shiftDurationMinutes = finiteNumber(settingsMap.shiftDurationMinutes);
        if (shiftDurationMinutes !== null && shiftDurationMinutes >= 30 && shiftDurationMinutes <= 2880) {
            storeSettingData.shiftDurationMinutes = Math.round(shiftDurationMinutes);
        }
        const shiftReminderMinutes = finiteNumber(settingsMap.shiftReminderMinutes);
        if (shiftReminderMinutes !== null && shiftReminderMinutes >= 0 && shiftReminderMinutes <= 240) {
            storeSettingData.shiftReminderMinutes = Math.round(shiftReminderMinutes);
        }
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(settingsMap.shiftDayCutoff || ''))) {
            storeSettingData.shiftDayCutoff = String(settingsMap.shiftDayCutoff);
        }
        storeSettingData.enableDineTable = false;
        if (settingsMap.allowNegativeStock !== undefined) storeSettingData.allowNegativeStock = settingsMap.allowNegativeStock === 'true';
        if (settingsMap.showImages !== undefined) storeSettingData.showImages = settingsMap.showImages === 'true';
        if (theme) storeSettingData.theme = theme;

        if (Object.keys(storeSettingData).length > 0) {
            const firstSetting = await prisma.storeSetting.findFirst();
            if (firstSetting) {
                await prisma.storeSetting.update({ where: { id: firstSetting.id }, data: storeSettingData });
            } else {
                await prisma.storeSetting.create({ data: { storeName: storeSettingData.storeName || 'LitePOS Store', ...storeSettingData } });
            }
        }

        // Update LoyaltyConfig
        if (settingsMap.loyalty_active !== undefined || settingsMap.loyalty_multiplier !== undefined) {
            const loyaltyData = {};
            const pointMultiplier = finiteNumber(settingsMap.loyalty_multiplier);
            const multiplierAmount = finiteNumber(settingsMap.loyalty_multiplier_amount);
            const pointValue = finiteNumber(settingsMap.loyalty_point_value);
            const minRedemptionPoints = finiteNumber(settingsMap.loyalty_min_points);
            if (pointMultiplier !== null) loyaltyData.pointMultiplier = pointMultiplier;
            if (multiplierAmount !== null) loyaltyData.multiplierAmount = multiplierAmount;
            if (pointValue !== null) loyaltyData.pointValue = pointValue;
            if (minRedemptionPoints !== null) loyaltyData.minRedemptionPoints = Math.trunc(minRedemptionPoints);
            if (settingsMap.loyalty_active !== undefined) loyaltyData.isActive = settingsMap.loyalty_active === 'true';

            if (Object.keys(loyaltyData).length > 0) {
                const firstLoyalty = await prisma.loyaltyConfig.findFirst();
                if (firstLoyalty) {
                    await prisma.loyaltyConfig.update({ where: { id: firstLoyalty.id }, data: loyaltyData });
                } else {
                    await prisma.loyaltyConfig.create({ data: { id: 1, ...loyaltyData } });
                }
            }
        }
    }

    // A. Proses Customers
    const customerIdMap = [];
    if (customers && Array.isArray(customers)) {
        for (const cust of customers) {
            try {
                const androidId = parseInt(cust.id);
                const requestedServerId = parseInt(cust.serverId);
                const normalizedPhone = normalizeCustomerPhone(cust.phone);
                const normalizedName = nonEmptyString(cust.name) || 'Pelanggan';
                let serverCust = !isNaN(requestedServerId)
                    ? await prisma.customer.findUnique({ where: { id: requestedServerId } })
                    : null;
                if (!serverCust && !isNaN(androidId)) {
                    serverCust = await prisma.customer.findUnique({ where: { androidId } });
                }
                if (!serverCust && normalizedPhone) {
                    serverCust = await prisma.customer.findFirst({ where: { phone: { in: customerPhoneAliases(normalizedPhone) } } });
                }
                if (!serverCust) {
                    serverCust = await prisma.customer.create({
                        data: {
                            androidId: isNaN(androidId) ? null : androidId,
                            memberId: cust.memberId || `CUST-A${cust.id}-${Date.now()}`,
                            name: normalizedName,
                            phone: normalizedPhone,
                            email: nonEmptyString(cust.email),
                            notes: nonEmptyString(cust.notes),
                            imageUrl: nonEmptyString(cust.imageUrl),
                            displayType: ['normal', 'tall', 'wide', 'large'].includes(cust.displayType) ? cust.displayType : 'normal',
                            loyaltyDiscount: Number(cust.loyaltyDiscount || 0),
                            points: parseInt(cust.points || 0)
                        }
                    });
                    savedCustomers++;
                } else {
                    await prisma.customer.update({
                        where: { id: serverCust.id },
                        data: {
                            name: normalizedName,
                            email: cust.email !== undefined ? nonEmptyString(cust.email) : serverCust.email,
                            notes: cust.notes !== undefined ? nonEmptyString(cust.notes) : serverCust.notes,
                            imageUrl: cust.imageUrl !== undefined ? nonEmptyString(cust.imageUrl) : serverCust.imageUrl,
                            displayType: ['normal', 'tall', 'wide', 'large'].includes(cust.displayType) ? cust.displayType : serverCust.displayType,
                            points: parseInt(cust.points || 0),
                            loyaltyDiscount: Number(cust.loyaltyDiscount || 0),
                            phone: cust.phone !== undefined ? normalizedPhone : serverCust.phone
                        }
                    });
                }
                customerIdMap.push({ androidId: cust.id, serverId: serverCust.id });
            } catch (error) {
                addSyncWarning('customer', cust.id, error);
            }
        }
    }

    // A. Proses Categories
    const categoryIdMap = [];
    if (categories && Array.isArray(categories)) {
        for (const cat of categories) {
            try {
                let serverCat = await prisma.category.findUnique({ where: { androidId: cat.id }});
                // Fallback: jika kategori dibuat dari web (tidak punya androidId), cari berdasarkan serverId
                if (!serverCat && cat.serverId) {
                    serverCat = await prisma.category.findUnique({ where: { id: parseInt(cat.serverId) }});
                    if (serverCat) {
                        await prisma.category.update({ where: { id: serverCat.id }, data: { androidId: cat.id } });
                    }
                }
                if (!serverCat) {
                    serverCat = await prisma.category.create({
                        data: {
                            androidId: cat.id,
                            name: cat.name,
                            displayType: 'normal'
                        }
                    });
                    savedCategories++;
                } else {
                    await prisma.category.update({
                        where: { id: serverCat.id },
                        data: { name: cat.name || serverCat.name }
                    });
                }
                categoryIdMap.push({ androidId: cat.id, serverId: serverCat.id });
            } catch (error) {
                addSyncWarning('category', cat.id, error);
            }
        }
    }

    // B. Proses Products
    const productIdMap = [];
    if (products && Array.isArray(products)) {
        for (const prod of products) {
            try {
                let serverProd = await prisma.product.findUnique({ where: { androidId: prod.id }});
                // Fallback: jika produk dibuat dari web (tidak punya androidId), cari berdasarkan serverId
                if (!serverProd && prod.serverId) {
                    serverProd = await prisma.product.findUnique({ where: { id: parseInt(prod.serverId) }});
                    if (serverProd) {
                        await prisma.product.update({ where: { id: serverProd.id }, data: { androidId: prod.id } });
                    }
                }
                if (!serverProd) {
                    const category = await prisma.category.findUnique({ where: { androidId: prod.categoryId }});
                    const categoryId = category ? category.id : prod.categoryId;

                    serverProd = await prisma.product.create({
                        data: {
                            androidId: prod.id,
                            categoryId: categoryId,
                            sku: prod.sku || `PROD-${prod.id}-${Date.now()}`,
                            name: prod.name,
                            price: Number(prod.price),
                            costPrice: Number(prod.costPrice || 0),
                            stock: Number(prod.stock || 0),
                            isActive: true,
                            isUnlimitedStock: Boolean(prod.isUnlimitedStock),
                            discountActive: prod.discountActive === true || Number(prod.discountActive) === 1,
                            discountType: prod.discountType || null,
                            discountValue: Number(prod.discountValue || 0),
                            discountStartAt: prod.discountStartAt ? new Date(prod.discountStartAt) : null,
                            discountEndAt: prod.discountEndAt ? new Date(prod.discountEndAt) : null,
                            discountStartTime: prod.discountStartTime || null,
                            discountEndTime: prod.discountEndTime || null,
                            discountDays: prod.discountDays || null,
                            discountLabel: prod.discountLabel || null
                        }
                    });
                    savedProducts++;
                } else {
                    const category = await prisma.category.findUnique({ where: { androidId: prod.categoryId }});
                    const categoryId = category ? category.id : (prod.categoryId || serverProd.categoryId);

                    await prisma.product.update({
                        where: { id: serverProd.id },
                        data: {
                            name: prod.name || serverProd.name,
                            price: Number(prod.price),
                            costPrice: Number(prod.costPrice || 0),
                            categoryId: categoryId,
                            stock: Number(prod.stock ?? serverProd.stock),
                            isUnlimitedStock: prod.isUnlimitedStock !== undefined ? Boolean(prod.isUnlimitedStock) : serverProd.isUnlimitedStock,
                            barcode: prod.barcode || serverProd.barcode,
                            minStock: prod.minStock !== undefined ? Number(prod.minStock) : serverProd.minStock,
                            discountActive: prod.discountActive !== undefined ? (prod.discountActive === true || Number(prod.discountActive) === 1) : serverProd.discountActive,
                            discountType: prod.discountType !== undefined ? (prod.discountType || null) : serverProd.discountType,
                            discountValue: prod.discountValue !== undefined ? Number(prod.discountValue || 0) : serverProd.discountValue,
                            discountStartAt: prod.discountStartAt !== undefined ? (prod.discountStartAt ? new Date(prod.discountStartAt) : null) : serverProd.discountStartAt,
                            discountEndAt: prod.discountEndAt !== undefined ? (prod.discountEndAt ? new Date(prod.discountEndAt) : null) : serverProd.discountEndAt,
                            discountStartTime: prod.discountStartTime !== undefined ? (prod.discountStartTime || null) : serverProd.discountStartTime,
                            discountEndTime: prod.discountEndTime !== undefined ? (prod.discountEndTime || null) : serverProd.discountEndTime,
                            discountDays: prod.discountDays !== undefined ? (prod.discountDays || null) : serverProd.discountDays,
                            discountLabel: prod.discountLabel !== undefined ? (prod.discountLabel || null) : serverProd.discountLabel
                        }
                    });
                    savedProducts++;
                }
                productIdMap.push({ androidId: prod.id, serverId: serverProd.id });
            } catch (error) {
                addSyncWarning('product', prod.id, error);
            }
        }
    }

    // A. Proses Transactions
    if (transactions && Array.isArray(transactions)) {
      for (const tx of transactions) {
        try {
        // Cek jika sudah ada (identity check menggunakan androidId)
        const exists = await prisma.transaction.findUnique({
          where: { androidId: tx.id },
          include: { payments: true }
        });
        const isPreOrderConfirmed = tx.preOrderConfirmed === true || Number(tx.preOrderConfirmed) === 1;
        const incomingPayment = normalizeAndroidPayment(tx);
        const paymentType = String(tx.paymentMethod || 'CASH').toUpperCase();
        const validPaymentType = ['CASH', 'QRIS', 'QRIS_MANUAL', 'TRANSFER'].includes(paymentType) ? paymentType : 'CASH';
        const validStatuses = ['PENDING', 'PAID', 'CANCELLED', 'COMPLETED', 'RETURNED'];
        const requestedTransactionStatus = validStatuses.includes(String(tx.status).toUpperCase())
          ? String(tx.status).toUpperCase()
          : 'COMPLETED';
        const incomingTransactionStatus = tx.preOrderDate && !isPreOrderConfirmed && incomingPayment.paymentStatus !== 'PAID'
          ? 'PENDING'
          : requestedTransactionStatus;
        if (exists && tx.status === 'RETURNED' && exists.status !== 'RETURNED') {
          // ── UPDATE STATUS RETUR ─────────────────────────────────
          // Transaksi sudah ada di server tapi diretur dari Android
          await prisma.transaction.update({
            where: { id: exists.id },
            data: { status: 'RETURNED', loyaltyReversed: true }
          });

          // Kembalikan stok di server (reverse stock decrement)
          const existingItems = await prisma.transactionItem.findMany({
            where: { transactionId: exists.id }
          });
          for (const item of existingItems) {
            try {
              await prisma.product.updateMany({
                where: { id: item.productId, isUnlimitedStock: false },
                data: { stock: { increment: item.qty } }
              });
              await prisma.stockMovement.create({
                data: {
                  productId: item.productId,
                  type: 'IN',
                  qty: item.qty,
                  source: 'RETURN',
                  description: `Retur dari Android sync (INV: ${exists.invoiceNumber})`,
                  createdAt: new Date()
                }
              });
            } catch (stockErr) {
              console.error(`[SYNC] Gagal reverse stok retur productId=${item.productId}:`, stockErr.message);
            }
          }
          savedTransactions++;
        } else if (exists) {
          const existingPayment = summarizePayments(exists);
          const shouldApplyPayment = incomingPayment.paidAmount > existingPayment.paidAmount;
          const transactionData = {};
          if (exists.pointsEarned == null) Object.assign(transactionData, loyaltySnapshotFromAndroid(tx));

          // Konfirmasi pengambilan bersifat satu arah (false -> true), sehingga
          // data Android yang lebih lama tidak dapat membatalkan konfirmasi web.
          if (isPreOrderConfirmed && !exists.preOrderConfirmed) {
            transactionData.preOrderConfirmed = true;
            transactionData.status = 'COMPLETED';
          }

          if (shouldApplyPayment) {
            transactionData.status = isPreOrderConfirmed ? 'COMPLETED' : incomingTransactionStatus;
            transactionData.cashAmount = tx.cashAmount == null ? null : Number(tx.cashAmount);
            transactionData.changeAmount = tx.changeAmount == null ? null : Number(tx.changeAmount);

            const firstPayment = exists.payments[0];
            if (firstPayment) {
              await prisma.payment.update({
                where: { id: firstPayment.id },
                data: {
                  paymentType: validPaymentType,
                  amount: incomingPayment.paidAmount,
                  paymentStatus: incomingPayment.paymentStatus
                }
              });
            } else {
              await prisma.payment.create({
                data: {
                  transactionId: exists.id,
                  paymentType: validPaymentType,
                  amount: incomingPayment.paidAmount,
                  paymentStatus: incomingPayment.paymentStatus
                }
              });
            }
          }

          if (Object.keys(transactionData).length > 0) {
            await prisma.transaction.update({ where: { id: exists.id }, data: transactionData });
            savedTransactions++;
          }
        } else if (!exists) {
          // Hitung subTotal jika tidak dikirim (Android mungkin belum kirim)
          const grandTotal = Number(tx.grandTotal);
          const discountAmount = tx.discountAmount ? Number(tx.discountAmount) : 0;
          const subTotal = grandTotal + discountAmount; // Asumsi sederhana

          // Resolve customerId dari androidId ke serverId
          let resolvedCustomerId = null;
          if (tx.customerServerId) {
              const serverCustomerId = parseInt(tx.customerServerId);
              if (!isNaN(serverCustomerId)) {
                  const customer = await prisma.customer.findUnique({ where: { id: serverCustomerId } });
                  resolvedCustomerId = customer ? customer.id : null;
              }
          }
          if (!resolvedCustomerId && tx.customerId) {
              const parsedCustId = parseInt(tx.customerId);
              if (!isNaN(parsedCustId)) {
                  const mappedCustomer = customerIdMap.find(item => Number(item.androidId) === parsedCustId);
                  if (mappedCustomer) {
                      resolvedCustomerId = mappedCustomer.serverId;
                  } else {
                      const customer = await prisma.customer.findUnique({ where: { androidId: parsedCustId }});
                      resolvedCustomerId = customer ? customer.id : null;
                  }
              }
          }
          // Kompatibilitas dengan versi Android lama yang mengirim serverId
          // melalui customerId tanpa field customerServerId.
          if (!resolvedCustomerId && tx.customerId) {
              const legacyServerId = parseInt(tx.customerId);
              if (!isNaN(legacyServerId)) {
                  const customer = await prisma.customer.findUnique({ where: { id: legacyServerId } });
                  resolvedCustomerId = customer ? customer.id : null;
              }
          }

          // Resolve productId untuk setiap item. Paket Android disimpan sebagai satu
          // baris `pkg-{id}` dan harus diurai kembali ke komponen produk server.
          const resolvedItems = [];
          for (const item of (tx.items || [])) {
              const requestedQty = parseInt(item.quantity) || 1;
              const packageMatch = String(item.productId || '').match(/^pkg-(\d+)$/i);
              if (packageMatch) {
                  const localPackageId = parseInt(packageMatch[1]);
                  let pkg = await prisma.package.findUnique({
                      where: { androidId: localPackageId },
                      include: { items: { include: { product: true } } }
                  });
                  if (!pkg) {
                      pkg = await prisma.package.findUnique({
                          where: { id: localPackageId },
                          include: { items: { include: { product: true } } }
                      });
                  }
                  if (!pkg || pkg.items.length === 0) {
                      throw new Error(`Paket ${localPackageId} tidak ditemukan atau kosong di server.`);
                  }
                  pkg.items.forEach((component, index) => {
                      resolvedItems.push({
                          productId: component.productId,
                          qty: component.qty * requestedQty,
                          price: index === 0 ? Number(item.price) / component.qty : 0,
                          originalPrice: index === 0 ? Number(item.originalPrice || item.price || 0) / component.qty : 0,
                          discountAmount: index === 0 ? Number(item.discountAmount || 0) : 0,
                          costPrice: Number(component.product.costPrice || 0),
                          notes: `[Paket ${pkg.name}] ${item.notes || ''}`.trim()
                      });
                  });
                  continue;
              }

              let serverProductId = null;
              if (item.serverProductId) {
                  serverProductId = parseInt(item.serverProductId);
              } else {
                  const parsedProdId = parseInt(item.productId);
                  if (!isNaN(parsedProdId)) {
                      const product = await prisma.product.findUnique({ where: { androidId: parsedProdId }});
                      serverProductId = product ? product.id : parsedProdId;
                  }
              }
              if (!serverProductId) throw new Error(`Produk ${item.productId} tidak dapat dipetakan ke server.`);
              resolvedItems.push({
                  productId: serverProductId,
                  qty: requestedQty,
                  price: Number(item.price),
                  originalPrice: Number(item.originalPrice || item.price || 0),
                  discountAmount: Number(item.discountAmount || 0),
                  costPrice: 0,
                  notes: item.notes || null,
              });
          }

          // Simpan transaksi dan perubahan stok secara atomik. Jika salah satu produk
          // tidak cukup, seluruh transaksi dibatalkan dan Android akan mencoba lagi.
          await prisma.$transaction(async (syncTx) => {
          await syncTx.transaction.create({
            data: {
              androidId: tx.id,
              ...loyaltySnapshotFromAndroid(tx),
              loyaltyReversed: incomingTransactionStatus === 'RETURNED',
              invoiceNumber: tx.invoiceNumber,
              subTotal: subTotal,
              taxAmount: 0,
              grandTotal: grandTotal,
              cashAmount: tx.cashAmount == null ? null : Number(tx.cashAmount),
              changeAmount: tx.changeAmount == null ? null : Number(tx.changeAmount),
              status: incomingTransactionStatus,
              customerId: resolvedCustomerId,
              customerName: tx.customerName || null,
              userId: req.user.id,
              orderType: tx.orderType || 'TAKE_AWAY',
              tableNumber: tx.tableName || null,
              preOrderDate: tx.preOrderDate ? new Date(tx.preOrderDate) : null,
              preOrderConfirmed: isPreOrderConfirmed,
              discountAmount: discountAmount,
              createdAt: new Date(tx.createdAt),
              
              items: {
                create: resolvedItems
              },

              payments: {
                create: [{
                    paymentType: validPaymentType,
                    amount: incomingPayment.paidAmount,
                    paymentStatus: incomingPayment.paymentStatus
                }]
              }
            }
          });
          
          const stockByProduct = new Map();
          for (const item of resolvedItems) {
              stockByProduct.set(item.productId, (stockByProduct.get(item.productId) || 0) + item.qty);
          }

          for (const [serverProductId, qty] of stockByProduct.entries()) {
              const product = await syncTx.product.findUnique({ where: { id: serverProductId } });
              if (!product) throw new Error(`Produk ${serverProductId} tidak ditemukan di server.`);

              if (!product.isUnlimitedStock) {
                  const stockUpdate = await syncTx.product.updateMany({
                      where: { id: serverProductId, stock: { gte: qty }, isUnlimitedStock: false },
                      data: { stock: { decrement: qty } }
                  });
                  if (stockUpdate.count !== 1) {
                      throw new Error(`Stok ${product.name} tidak mencukupi.`);
                  }
              }

              await syncTx.stockMovement.create({
                  data: {
                      productId: serverProductId,
                      type: 'OUT',
                      qty,
                      source: 'SALE',
                      description: `Penjualan offline via sync (INV: ${tx.invoiceNumber})`,
                      createdAt: new Date(tx.createdAt || Date.now())
                  }
              });
          }
          }, { isolationLevel: 'RepeatableRead' });
          savedTransactions++;
        }
        syncedTransactionIds.push(tx.id);
        } catch(txErr) {
            addSyncWarning('transaction', tx.id, txErr);
        }
      }
    }

    // B. Proses Expenses (Android id = Int lokal, bisa bentrok dg autoincrement server)
    if (expenses && Array.isArray(expenses)) {
        for (const exp of expenses) {
            try {
                // Dedup berdasarkan amount + createdAt karena id bisa bentrok
                const existsByContent = await prisma.expense.findFirst({
                    where: {
                        amount: Number(exp.amount),
                        createdAt: new Date(exp.createdAt)
                    }
                });
                if (!existsByContent) {
                    await prisma.expense.create({
                        data: {
                            description: exp.description,
                            amount: Number(exp.amount),
                            category: exp.category || "Umum",
                            type: exp.type === 'PURCHASE' ? 'PURCHASE' : 'EXPENSE',
                            createdAt: new Date(exp.createdAt)
                        }
                    });
                    savedExpenses++;
                }
                syncedExpenseIds.push(exp.id);
            } catch(expErr) {
                addSyncWarning('expense', exp.id, expErr);
            }
        }
    }

    // C. Proses Shifts (id = UUID string, aman)
    if (shifts && Array.isArray(shifts)) {
        for (const shift of shifts) {
            try {
                await prisma.$transaction(async (tx) => {
                    const exists = await tx.shift.findUnique({ where: { id: shift.id }});
                    if (!exists) {
                        const incomingStatus = shift.status === 'CLOSED' ? 'CLOSED' : 'OPEN';
                        if (incomingStatus === 'OPEN') {
                            const otherOpenShift = await tx.shift.findFirst({
                                where: { status: 'OPEN', id: { not: shift.id } },
                                orderBy: { openedAt: 'desc' }
                            });
                            if (otherOpenShift) {
                                throw new Error(`SHIFT_ALREADY_OPEN:${otherOpenShift.id}`);
                            }
                        }
                        await tx.shift.create({
                            data: {
                                id: shift.id,
                                userId: req.user.id,
                                userName: syncUser?.name || shift.userName || 'Kasir',
                                openedAt: new Date(shift.openedAt),
                                expectedCloseAt: shift.expectedCloseAt ? new Date(shift.expectedCloseAt) : null,
                                closedAt: shift.closedAt ? new Date(shift.closedAt) : null,
                                openingCash: Number(shift.openingCash || 0),
                                closingCash: shift.closingCash == null ? null : Number(shift.closingCash),
                                status: incomingStatus
                            }
                        });
                    } else if (shift.status === 'CLOSED' && exists.status === 'OPEN') {
                        await tx.shift.update({
                            where: { id: shift.id },
                            data: {
                                status: 'CLOSED',
                                closedAt: shift.closedAt ? new Date(shift.closedAt) : new Date(),
                                closingCash: shift.closingCash == null ? null : Number(shift.closingCash)
                            }
                        });
                    }
                }, { isolationLevel: 'RepeatableRead' });
                savedShifts++;
                syncedShiftIds.push(shift.id);
            } catch(shiftErr) {
                addSyncWarning('shift', shift.id, shiftErr);
            }
        }
    }

    // D. Proses Stock Receipts
    if (stockReceipts && Array.isArray(stockReceipts)) {
        for (const receipt of stockReceipts) {
          try {
            const exists = await prisma.stockReceipt.findUnique({ where: { id: receipt.id }});
            if (!exists) {
                // Buat stock receipt header
                await prisma.stockReceipt.create({
                    data: {
                        id: receipt.id,
                        receivedAt: new Date(receipt.receivedAt),
                        notes: receipt.notes || 'Sync dari Android',
                        createdBy: receipt.createdBy || req.user.name,
                        items: {
                            create: await Promise.all((receipt.items || []).map(async item => {
                                let serverProductId = item.serverProductId ? parseInt(item.serverProductId) : null;
                                if (!serverProductId) {
                                    const parsedId = parseInt(item.productId);
                                    serverProductId = parsedId;
                                    if(!isNaN(parsedId)) {
                                        const product = await prisma.product.findUnique({ where: { androidId: parsedId }});
                                        serverProductId = product ? product.id : parsedId;
                                    }
                                }
                                return {
                                    productId: serverProductId,
                                    productName: item.productName || null,
                                    quantityBefore: parseInt(item.quantityBefore) || 0,
                                    quantityAdded: parseInt(item.quantityAdded) || 0,
                                    costPrice: Number(item.costPrice || 0)
                                };
                            }))
                        }
                    }
                });

                // Update stock and create Stock Movement
                for (const item of (receipt.items || [])) {
                    let serverProductId = item.serverProductId ? parseInt(item.serverProductId) : null;
                    if (!serverProductId) {
                        const parsedId = parseInt(item.productId);
                        serverProductId = parsedId;
                        if(!isNaN(parsedId)) {
                            const product = await prisma.product.findUnique({ where: { androidId: parsedId }});
                            serverProductId = product ? product.id : parsedId;
                        }
                    }
                    const qtyAdded = parseInt(item.quantityAdded) || 0;
                    if(qtyAdded !== 0) {
                        await prisma.product.update({
                            where: { id: serverProductId },
                            data: { stock: { increment: qtyAdded } }
                        });
                        await prisma.stockMovement.create({
                            data: {
                                productId: serverProductId,
                                type: qtyAdded > 0 ? 'IN' : 'OUT',
                                qty: Math.abs(qtyAdded),
                                source: 'ADJUSTMENT',
                                description: `Stock Opname/Receipt via Android Offline Sync`,
                                createdAt: new Date(receipt.receivedAt)
                            }
                        });
                    }
                }
                savedStockReceipts++;
            }
            syncedStockReceiptIds.push(receipt.id);
          } catch(receiptErr) {
              addSyncWarning('stockReceipt', receipt.id, receiptErr);
          }
        }
    }

    // E. Proses Suppliers dari Android
    const supplierIdMap = [];
    if (pushSuppliers && Array.isArray(pushSuppliers)) {
        for (const supp of pushSuppliers) {
            try {
                let serverSupp = await prisma.supplier.findUnique({ where: { androidId: supp.id }});
                if (!serverSupp) {
                    serverSupp = await prisma.supplier.create({
                        data: {
                            androidId: supp.id,
                            name: supp.name,
                            phone: supp.phone || null,
                            address: supp.address || null,
                            notes: supp.notes || null
                        }
                    });
                    savedSuppliers++;
                } else {
                    await prisma.supplier.update({
                        where: { id: serverSupp.id },
                        data: {
                            name: supp.name || serverSupp.name,
                            phone: supp.phone || serverSupp.phone,
                            address: supp.address || serverSupp.address,
                            notes: supp.notes || serverSupp.notes
                        }
                    });
                }
                supplierIdMap.push({ androidId: supp.id, serverId: serverSupp.id });
            } catch(e) { addSyncWarning('supplier', supp.id, e); }
        }
    }

    // F. Proses Packages dari Android
    const packageIdMap = [];
    if (pushPackages && Array.isArray(pushPackages)) {
        for (const pkg of pushPackages) {
            try {
                let serverPkg = await prisma.package.findUnique({ where: { androidId: pkg.id }});
                if (!serverPkg && pkg.serverId) {
                    serverPkg = await prisma.package.findUnique({ where: { id: parseInt(pkg.serverId) } });
                    if (serverPkg && serverPkg.androidId === null) {
                        serverPkg = await prisma.package.update({ where: { id: serverPkg.id }, data: { androidId: pkg.id } });
                    }
                }
                if (!serverPkg) {
                    serverPkg = await prisma.package.create({
                        data: {
                            androidId: pkg.id,
                            name: pkg.name,
                            description: pkg.description || null,
                            price: Number(pkg.price),
                            imageUrl: pkg.imageUrl || null,
                            isActive: pkg.isActive === true || Number(pkg.isActive) === 1
                        }
                    });
                    savedPackages++;
                } else {
                    await prisma.package.update({
                        where: { id: serverPkg.id },
                        data: {
                            name: pkg.name || serverPkg.name,
                            description: pkg.description || serverPkg.description,
                            price: Number(pkg.price),
                            imageUrl: pkg.imageUrl || serverPkg.imageUrl,
                            isActive: pkg.isActive === true || Number(pkg.isActive) === 1
                        }
                    });
                }
                // Samakan isi paket agar item yang dihapus di Android ikut hilang di web.
                if (pkg.items && Array.isArray(pkg.items)) {
                    const mappedItems = [];
                    for (const item of pkg.items) {
                        let serverProductId = item.serverProductId ? parseInt(item.serverProductId) : null;
                        if (!serverProductId) {
                            const parsedProdId = parseInt(item.productId);
                            serverProductId = parsedProdId;
                            if (!isNaN(parsedProdId)) {
                                const product = await prisma.product.findUnique({ where: { androidId: parsedProdId }});
                                serverProductId = product ? product.id : parsedProdId;
                            }
                        }
                        const productExists = serverProductId
                            ? await prisma.product.findUnique({ where: { id: serverProductId }, select: { id: true } })
                            : null;
                        if (!productExists) throw new Error(`Produk paket ${item.productId} tidak ditemukan di server.`);
                        mappedItems.push({ packageId: serverPkg.id, productId: serverProductId, qty: parseInt(item.quantity) || 1 });
                    }
                    await prisma.$transaction([
                        prisma.packageItem.deleteMany({ where: { packageId: serverPkg.id } }),
                        ...mappedItems.map(data => prisma.packageItem.create({ data }))
                    ]);
                }
                packageIdMap.push({ androidId: pkg.id, serverId: serverPkg.id });
            } catch(e) { addSyncWarning('package', pkg.id, e); }
        }
    }

    // G. Proses Product Addons dari Android
    const addonIdMap = [];
    if (pushAddons && Array.isArray(pushAddons)) {
        for (const addon of pushAddons) {
            try {
                let serverProductId = addon.serverProductId ? parseInt(addon.serverProductId) : null;
                if (!serverProductId) {
                    const parsedProdId = parseInt(addon.productId);
                    serverProductId = parsedProdId;
                    if (!isNaN(parsedProdId)) {
                        const product = await prisma.product.findUnique({ where: { androidId: parsedProdId }});
                        serverProductId = product ? product.id : parsedProdId;
                    }
                }

                let serverAddon = await prisma.productAddon.findFirst({
                    where: { androidId: addon.id }
                });
                if (!serverAddon) {
                    serverAddon = await prisma.productAddon.create({
                        data: {
                            androidId: addon.id,
                            productId: serverProductId,
                            name: addon.name,
                            price: Number(addon.price || 0)
                        }
                    });
                    savedAddons++;
                } else {
                    await prisma.productAddon.update({
                        where: { id: serverAddon.id },
                        data: {
                            name: addon.name || serverAddon.name,
                            price: Number(addon.price || 0),
                            productId: serverProductId
                        }
                    });
                }
                addonIdMap.push({ androidId: addon.id, serverId: serverAddon.id });
            } catch(e) { addSyncWarning('addon', addon.id, e); }
        }
    }

    const supportsPartialSync = req.get('X-LitePOS-Sync-Version') === '2';
    if (syncWarnings.length > 0 && !supportsPartialSync) {
      return res.status(409).json({
        success: false,
        error: 'Sebagian data lokal belum dapat diproses. Perbarui aplikasi Android lalu ulangi sinkronisasi.',
        warnings: syncWarnings
      });
    }

    res.json({
      success: true,
      activeStore: { id: req.store.id, slug: req.store.slug, name: req.store.name, type: req.store.type },
      message: `Berhasil sinkronisasi. Transaksi: ${savedTransactions}, Produk: ${savedProducts}, Kategori: ${savedCategories}, Pelanggan: ${savedCustomers}, Supplier: ${savedSuppliers}, Paket: ${savedPackages}`,
      stats: { savedTransactions, savedExpenses, savedShifts, savedCategories, savedProducts, savedCustomers, savedStockReceipts, savedSuppliers, savedPackages, savedAddons },
      warnings: syncWarnings,
      syncedIds: {
          transactions: syncedTransactionIds,
          expenses: syncedExpenseIds,
          shifts: syncedShiftIds,
          stockReceipts: syncedStockReceiptIds
      },
      idMap: {
          categories: categoryIdMap,
          products: productIdMap,
          customers: customerIdMap,
          suppliers: supplierIdMap,
          packages: packageIdMap,
          addons: addonIdMap
      }
    });

  } catch (error) {
    console.error('[SYNC] pushLocalData gagal:', error);
    res.status(error.status || 500).json({
      success: false,
      code: error.code || 'SYNC_PUSH_FAILED',
      error: error.message,
      message: error.message,
    });
  } finally {
    if (releaseDataSync) releaseDataSync();
  }
};

/**
 * 3. GET TRANSACTION HISTORY
 * Mengembalikan histori transaksi 30 hari terakhir beserta items, payments,
 * expenses, dan shifts agar Android bisa menampilkan laporan lengkap.
 */
exports.getTransactionHistory = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Ambil transaksi 30 hari terakhir beserta items dan payments
    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo }
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, androidId: true, name: true } }
          }
        },
        payments: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Format untuk Android SQLite
    const formattedTransactions = transactions.map(tx => {
      const payment = summarizePayments(tx);
      const preferredPayment = tx.payments.find(item => !['FAILED', 'PENDING', 'UNPAID'].includes(
        String(item.paymentStatus || '').toUpperCase()
      )) || tx.payments[0];

      return {
        id: tx.androidId || `server-${tx.id}`,
        serverId: tx.id,
        invoiceNumber: tx.invoiceNumber,
        grandTotal: Number(tx.grandTotal),
        discountAmount: Number(tx.discountAmount),
        taxAmount: Number(tx.taxAmount),
        pointsEarned: tx.pointsEarned,
        pointsRedeemed: tx.pointsRedeemed,
        pointsBalanceAfter: tx.pointsBalanceAfter,
        loyaltyReversed: tx.loyaltyReversed,
        paymentMethod: preferredPayment?.paymentType || 'CASH',
        paymentStatus: payment.paymentStatus,
        paidAmount: payment.paidAmount,
        remainingAmount: payment.remainingAmount,
        paidAt: payment.paidAt,
        cashAmount: tx.cashAmount == null ? null : Number(tx.cashAmount),
        changeAmount: tx.changeAmount == null ? null : Number(tx.changeAmount),
        customerId: tx.customerId,
        customerName: tx.customerName,
        createdAt: tx.createdAt.toISOString(),
        status: tx.status,
        preOrderDate: tx.preOrderDate ? tx.preOrderDate.toISOString() : null,
        preOrderConfirmed: tx.preOrderConfirmed,
        orderType: tx.orderType,
        tableName: tx.tableNumber,
        items: tx.items.map(item => ({
          productId: item.product?.androidId || item.productId,
          serverProductId: item.productId,
          productName: item.product?.name || null,
          quantity: item.qty,
          price: Number(item.price),
          notes: item.notes
        }))
      };
    });

    // Ambil expenses 30 hari terakhir
    const expenses = await prisma.expense.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedExpenses = expenses.map(exp => ({
      id: exp.id,
      description: exp.description,
      amount: Number(exp.amount),
      category: exp.category,
      type: exp.type,
      createdAt: exp.createdAt.toISOString()
    }));

    // Ambil shifts 30 hari terakhir
    const shifts = await prisma.shift.findMany({
      where: {
        openedAt: { gte: thirtyDaysAgo }
      },
      orderBy: { openedAt: 'desc' }
    });

    const formattedShifts = shifts.map(s => ({
      id: s.id,
      userId: s.userId,
      userName: s.userName,
      openedAt: s.openedAt.toISOString(),
      expectedCloseAt: s.expectedCloseAt ? s.expectedCloseAt.toISOString() : null,
      closedAt: s.closedAt ? s.closedAt.toISOString() : null,
      openingCash: Number(s.openingCash),
      closingCash: s.closingCash ? Number(s.closingCash) : null,
      status: s.status
    }));

    console.log(`[SYNC] getTransactionHistory → transactions: ${formattedTransactions.length}, expenses: ${formattedExpenses.length}, shifts: ${formattedShifts.length}`);

    res.json({
      success: true,
      data: {
        activeStore: { id: req.store.id, slug: req.store.slug, name: req.store.name, type: req.store.type },
        transactions: formattedTransactions,
        expenses: formattedExpenses,
        shifts: formattedShifts
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
