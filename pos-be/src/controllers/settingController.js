const { prisma } = require('../config/prisma');
const { normalizeShiftReminderSettings } = require('../services/shiftReminderService');
const { getUploadedFileUrl } = require('../utils/uploadedFileUrl');

/**
 * 1. GET SETTINGS
 * Mengambil konfigurasi toko. Jika data belum ada (instalasi baru),
 * maka sistem akan otomatis membuat satu record default.
 */
exports.getSettings = async (req, res) => {
  try {
    let setting = await prisma.storeSetting.findFirst();

    if (!setting) {
      // Buat pengaturan awal jika database masih kosong
      setting = await prisma.storeSetting.create({
        data: {
          storeName: "Warna Warni",
          taxRate: 11,
          serviceCharge: 0,
          enableCash: true,
          enableQris: false,
          autoPrintReceipt: true
        }
      });
    }

    // Konfigurasi fitur harus selalu aktual karena dipakai untuk membentuk menu.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.json({ success: true, data: { ...setting, enableDineTable: false } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 2. UPDATE SETTINGS
 * Mengupdate profil toko, kebijakan pajak, dan logo struk.
 */
exports.updateSettings = async (req, res) => {
  try {
    const {
      storeName, address, phone, email, website,
      taxRate, serviceCharge, receiptFooter,
      enableCash, enableQris, enableDebit, autoPrintReceipt,
      allowNegativeStock, showImages, theme
    } = req.body;

    const firstSetting = await prisma.storeSetting.findFirst();
    const id = firstSetting ? firstSetting.id : 0;

    const dataToUpdate = {};

    // Map data teks
    if (storeName) dataToUpdate.storeName = storeName;
    if (address) dataToUpdate.address = address;
    if (phone) dataToUpdate.phone = phone;
    if (email) dataToUpdate.email = email;
    if (website) dataToUpdate.website = website;
    if (receiptFooter !== undefined) dataToUpdate.receiptFooter = String(receiptFooter).trim();

    // Map data angka
    if (taxRate !== undefined) dataToUpdate.taxRate = parseFloat(taxRate);
    if (serviceCharge !== undefined) dataToUpdate.serviceCharge = parseFloat(serviceCharge);

    // Konversi string 'true'/'false' dari FormData menjadi Boolean murni
    if (enableCash !== undefined) dataToUpdate.enableCash = enableCash === 'true' || enableCash === true;
    if (enableQris !== undefined) dataToUpdate.enableQris = enableQris === 'true' || enableQris === true;
    if (enableDebit !== undefined) dataToUpdate.enableDebit = enableDebit === 'true' || enableDebit === true;
    if (autoPrintReceipt !== undefined) dataToUpdate.autoPrintReceipt = autoPrintReceipt === 'true' || autoPrintReceipt === true;

    // New PosAndroid integration toggles
    if (allowNegativeStock !== undefined) dataToUpdate.allowNegativeStock = allowNegativeStock === 'true' || allowNegativeStock === true;
    if (showImages !== undefined) dataToUpdate.showImages = showImages === 'true' || showImages === true;
    if (theme !== undefined) dataToUpdate.theme = theme;
    if (req.body.enablePreOrder !== undefined) dataToUpdate.enablePreOrder = req.body.enablePreOrder === 'true' || req.body.enablePreOrder === true;
    if (req.body.enableShift !== undefined) dataToUpdate.enableShift = req.body.enableShift === 'true' || req.body.enableShift === true;
    if (req.body.enableShiftReminder !== undefined) dataToUpdate.enableShiftReminder = req.body.enableShiftReminder === 'true' || req.body.enableShiftReminder === true;
    if (req.body.shiftDurationMinutes !== undefined) {
      const parsed = Number(req.body.shiftDurationMinutes);
      if (!Number.isFinite(parsed) || parsed < 30 || parsed > 2880) {
        return res.status(400).json({ success: false, message: 'Durasi shift harus antara 30 menit dan 48 jam.' });
      }
      dataToUpdate.shiftDurationMinutes = Math.round(parsed);
    }
    if (req.body.shiftReminderMinutes !== undefined) {
      const parsed = Number(req.body.shiftReminderMinutes);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 240) {
        return res.status(400).json({ success: false, message: 'Pengingat shift harus antara 0 dan 240 menit.' });
      }
      dataToUpdate.shiftReminderMinutes = Math.round(parsed);
    }
    if (req.body.shiftDayCutoff !== undefined) {
      const cutoff = String(req.body.shiftDayCutoff);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) {
        return res.status(400).json({ success: false, message: 'Jam pengingat pergantian hari tidak valid.' });
      }
      dataToUpdate.shiftDayCutoff = cutoff;
    }
    dataToUpdate.enableDineTable = false;
    if (req.body.takeawayOptions !== undefined) dataToUpdate.takeawayOptions = req.body.takeawayOptions;

    if (dataToUpdate.enableShift === false) {
      const activeShift = await prisma.shift.findFirst({
        where: { status: 'OPEN' },
        select: { id: true, userName: true }
      });
      if (activeShift) {
        return res.status(409).json({
          success: false,
          code: 'ACTIVE_SHIFT_MUST_BE_CLOSED',
          message: `Tutup shift aktif milik ${activeShift.userName} sebelum menonaktifkan fitur shift.`
        });
      }
    }

    /**
     * LOGIKA PENYIMPANAN LOGO LOKAL:
     * Menggunakan req.file.filename untuk mendapatkan nama file unik di folder uploads.
     */
    if (req.file) {
      dataToUpdate.logoUrl = getUploadedFileUrl(req.file);
    }

    // Upsert: Update jika ID ada, Create jika ID tidak ada (0)
    const updated = await prisma.storeSetting.upsert({
      where: { id: id },
      update: dataToUpdate,
      create: {
        storeName: storeName || "Savoria Bistro",
        ...dataToUpdate
      }
    });

    res.json({
      success: true,
      message: "Pengaturan berhasil disimpan",
      data: {
        ...updated,
        ...normalizeShiftReminderSettings(updated)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 3. GET LOYALTY CONFIG
 */
exports.getLoyaltyConfig = async (req, res) => {
  try {
    let config = await prisma.loyaltyConfig.findFirst();
    if (!config) {
        config = await prisma.loyaltyConfig.create({
            data: {
                pointMultiplier: 1,
                multiplierAmount: 10000,
                pointValue: 100,
                minRedemptionPoints: 10,
                isActive: true
            }
        });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 4. UPDATE LOYALTY CONFIG
 */
exports.updateLoyaltyConfig = async (req, res) => {
  try {
    const { pointMultiplier, multiplierAmount, pointValue, minRedemptionPoints, isActive } = req.body;
    
    let config = await prisma.loyaltyConfig.findFirst();
    const id = config ? config.id : 0;

    const data = {
        pointMultiplier: parseFloat(pointMultiplier),
        multiplierAmount: parseFloat(multiplierAmount),
        pointValue: parseFloat(pointValue),
        minRedemptionPoints: parseInt(minRedemptionPoints),
        isActive: isActive === true || isActive === 'true'
    };
    if (!Number.isInteger(data.pointMultiplier) || data.pointMultiplier < 1 ||
        !Number.isFinite(data.multiplierAmount) || data.multiplierAmount <= 0 ||
        !Number.isFinite(data.pointValue) || data.pointValue <= 0 ||
        !Number.isInteger(Number(minRedemptionPoints)) || data.minRedemptionPoints < 1) {
      return res.status(400).json({ success: false, message: 'Kelipatan belanja dan nilai poin harus lebih dari nol. Poin dan minimum penukaran harus bilangan bulat positif.' });
    }

    const updated = await prisma.loyaltyConfig.upsert({
        where: { id: id },
        update: data,
        create: data
    });

    res.json({ success: true, message: "Konfigurasi loyalitas disimpan", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
