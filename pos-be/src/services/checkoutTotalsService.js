const calculateCheckoutTotals = ({ subTotal, taxRate = 0, discountAmount = 0, discountType = 'amount', loyaltyDiscount = 0 }) => {
  const value = Number(discountAmount);
  if (!Number.isFinite(value) || value < 0 || !['amount', 'percent'].includes(discountType) || (discountType === 'percent' && value > 100)) {
    throw Object.assign(new Error('Diskon harus bernilai positif; persentase maksimal 100%.'), { code: 'INVALID_DISCOUNT' });
  }
  const manualDiscount = Math.min(subTotal, Math.round(discountType === 'percent' ? subTotal * value / 100 : value));
  const discount = Math.min(subTotal, manualDiscount + Number(loyaltyDiscount || 0));
  const taxableAmount = Math.max(0, subTotal - discount);
  const taxAmount = Math.round(taxableAmount * taxRate);
  return { discount, taxAmount, grandTotal: taxableAmount + taxAmount };
};
module.exports = { calculateCheckoutTotals };
