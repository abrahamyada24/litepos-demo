const { basePrisma, prisma, runWithStore } = require('../config/prisma');
const midtransClient = require('midtrans-client');
const { getProductPrice } = require('../utils/productDiscount');
const { normalizePaymentType, resolvePaymentMethod } = require('../services/paymentMethodService');
const { resolveSelectedAddons, buildAddonItemNotes, calculateAddonAwareLinePricing } = require('../services/productAddonService');
const { calculateCheckoutTotals } = require('../services/checkoutTotalsService');
const { awardTransactionPoints, reverseTransactionPoints } = require('../services/transactionLoyaltyService');

const normalizeIdempotencyKey = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const key = String(value).trim();
    if (!/^[A-Za-z0-9._:-]{8,64}$/.test(key)) {
        const error = new Error('Idempotency key tidak valid.');
        error.code = 'INVALID_IDEMPOTENCY_KEY';
        throw error;
    }
    return key;
};

const idempotencyTransactionId = (storeId, key) => key ? `api:${storeId}:${key}` : null;

const findIdempotentTransaction = (clientTransactionId) => clientTransactionId
    ? prisma.transaction.findFirst({
        where: { androidId: clientTransactionId },
        include: { items: true, payments: true }
    })
    : null;

const sendTransactionResult = (res, transaction, replayed = false) => {
    res.set('Idempotency-Replayed', replayed ? 'true' : 'false');
    return res.status(replayed ? 200 : 201).json({
        success: true,
        message: replayed ? 'Transaksi sebelumnya ditemukan dan digunakan kembali.' : 'Transaksi berhasil dibuat!',
        idempotentReplay: replayed,
        data: transaction
    });
};

// Inisialisasi Midtrans Snap
const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY
});

/**
 * HELPER: Generate Invoice Number Otomatis dengan Suffix Unik
 * Menghindari error 'Order ID already taken' di Midtrans.
 */
const generateInvoiceNumber = async (tx) => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}${mm}${dd}`;

    const lastTransaction = await tx.transaction.findFirst({
        where: { invoiceNumber: { contains: `INV/${todayStr}` } },
        orderBy: { id: 'desc' }
    });

    let sequence = 1;
    if (lastTransaction) {
        const parts = lastTransaction.invoiceNumber.split('/');
        if (parts.length >= 3) {
            const cleanSeq = parts[2].split('-')[0];
            sequence = parseInt(cleanSeq) + 1;
        }
    }

    const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `INV/${todayStr}/${String(sequence).padStart(4, '0')}-${randomSuffix}`;
};

/**
 * 1. CREATE TRANSACTION (CHECKOUT)
 */
exports.createTransaction = async (req, res) => {
    let clientTransactionId = null;
    try {
        const idempotencyKey = normalizeIdempotencyKey(
            req.get('Idempotency-Key') || req.body?.idempotencyKey
        );
        clientTransactionId = idempotencyTransactionId(req.storeId, idempotencyKey);

        const existingTransaction = await findIdempotentTransaction(clientTransactionId);
        if (existingTransaction) return sendTransactionResult(res, existingTransaction, true);

        const {
            userId, customerId, customerName, items, payment,
            orderType, note,
            preOrderDate, discountAmount, discountType,
            loyaltyPointsRedeemed
        } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: "Keranjang kosong!" });
        }

        const requestedPaymentType = normalizePaymentType(payment?.type);
        if (!requestedPaymentType) {
            return res.status(400).json({ success: false, message: "Metode pembayaran wajib dipilih." });
        }

        const result = await prisma.$transaction(async (tx) => {
            if (clientTransactionId) {
                const existing = await tx.transaction.findFirst({
                    where: { androidId: clientTransactionId },
                    include: { items: true, payments: true }
                });
                if (existing) return { transaction: existing, replayed: true };
            }

            if (customerId) {
                const customer = await tx.customer.findUnique({ where: { id: parseInt(customerId) } });
                if (!customer) throw new Error('Pelanggan tidak tersedia pada usaha aktif.');
            }
            const setting = await tx.storeSetting.findFirst();
            const { paymentType, isGatewayPayment, isInstantPayment } = resolvePaymentMethod(
                requestedPaymentType,
                { midtransEnabled: setting?.enableQris === true }
            );
            const shiftEnabled = setting?.enableShift !== false;
            const activeShift = shiftEnabled
                ? await tx.shift.findFirst({
                    where: { status: 'OPEN' },
                    orderBy: { openedAt: 'desc' }
                })
                : null;

            if (shiftEnabled && !activeShift) {
                const shiftError = new Error('Buka shift terlebih dahulu sebelum memproses transaksi.');
                shiftError.code = 'SHIFT_REQUIRED';
                throw shiftError;
            }

            let subTotal = 0;
            const transactionItemsData = [];
            const itemDetailsForMidtrans = [];
            const stockDeductions = new Map();
            const addStockDeduction = (product, qty) => {
                const current = stockDeductions.get(product.id);
                stockDeductions.set(product.id, { product, qty: (current?.qty || 0) + qty });
            };

            // Validasi produk dan hitung total
            for (const item of items) {
                const requestedQty = Math.max(1, parseInt(item.qty) || 1);
                const packageId = parseInt(item.packageId) || (String(item.productId || '').startsWith('pkg-') ? parseInt(String(item.productId).replace('pkg-', '')) : null);

                if (packageId) {
                    const pkg = await tx.package.findUnique({
                        where: { id: packageId },
                        include: { items: { include: { product: true } } }
                    });
                    if (!pkg || !pkg.isActive || pkg.items.length === 0) throw new Error('Paket produk tidak tersedia.');

                    const packagePrice = Number(pkg.price);
                    subTotal += packagePrice * requestedQty;
                    pkg.items.forEach((packageItem, index) => {
                        const componentQty = packageItem.qty * requestedQty;
                        addStockDeduction(packageItem.product, componentQty);
                        transactionItemsData.push({
                            productId: packageItem.productId,
                            qty: componentQty,
                            price: index === 0 ? packagePrice / packageItem.qty : 0,
                            originalPrice: index === 0 ? packagePrice / packageItem.qty : 0,
                            discountAmount: 0,
                            costPrice: packageItem.product.costPrice,
                            notes: `[Paket ${pkg.name}] ${item.notes || ''}`.trim()
                        });
                    });
                    itemDetailsForMidtrans.push({ id: `PKG-${pkg.id}`, price: Math.round(packagePrice), quantity: requestedQty, name: pkg.name.substring(0, 50) });
                    continue;
                }

                const product = await tx.product.findUnique({
                    where: { id: parseInt(item.productId) },
                    include: { addons: true }
                });

                if (!product || !product.isActive) {
                    throw new Error(`Produk tidak valid.`);
                }
                // Skip stock check for unlimited stock products
                if (!product.isUnlimitedStock && product.stock < requestedQty) {
                    throw new Error(`Stok ${product.name} tidak mencukupi.`);
                }

                const priceInfo = getProductPrice(product);
                const selectedAddons = resolveSelectedAddons(
                    product.addons,
                    item.addons ?? item.addonSelections ?? item.addonIds,
                    product.name
                );
                const { lineTotal, price, originalPrice } = calculateAddonAwareLinePricing(priceInfo, selectedAddons, requestedQty);
                const itemNotes = buildAddonItemNotes(selectedAddons, item.notes);
                subTotal += lineTotal;
                addStockDeduction(product, requestedQty);

                transactionItemsData.push({
                    productId: product.id,
                    qty: requestedQty,
                    price,
                    originalPrice,
                    discountAmount: priceInfo.discountAmount,
                    costPrice: product.costPrice,
                    notes: itemNotes
                });

                itemDetailsForMidtrans.push({
                    id: product.sku || product.id.toString(),
                    price: Math.round(lineTotal),
                    quantity: 1,
                    name: product.name.substring(0, 50)
                });
            }

            for (const { product, qty } of stockDeductions.values()) {
                if (!product.isUnlimitedStock && product.stock < qty) {
                    throw new Error(`Stok ${product.name} tidak mencukupi.`);
                }
            }

            // Hitung pajak
            const taxRate = setting?.taxRate ? Number(setting.taxRate) / 100 : 0;

            // Loyalty points redemption discount
            let loyaltyDiscount = 0;
            const redeemedPoints = Number(loyaltyPointsRedeemed || 0);
            if (!Number.isSafeInteger(redeemedPoints) || redeemedPoints < 0) throw new Error('Jumlah poin penukaran tidak valid.');
            if (redeemedPoints > 0) {
                if (!customerId || !isInstantPayment) throw new Error('Penukaran poin membutuhkan member dan pembayaran manual yang langsung lunas.');
                const loyaltyConfig = await tx.loyaltyConfig.findFirst({ where: { isActive: true } });
                const customer = await tx.customer.findUnique({ where: { id: parseInt(customerId) } });
                if (!loyaltyConfig || !customer || customer.points < redeemedPoints || redeemedPoints < loyaltyConfig.minRedemptionPoints) throw new Error('Poin tidak mencukupi atau belum memenuhi minimum penukaran.');
                loyaltyDiscount = redeemedPoints * Number(loyaltyConfig.pointValue);
                const manual = calculateCheckoutTotals({ subTotal, taxRate, discountAmount, discountType });
                if (loyaltyDiscount > subTotal - manual.discount) throw new Error('Nilai penukaran poin melebihi sisa tagihan.');
            }
            const { discount, taxAmount, grandTotal } = calculateCheckoutTotals({ subTotal, taxRate, discountAmount, discountType, loyaltyDiscount });

            // Generate Invoice unik
            const invoiceNumber = await generateInvoiceNumber(tx);

            // Tambahkan pajak ke item details Midtrans
            if (taxAmount > 0) {
                itemDetailsForMidtrans.push({
                    id: 'TAX-PPN',
                    price: taxAmount,
                    quantity: 1,
                    name: `Pajak (PPN ${setting.taxRate || 0}%)`
                });
            }
            if (discount > 0) itemDetailsForMidtrans.push({ id: 'DISCOUNT', price: -discount, quantity: 1, name: 'Diskon transaksi' });

            const initialStatus = isInstantPayment ? 'PAID' : 'PENDING';
            const paymentStatus = isInstantPayment ? 'SETTLEMENT' : 'PENDING';

            // Pembayaran manual langsung dikonfirmasi kasir dan mengurangi stok.
            if (isInstantPayment) {
                for (const { product, qty } of stockDeductions.values()) {
                    // Skip stock deduction for unlimited stock products
                    if (!product.isUnlimitedStock) {
                        // Pengurangan atomik tetap mencegah overselling ketika dua
                        // kasir checkout bersamaan pada isolation level TiDB.
                        const stockUpdate = await tx.product.updateMany({
                            where: {
                                id: product.id,
                                isUnlimitedStock: false,
                                stock: { gte: qty }
                            },
                            data: { stock: { decrement: qty } }
                        });
                        if (stockUpdate.count !== 1) {
                            throw new Error(`Stok ${product.name} tidak mencukupi.`);
                        }
                    }

                    await tx.stockMovement.create({
                        data: {
                            productId: product.id,
                            type: 'OUT',
                            qty,
                            source: 'SALE',
                            description: `Penjualan ${paymentType} - ${invoiceNumber}`
                        }
                    });
                }
            }

            // Buat transaksi
            const newTransaction = await tx.transaction.create({
                data: {
                    androidId: clientTransactionId,
                    shiftId: activeShift?.id || null,
                    userId: req.user.id,
                    customerId: customerId ? parseInt(customerId) : null,
                    customerName: customerName || null,
                    invoiceNumber,
                    subTotal,
                    taxAmount,
                    discountAmount: discount,
                    grandTotal,
                    cashAmount: payment.cashAmount != null ? parseFloat(payment.cashAmount) : null,
                    changeAmount: payment.changeAmount != null ? parseFloat(payment.changeAmount) : null,
                    status: initialStatus,
                    workStatus: req.store?.type === 'LAUNDRY' ? 'RECEIVED' : null,
                    orderType: orderType === 'PRE_ORDER' || preOrderDate ? 'PRE_ORDER' : 'TAKE_AWAY',
                    tableNumber: null,
                    note: note || null,
                    preOrderDate: preOrderDate ? new Date(preOrderDate) : null,
                    preOrderConfirmed: false,
                    items: { create: transactionItemsData },
                    payments: {
                        create: {
                            paymentType,
                            amount: grandTotal,
                            paymentStatus: paymentStatus
                        }
                    }
                },
                include: { items: true, payments: true }
            });

            const loyaltySnapshot = await awardTransactionPoints(tx, newTransaction, redeemedPoints);
            if (loyaltySnapshot) Object.assign(newTransaction, loyaltySnapshot);

            let midtransToken = null;
            let midtransUrl = null;

            // Hanya QRIS otomatis yang boleh membuat transaksi Midtrans.
            if (isGatewayPayment) {
                const parameter = {
                    transaction_details: {
                        order_id: invoiceNumber,
                        gross_amount: Math.round(grandTotal)
                    },
                    item_details: itemDetailsForMidtrans,
                    credit_card: { secure: true },
                    enabled_payments: ['gopay', 'other_qris', 'shopeepay']
                };

                try {
                    const transaction = await snap.createTransaction(parameter);
                    midtransToken = transaction.token;
                    midtransUrl = transaction.redirect_url;

                    console.log('[OK] Midtrans transaction created:', invoiceNumber);
                } catch (midtransErr) {
                    console.error('[ERROR] Midtrans Error:', midtransErr.message);
                    throw new Error(`Gagal membuat payment link: ${midtransErr.message}`);
                }
            }

            return {
                transaction: { ...newTransaction, midtransToken, midtransUrl },
                replayed: false
            };
        }, {
            timeout: 10000,
            // TiDB menggunakan Snapshot Isolation yang diekspos sebagai
            // REPEATABLE READ dan menolak SERIALIZABLE.
            isolationLevel: 'RepeatableRead'
        });

        return sendTransactionResult(res, result.transaction, result.replayed);

    } catch (error) {
        // Dua request dengan key yang sama dapat tiba bersamaan. Constraint
        // unik androidId membuat hanya satu transaksi yang commit; request lain
        // mengembalikan hasil yang sudah tersimpan tanpa mengulang efek samping.
        if (error.code === 'P2002' && clientTransactionId) {
            const existingTransaction = await findIdempotentTransaction(clientTransactionId);
            if (existingTransaction) return sendTransactionResult(res, existingTransaction, true);
        }
        console.error('[ERROR] Transaction Error:', error.message);
        const isTransactionConflict = error.code === 'P2034';
        const isDatabaseError = String(error.code || '').startsWith('P')
            || /error in connector|error querying the database|can't reach database server/i.test(String(error.message || ''));
        const status = error.code === 'INVALID_IDEMPOTENCY_KEY'
            ? 400
            : error.code === 'SHIFT_REQUIRED'
            ? 409
            : isTransactionConflict
                ? 409
                : isDatabaseError
                    ? 503
                    : 400;
        const publicMessage = isTransactionConflict
            ? 'Transaksi berbenturan dengan perubahan lain. Periksa stok lalu coba kembali.'
            : isDatabaseError
                ? 'Database sedang tidak siap memproses transaksi. Coba kembali beberapa saat lagi.'
                : error.message;

        res.status(status).json({
            success: false,
            code: isTransactionConflict ? 'TRANSACTION_CONFLICT' : (isDatabaseError ? 'DATABASE_UNAVAILABLE' : (error.code || 'TRANSACTION_FAILED')),
            message: publicMessage
        });
    }
};

/**
 * 2. GET ALL TRANSACTIONS
 */
exports.getAllTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search, preOrder, startDate, endDate } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const whereClause = {};

        if (status) whereClause.status = status;
        if (search) whereClause.invoiceNumber = { contains: search };
        if (preOrder === 'true') whereClause.preOrderDate = { not: null };
        if (startDate && endDate) {
            whereClause.createdAt = {
                gte: new Date(startDate + 'T00:00:00'),
                lte: new Date(endDate + 'T23:59:59')
            };
        }

        const [transactions, total] = await prisma.$transaction([
            prisma.transaction.findMany({
                where: whereClause,
                include: {
                    user: { select: { name: true } },
                    customer: { select: { name: true } },
                    payments: true
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.transaction.count({ where: whereClause })
        ]);

        res.json({
            success: true,
            data: transactions,
            meta: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('[ERROR] Get Transactions Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * 3. GET TRANSACTION BY ID
 */
exports.getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await prisma.transaction.findUnique({
            where: { id: parseInt(id) },
            include: {
                user: { select: { name: true } },
                customer: { select: { name: true, phone: true } },
                items: { include: { product: { select: { name: true, sku: true } } } },
                payments: true
            }
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaksi tidak ditemukan"
            });
        }

        const storeSettings = await prisma.storeSetting.findFirst();
        res.json({
            success: true,
            data: transaction,
            store: storeSettings
        });
    } catch (error) {
        console.error('[ERROR] Get Transaction Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateWorkStatus = async (req, res) => {
    try {
        if (req.store?.type !== 'LAUNDRY') {
            return res.status(400).json({ success: false, message: 'Status pengerjaan hanya tersedia untuk usaha laundry.' });
        }
        const workStatus = String(req.body?.workStatus || '').toUpperCase();
        const allowed = ['RECEIVED', 'PROCESSING', 'READY', 'PICKED_UP'];
        if (!allowed.includes(workStatus)) {
            return res.status(400).json({ success: false, message: 'Status pengerjaan tidak valid.' });
        }
        const existing = await prisma.transaction.findUnique({ where: { id: Number(req.params.id) } });
        if (!existing) return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
        const transaction = await prisma.transaction.update({
            where: { id: existing.id },
            data: { workStatus }
        });
        return res.json({ success: true, message: 'Status pengerjaan diperbarui.', data: transaction });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 4. WEBHOOK HANDLER - PENTING: Ini yang sinkronkan status payment
 */
exports.handleMidtransNotification = async (req, res) => {
    try {
        console.log('[WEBHOOK] Midtrans notification received');
        console.log("Body:", JSON.stringify(req.body, null, 2));

        const notification = await snap.transaction.notification(req.body);
        const orderId = notification.order_id;
        const transactionStatus = notification.transaction_status;
        const fraudStatus = notification.fraud_status;
        const transactionId = notification.transaction_id;

        console.log(`[WEBHOOK] Order: ${orderId} | Status: ${transactionStatus} | Fraud: ${fraudStatus}`);

        // Invoice bersifat unik global; lookup awal hanya dipakai untuk menemukan konteks store.
        const locator = await basePrisma.transaction.findUnique({
            where: { invoiceNumber: orderId },
            select: { storeId: true }
        });
        if (!locator) {
            console.error('[ERROR] Transaction not found:', orderId);
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }
        const transaction = await runWithStore(locator.storeId, () => prisma.transaction.findUnique({
            where: { invoiceNumber: orderId },
            include: { items: true, payments: true }
        }));

        if (!transaction) {
            console.error('[ERROR] Transaction not found:', orderId);
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        // Mapping status
        let newStatus = '';
        let paymentStatus = '';

        if (transactionStatus === 'capture') {
            if (fraudStatus === 'challenge') {
                newStatus = 'PENDING';
                paymentStatus = 'PENDING';
            } else if (fraudStatus === 'accept') {
                newStatus = 'PAID';
                paymentStatus = 'SETTLEMENT';
            }
        } else if (transactionStatus === 'settlement') {
            newStatus = 'PAID';
            paymentStatus = 'SETTLEMENT';
        } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
            newStatus = 'CANCELLED';
            paymentStatus = 'FAILED';
        } else if (transactionStatus === 'pending') {
            newStatus = 'PENDING';
            paymentStatus = 'PENDING';
        }

        if (!newStatus) {
            console.log('[WARN] Unknown status, skipping update');
            return res.status(200).json({ status: 'OK', message: 'Unknown status' });
        }

        // Update database dalam satu transaksi
        await runWithStore(locator.storeId, () => prisma.$transaction(async (tx) => {
            const current = await tx.transaction.findUnique({ where: { id: transaction.id } });
            if (!current || ['RETURNED', 'CANCELLED', 'COMPLETED'].includes(current.status)) return;
            if (current.status === 'PAID' && newStatus === 'PENDING') return;
            const changed = await tx.transaction.updateMany({
                where: { id: current.id, status: current.status },
                data: { status: newStatus }
            });
            if (changed.count !== 1) return;
            if (newStatus === 'PAID') await awardTransactionPoints(tx, { ...current, status: newStatus });
            if (newStatus === 'CANCELLED') await reverseTransactionPoints(tx, current);

            // Update payment status - PERBAIKAN QUERY
            await tx.payment.updateMany({
                where: { transactionId: transaction.id },
                data: {
                    paymentStatus: paymentStatus,
                    referenceId: transactionId
                }
            });

            // JIKA PAID, KURANGI STOCK (untuk non-CASH payment)
            if (newStatus === 'PAID' && current.status !== 'PAID') {
                console.log('[OK] Payment confirmed! Reducing stock...');

                for (const item of transaction.items) {
                    const product = await tx.product.findUnique({
                        where: { id: item.productId }
                    });

                    if (product) {
                        await tx.product.update({
                            where: { id: item.productId },
                            data: { stock: product.stock - item.qty }
                        });

                        await tx.stockMovement.create({
                            data: {
                                productId: item.productId,
                                type: 'OUT',
                                qty: item.qty,
                                source: 'SALE',
                                description: `Penjualan QRIS/Digital - ${orderId}`
                            }
                        });

                        console.log(`  [OK] ${product.name}: ${product.stock} -> ${product.stock - item.qty}`);
                    }
                }
            }

            // JIKA CANCELLED/EXPIRED, CEK APAKAH PERLU ROLLBACK STOCK
            if (newStatus === 'CANCELLED' && current.status === 'PAID') {
                console.log('[INFO] Transaction cancelled after payment, restoring stock...');

                // Cari stock movements yang terkait
                const movements = await tx.stockMovement.findMany({
                    where: {
                        description: { contains: orderId },
                        type: 'OUT'
                    }
                });

                for (const movement of movements) {
                    const product = await tx.product.findUnique({
                        where: { id: movement.productId }
                    });

                    if (product) {
                        await tx.product.update({
                            where: { id: movement.productId },
                            data: { stock: product.stock + movement.qty }
                        });

                        await tx.stockMovement.create({
                            data: {
                                productId: movement.productId,
                                type: 'IN',
                                qty: movement.qty,
                                source: 'RETURN',
                                description: `Rollback pembatalan - ${orderId}`
                            }
                        });

                        console.log(`  [OK] Restored ${product.name}: ${product.stock} -> ${product.stock + movement.qty}`);
                    }
                }
            }
        }));

        console.log(`[OK] [WEBHOOK] Invoice ${orderId} updated: ${newStatus}`);
        res.status(200).json({ status: 'OK' });

    } catch (error) {
        console.error('[ERROR] [WEBHOOK]:', error.message);
        console.error(error.stack);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 5. CHECK STATUS MANUAL (untuk debugging)
 */
exports.checkTransactionStatus = async (req, res) => {
    try {
        const { invoiceNumber } = req.params;

        // Check di Midtrans
        const statusResponse = await snap.transaction.status(invoiceNumber);
        console.log('Midtrans Status:', statusResponse);

        // Update database
        const transaction = await prisma.transaction.findUnique({
            where: { invoiceNumber: invoiceNumber },
            include: { payments: true, items: true }
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaksi tidak ditemukan'
            });
        }

        let newStatus = '';
        let paymentStatus = '';

        if (statusResponse.transaction_status === 'settlement') {
            newStatus = 'PAID';
            paymentStatus = 'SETTLEMENT';
        } else if (statusResponse.transaction_status === 'pending') {
            newStatus = 'PENDING';
            paymentStatus = 'PENDING';
        } else if (['cancel', 'deny', 'expire'].includes(statusResponse.transaction_status)) {
            newStatus = 'CANCELLED';
            paymentStatus = 'FAILED';
        }

        if (newStatus && transaction.status !== newStatus) {
            await prisma.$transaction(async (tx) => {
                const current = await tx.transaction.findUnique({ where: { id: transaction.id } });
                if (!current || ['RETURNED', 'CANCELLED', 'COMPLETED'].includes(current.status)) return;
                if (current.status === 'PAID' && newStatus === 'PENDING') return;
                const changed = await tx.transaction.updateMany({
                    where: { id: current.id, status: current.status },
                    data: { status: newStatus }
                });
                if (changed.count !== 1) return;
                if (newStatus === 'PAID') await awardTransactionPoints(tx, { ...current, status: newStatus });
                if (newStatus === 'CANCELLED') await reverseTransactionPoints(tx, current);

                await tx.payment.updateMany({
                    where: { transactionId: transaction.id },
                    data: {
                        paymentStatus: paymentStatus,
                        referenceId: statusResponse.transaction_id
                    }
                });

                // Kurangi stock jika baru jadi PAID
                if (newStatus === 'PAID' && current.status !== 'PAID') {
                    for (const item of transaction.items) {
                        const product = await tx.product.findUnique({
                            where: { id: item.productId }
                        });

                        if (product) {
                            await tx.product.update({
                                where: { id: item.productId },
                                data: { stock: product.stock - item.qty }
                            });

                            await tx.stockMovement.create({
                                data: {
                                    productId: item.productId,
                                    type: 'OUT',
                                    qty: item.qty,
                                    source: 'SALE',
                                    description: `Manual Check - ${invoiceNumber}`
                                }
                            });
                        }
                    }
                }
            });
        }

        res.json({
            success: true,
            message: 'Status checked and updated',
            data: {
                midtransStatus: statusResponse.transaction_status,
                databaseStatus: newStatus,
                updated: transaction.status !== newStatus
            }
        });

    } catch (error) {
        console.error('[ERROR] Check Status Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * 6. RETURN TRANSACTION — Mark as RETURNED and revert stock
 */
exports.returnTransaction = async (req, res) => {
    try {
        const { id } = req.params;

        const transaction = await prisma.transaction.findUnique({
            where: { id: parseInt(id) },
            include: { items: true }
        });

        if (!transaction) {
            return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan" });
        }

        if (transaction.status === 'RETURNED') {
            return res.status(400).json({ success: false, message: "Transaksi sudah diretur" });
        }

        if (transaction.status === 'CANCELLED') {
            return res.status(400).json({ success: false, message: "Tidak bisa meretur transaksi yang sudah dibatalkan" });
        }

        await prisma.$transaction(async (tx) => {
            // Update transaction status
            const changed = await tx.transaction.updateMany({
                where: { id: parseInt(id), status: { in: ['PAID', 'COMPLETED'] } },
                data: { status: 'RETURNED' }
            });
            if (changed.count !== 1) throw new Error('Hanya transaksi lunas yang dapat diretur atau transaksi sudah diproses.');
            await reverseTransactionPoints(tx, transaction);

            // Revert stock
            for (const item of transaction.items) {
                const product = await tx.product.findUnique({ where: { id: item.productId } });
                if (product && !product.isUnlimitedStock) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: product.stock + item.qty }
                    });
                }

                await tx.stockMovement.create({
                    data: {
                        productId: item.productId,
                        type: 'IN',
                        qty: item.qty,
                        source: 'RETURN',
                        description: `Retur transaksi - ${transaction.invoiceNumber}`
                    }
                });
            }

        });

        res.json({ success: true, message: "Transaksi berhasil diretur, stok dikembalikan" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * 7. GET PRE-ORDERS — List upcoming pre-orders
 */
exports.getPreOrders = async (req, res) => {
    try {
        const preOrders = await prisma.transaction.findMany({
            where: {
                preOrderDate: { not: null },
                preOrderConfirmed: false,
                status: { in: ['PENDING', 'PAID', 'COMPLETED'] }
            },
            include: {
                user: { select: { name: true } },
                customer: { select: { name: true, phone: true } },
                items: { include: { product: { select: { name: true } } } }
            },
            orderBy: { preOrderDate: 'asc' }
        });

        res.json({ success: true, data: preOrders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * 8. CONFIRM PRE-ORDER PICKUP
 */
exports.confirmPreOrder = async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.transaction.update({
            where: { id: parseInt(id) },
            data: { preOrderConfirmed: true, status: 'COMPLETED' }
        });

        res.json({ success: true, message: "Pre-order confirmed as picked up" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = exports;
