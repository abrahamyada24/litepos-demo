const REPORT_TITLES = {
  TRANSAKSI: "Transaksi",
  KATEGORI: "Kategori",
  TERLARIS: "Produk Terlaris",
  PELANGGAN: "Pelanggan",
  RETUR: "Retur",
  SHIFT: "Shift",
  LABARUGI: "Laba Rugi",
  PENGELUARAN: "Pengeluaran",
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  })
    .format(Number(value) || 0)
    .replace(/[\u00A0\u202F]/g, " ");

const columns = (...items) =>
  items.map(([header, key, type = "text"]) => ({ header, key, type }));

export function buildReportExport(activeTab, data) {
  const title = REPORT_TITLES[activeTab] || "Laporan";

  switch (activeTab) {
    case "TRANSAKSI":
      return {
        title,
        columns: columns(
          ["Invoice", "invoice"],
          ["Tanggal", "date", "date"],
          ["Kasir", "cashier"],
          ["Tipe", "orderType"],
          ["Total", "total", "currency"],
          ["Status", "status"]
        ),
        rows: (data.transactions || []).map((item) => ({
          invoice: item.invoiceNumber || "-",
          date: item.createdAt,
          cashier: item.user?.name || "-",
          orderType: item.orderType === "PRE_ORDER" ? "Pre-order" : "Penjualan",
          total: Number(item.grandTotal) || 0,
          status: item.status || "-",
        })),
        summary: [
          ["Penjualan kotor", data.summaryData?.summary?.grossRevenue],
          ["Retur", data.summaryData?.summary?.returnTotal],
          ["Penjualan bersih", data.summaryData?.summary?.totalRevenue],
          ["Total transaksi", data.summaryData?.summary?.totalTransactions, "number"],
        ],
      };
    case "KATEGORI":
      return {
        title,
        columns: columns(
          ["Kategori", "name"],
          ["Qty Terjual", "quantity", "number"],
          ["Pendapatan", "revenue", "currency"],
          ["Profit", "profit", "currency"]
        ),
        rows: (data.categoryData || []).map((item) => ({
          name: item.name || "-",
          quantity: Number(item.totalQty) || 0,
          revenue: Number(item.totalRevenue) || 0,
          profit: Number(item.totalProfit) || 0,
        })),
      };
    case "TERLARIS":
      return {
        title,
        columns: columns(
          ["Peringkat", "rank", "number"],
          ["Produk", "name"],
          ["Qty Terjual", "sold", "number"],
          ["Pendapatan", "revenue", "currency"]
        ),
        rows: (data.summaryData?.topProducts || []).map((item, index) => ({
          rank: index + 1,
          name: item.name || "-",
          sold: Number(item.sold) || 0,
          revenue: Number(item.revenue) || 0,
        })),
      };
    case "PELANGGAN":
      return {
        title,
        columns: columns(
          ["Pelanggan", "name"],
          ["Telepon", "phone"],
          ["Kunjungan", "visits", "number"],
          ["Total Belanja", "spent", "currency"],
          ["Rata-rata", "average", "currency"],
          ["Kunjungan Terakhir", "lastVisit", "date"]
        ),
        rows: (data.customerData || []).map((item) => ({
          name: item.name || "-",
          phone: item.phone || "-",
          visits: Number(item.visitCount) || 0,
          spent: Number(item.totalSpent) || 0,
          average: Number(item.avgTransaction) || 0,
          lastVisit: item.lastVisit,
        })),
      };
    case "RETUR":
      return {
        title,
        columns: columns(
          ["Invoice", "invoice"],
          ["Tanggal", "date", "date"],
          ["Pelanggan", "customer"],
          ["Kasir", "cashier"],
          ["Total Retur", "total", "currency"]
        ),
        rows: (data.returnsData || []).map((item) => ({
          invoice: item.invoiceNumber || "-",
          date: item.createdAt,
          customer: item.customer?.name || item.customerName || "Umum",
          cashier: item.user?.name || "-",
          total: Number(item.grandTotal) || 0,
        })),
      };
    case "SHIFT":
      return {
        title,
        columns: columns(
          ["Kasir", "cashier"],
          ["Dibuka", "openedAt", "date"],
          ["Ditutup", "closedAt", "date"],
          ["Kas Awal", "openingCash", "currency"],
          ["Kas Akhir", "closingCash", "currencyNullable"],
          ["Status", "status"]
        ),
        rows: (data.shiftData || []).map((item) => ({
          cashier: item.userName || "-",
          openedAt: item.openedAt,
          closedAt: item.closedAt,
          openingCash: Number(item.openingCash) || 0,
          closingCash: item.closingCash == null ? null : Number(item.closingCash),
          status: item.status || "-",
        })),
      };
    case "LABARUGI": {
      const report = data.profitLossData || {};
      return {
        title,
        columns: columns(["Komponen", "component"], ["Nilai", "amount", "currency"]),
        rows: [
          { component: "Penjualan bruto", amount: report.grossRevenue },
          { component: "Retur penjualan", amount: -(Number(report.returnTotal) || 0) },
          { component: "Penjualan bersih", amount: report.netRevenue },
          { component: "HPP / Modal", amount: -(Number(report.cogs) || 0) },
          { component: "Laba kotor", amount: report.grossProfit },
          { component: "Pengeluaran", amount: -(Number(report.totalExpenses) || 0) },
          { component: "Laba bersih", amount: report.netProfit },
          ...(report.expenseBreakdown || []).map(item => ({ component: `Rincian pengeluaran: ${item.category}`, amount: -(Number(item.amount) || 0) })),
        ],
      };
    }
    case "PENGELUARAN":
      return {
        title,
        columns: columns(
          ["Tanggal", "date", "date"],
          ["Deskripsi", "description"],
          ["Kategori", "category"],
          ["Tipe", "type"],
          ["Jumlah", "amount", "currency"]
        ),
        rows: (data.expensesData || []).map((item) => ({
          date: item.createdAt,
          description: item.description || "-",
          category: item.category || "Umum",
          type: item.type === "PURCHASE" ? "Pembelian" : "Pengeluaran",
          amount: Number(item.amount) || 0,
        })),
      };
    default:
      return { title, columns: [], rows: [] };
  }
}

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const valueForCsv = (value, type) => {
  if (type === "date") return formatDateTime(value);
  if (type === "currency" || type === "number") return Number(value) || 0;
  if (type === "currencyNullable") return value == null ? "-" : Number(value) || 0;
  return value ?? "-";
};

const valueForPdf = (value, type) => {
  if (type === "date") return formatDateTime(value);
  if (type === "currency") return formatCurrency(value);
  if (type === "currencyNullable") return value == null ? "-" : formatCurrency(value);
  if (type === "number") return String(Number(value) || 0);
  return String(value ?? "-");
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function exportReportCsv(report, filename) {
  const csv = serializeReportCsv(report);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function serializeReportCsv(report) {
  const header = report.columns.map((column) => csvCell(column.header)).join(",");
  const body = report.rows.map((row) =>
    report.columns
      .map((column) => csvCell(valueForCsv(row[column.key], column.type)))
      .join(",")
  );
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
}

const PDF_COLORS = {
  orange: [234 / 255, 88 / 255, 12 / 255],
  dark: [31 / 255, 41 / 255, 55 / 255],
  gray: [75 / 255, 85 / 255, 99 / 255],
  light: [255 / 255, 247 / 255, 237 / 255],
  border: [229 / 255, 231 / 255, 235 / 255],
  white: [1, 1, 1],
};

const pdfSafeText = (value) =>
  String(value ?? "-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");

const wrapPdfText = (value, font, size, maxWidth) => {
  const text = pdfSafeText(value).slice(0, 1000);
  if (!text) return [""];

  const lines = [];
  const appendWord = (word, current) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) return candidate;
    if (current) lines.push(current);

    let chunk = "";
    for (const character of word) {
      if (font.widthOfTextAtSize(chunk + character, size) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    return chunk;
  };

  text.split(/\r?\n/).forEach((paragraph) => {
    let current = "";
    paragraph
      .split(/\s+/)
      .filter(Boolean)
      .forEach((word) => {
        current = appendWord(word, current);
      });
    if (current || !paragraph) lines.push(current);
  });

  return lines.length ? lines : [""];
};

const getColumnWidths = (report, availableWidth) => {
  const weights = report.columns.map((column) => {
    const contentLength = report.rows.slice(0, 75).reduce((longest, row) => {
      const formatted = valueForPdf(row[column.key], column.type);
      return Math.max(longest, pdfSafeText(formatted).length);
    }, column.header.length);

    if (column.type === "number") return Math.min(Math.max(contentLength, 8), 11);
    if (column.type === "currency" || column.type === "currencyNullable") {
      return Math.min(Math.max(contentLength, 12), 15);
    }
    if (column.type === "date") return Math.min(Math.max(contentLength, 16), 19);
    return Math.min(Math.max(contentLength, 9), 25);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => (weight / totalWeight) * availableWidth);
};

export async function createReportPdf(report, { storeName, periodLabel }) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const landscape = report.columns.length >= 6;
  const pageSize = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const [pageWidth, pageHeight] = pageSize;
  const margin = 40;
  const bottomMargin = 40;
  const tableWidth = pageWidth - margin * 2;
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = (name) => rgb(...PDF_COLORS[name]);
  const safeStoreName = pdfSafeText(storeName || "Warna Warni");

  pdf.setTitle(`Laporan ${pdfSafeText(report.title)} - ${safeStoreName}`);
  pdf.setSubject(pdfSafeText(periodLabel));
  pdf.setCreator("LitePOS Warna Warni");
  pdf.setProducer("LitePOS Warna Warni");
  pdf.setCreationDate(new Date());

  const columnWidths = getColumnWidths(report, tableWidth);
  const headerHeight = 25;
  const cellPadding = 6;
  const fontSize = 7.5;
  const lineHeight = 10;
  const pages = [];
  let page;
  let y;

  const addPage = (firstPage = false) => {
    page = pdf.addPage(pageSize);
    pages.push(page);
    if (firstPage) {
      page.drawRectangle({
        x: 0,
        y: pageHeight - 66,
        width: pageWidth,
        height: 66,
        color: color("orange"),
      });
      page.drawText(safeStoreName, {
        x: margin,
        y: pageHeight - 28,
        size: 16,
        font: boldFont,
        color: color("white"),
      });
      page.drawText(`Laporan ${pdfSafeText(report.title)}`, {
        x: margin,
        y: pageHeight - 47,
        size: 10,
        font: regularFont,
        color: color("white"),
      });
      page.drawText(`Periode: ${pdfSafeText(periodLabel)}`, {
        x: margin,
        y: pageHeight - 88,
        size: 9,
        font: regularFont,
        color: color("gray"),
      });
      const createdText = `Dibuat: ${pdfSafeText(formatDateTime(new Date()))}`;
      page.drawText(createdText, {
        x: pageWidth - margin - regularFont.widthOfTextAtSize(createdText, 9),
        y: pageHeight - 88,
        size: 9,
        font: regularFont,
        color: color("gray"),
      });
      y = pageHeight - 112;
    } else {
      y = pageHeight - margin;
    }
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: margin,
      y: y - headerHeight,
      width: tableWidth,
      height: headerHeight,
      color: color("orange"),
    });
    let x = margin;
    report.columns.forEach((column, index) => {
      const lines = wrapPdfText(
        column.header,
        boldFont,
        7.5,
        columnWidths[index] - cellPadding * 2
      );
      page.drawText(lines[0] || "", {
        x: x + cellPadding,
        y: y - 16,
        size: 7.5,
        font: boldFont,
        color: color("white"),
      });
      x += columnWidths[index];
    });
    y -= headerHeight;
  };

  addPage(true);

  if (report.summary?.length) {
    report.summary.forEach(([label, value, type = "currency"]) => {
      const summaryValue = type === "number" ? String(Number(value) || 0) : formatCurrency(value);
      page.drawText(pdfSafeText(label), {
        x: margin + 4,
        y,
        size: 9,
        font: boldFont,
        color: color("dark"),
      });
      const safeValue = pdfSafeText(summaryValue);
      page.drawText(safeValue, {
        x: margin + 245 - regularFont.widthOfTextAtSize(safeValue, 9),
        y,
        size: 9,
        font: regularFont,
        color: color("dark"),
      });
      y -= 17;
    });
    y -= 8;
  }

  drawTableHeader();

  const rows = report.rows.length
    ? report.rows.map((row) =>
        report.columns.map((column) => valueForPdf(row[column.key], column.type))
      )
    : [["Tidak ada data", ...Array(Math.max(0, report.columns.length - 1)).fill("")]];

  rows.forEach((row, rowIndex) => {
    let lineGroups = row.map((value, index) =>
      wrapPdfText(value, regularFont, fontSize, columnWidths[index] - cellPadding * 2)
    );
    let rowHeight =
      Math.max(24, Math.max(...lineGroups.map((lines) => lines.length)) * lineHeight + 10);

    if (y - rowHeight < bottomMargin) {
      addPage();
      drawTableHeader();
      lineGroups = row.map((value, index) =>
        wrapPdfText(value, regularFont, fontSize, columnWidths[index] - cellPadding * 2)
      );
      rowHeight =
        Math.max(24, Math.max(...lineGroups.map((lines) => lines.length)) * lineHeight + 10);
    }

    if (rowIndex % 2 === 0) {
      page.drawRectangle({
        x: margin,
        y: y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: color("light"),
      });
    }
    page.drawLine({
      start: { x: margin, y: y - rowHeight },
      end: { x: pageWidth - margin, y: y - rowHeight },
      thickness: 0.4,
      color: color("border"),
    });

    let x = margin;
    lineGroups.forEach((lines, columnIndex) => {
      lines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: x + cellPadding,
          y: y - cellPadding - fontSize - lineIndex * lineHeight,
          size: fontSize,
          font: regularFont,
          color: color("gray"),
        });
      });
      x += columnWidths[columnIndex];
    });
    y -= rowHeight;
  });

  pages.forEach((currentPage, index) => {
    const pageLabel = `Halaman ${index + 1} dari ${pages.length}`;
    currentPage.drawText(pageLabel, {
      x: pageWidth - margin - regularFont.widthOfTextAtSize(pageLabel, 8),
      y: 19,
      size: 8,
      font: regularFont,
      color: color("gray"),
    });
  });

  return pdf.save({ useObjectStreams: false });
}

export async function exportReportPdf(report, { filename, storeName, periodLabel }) {
  const pdfBytes = await createReportPdf(report, { storeName, periodLabel });
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), filename);
}
