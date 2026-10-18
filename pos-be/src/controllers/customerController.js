const { prisma } = require('../config/prisma');
const { getUploadedFileUrl } = require('../utils/uploadedFileUrl');
const { normalizeCustomerPhone, customerPhoneAliases } = require('../services/customerPhoneService');

const DISPLAY_TYPES = new Set(['normal', 'tall', 'wide', 'large']);
const optionalText = (value) => String(value || '').trim() || null;
const parseLoyaltyDiscount = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
};
const parsePoints = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

// Prefix tenant mencegah benturan dengan ID member milik usaha lain.
const generateMemberId = async (storeId) => {
  const prefix = `S${storeId}-MBR-`;
  const lastCustomer = await prisma.customer.findFirst({
    where: { memberId: { startsWith: prefix } },
    orderBy: { id: 'desc' }
  });

  let sequence = 1;
  if (lastCustomer && lastCustomer.memberId) {
    const lastSequence = Number(lastCustomer.memberId.slice(prefix.length));
    if (Number.isInteger(lastSequence)) sequence = lastSequence + 1;
  }
  return `${prefix}${String(sequence).padStart(4, '0')}`;
};

exports.getAllCustomers = async (req, res) => {
  try {
    const { search } = req.query;
    const whereClause = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { memberId: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } }
      ];
    }

    const customers = await prisma.customer.findMany({
      where: whereClause,
      include: {
        transactions: {
          where: { status: 'PAID' },
          select: { grandTotal: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedData = customers.map(cust => {
      const totalSpent = cust.transactions.reduce((sum, trx) => sum + Number(trx.grandTotal), 0);
      return {
        id: cust.id,
        memberId: cust.memberId,
        name: cust.name,
        phone: cust.phone,
        email: cust.email,
        notes: cust.notes,
        imageUrl: cust.imageUrl,
        displayType: cust.displayType,
        loyaltyDiscount: Number(cust.loyaltyDiscount || 0),
        points: cust.points,
        totalSpent: totalSpent,
        totalVisits: cust.transactions.length
      };
    });

    res.json({ success: true, data: formattedData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const { name, phone, email, notes, displayType, loyaltyDiscount, points } = req.body;
    const validName = name && String(name).trim();

    if (!validName) {
      return res.status(400).json({ success: false, message: "Nama pelanggan wajib diisi." });
    }

    /**
     * LOGIKA PENYIMPANAN LOKAL:
     * Menggunakan req.file.filename untuk menyimpan path relatif folder uploads.
     */
    const imageUrl = getUploadedFileUrl(req.file);
    const memberId = await generateMemberId(req.storeId);

    const validPhone = normalizeCustomerPhone(phone);
    const validEmail = email && String(email).trim() !== "" ? String(email).trim() : null;
    const validNotes = optionalText(notes);
    const validLoyaltyDiscount = parseLoyaltyDiscount(loyaltyDiscount);
    const validPoints = parsePoints(points);
    const validDisplayType = DISPLAY_TYPES.has(displayType) ? displayType : 'normal';

    if (validPhone && validPhone.length > 20) {
      return res.status(400).json({ success: false, message: "Nomor HP maksimal 20 karakter." });
    }
    if (validLoyaltyDiscount === null) {
      return res.status(400).json({ success: false, message: "Diskon pelanggan harus antara 0 sampai 100 persen." });
    }
    if (validPoints === null) {
      return res.status(400).json({ success: false, message: "Poin pelanggan harus berupa bilangan bulat positif." });
    }

    if (validPhone) {
      const exist = await prisma.customer.findFirst({ where: { phone: { in: customerPhoneAliases(validPhone) } } });
      if (exist) return res.status(400).json({ success: false, message: "Nomor HP sudah terdaftar!" });
    }

    const customer = await prisma.customer.create({
      data: {
        memberId,
        name: validName,
        phone: validPhone,
        email: validEmail,
        notes: validNotes,
        imageUrl,
        displayType: validDisplayType,
        loyaltyDiscount: validLoyaltyDiscount,
        points: validPoints
      }
    });

    res.status(201).json({ success: true, message: "Pelanggan berhasil ditambahkan", data: customer });
  } catch (error) {
    if (error.code === 'INVALID_PHONE') return res.status(400).json({ success: false, message: error.message });
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'Nomor HP sudah terdaftar.' });
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = parseInt(id);
    const { name, phone, email, notes, displayType, loyaltyDiscount, points } = req.body;

    const updateData = {};
    if (name !== undefined) {
      const validName = optionalText(name);
      if (!validName) return res.status(400).json({ success: false, message: "Nama pelanggan wajib diisi." });
      updateData.name = validName;
    }
    if (phone !== undefined) {
      const validPhone = normalizeCustomerPhone(phone);
      if (validPhone && validPhone.length > 20) {
        return res.status(400).json({ success: false, message: "Nomor HP maksimal 20 karakter." });
      }
      if (validPhone) {
        const duplicate = await prisma.customer.findFirst({ where: { phone: { in: customerPhoneAliases(validPhone) }, id: { not: customerId } } });
        if (duplicate) return res.status(400).json({ success: false, message: "Nomor HP sudah terdaftar!" });
      }
      updateData.phone = validPhone;
    }
    if (email !== undefined) updateData.email = optionalText(email);
    if (notes !== undefined) updateData.notes = optionalText(notes);
    if (displayType !== undefined) {
      if (!DISPLAY_TYPES.has(displayType)) return res.status(400).json({ success: false, message: "Tampilan kartu pelanggan tidak valid." });
      updateData.displayType = displayType;
    }
    if (loyaltyDiscount !== undefined) {
      const validLoyaltyDiscount = parseLoyaltyDiscount(loyaltyDiscount);
      if (validLoyaltyDiscount === null) return res.status(400).json({ success: false, message: "Diskon pelanggan harus antara 0 sampai 100 persen." });
      updateData.loyaltyDiscount = validLoyaltyDiscount;
    }
    if (points !== undefined) {
      const validPoints = parsePoints(points);
      if (validPoints === null) return res.status(400).json({ success: false, message: "Poin pelanggan harus berupa bilangan bulat positif." });
      updateData.points = validPoints;
    }

    // Update foto menggunakan jalur lokal jika ada file baru yang diunggah
    if (req.file) {
      updateData.imageUrl = getUploadedFileUrl(req.file);
    }

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: updateData
    });

    res.json({ success: true, message: "Data pelanggan berhasil diupdate", data: customer });
  } catch (error) {
    if (error.code === 'INVALID_PHONE') return res.status(400).json({ success: false, message: error.message });
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'Nomor HP sudah terdaftar.' });
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.customer.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: "Pelanggan berhasil dihapus" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
