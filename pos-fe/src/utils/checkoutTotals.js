export const calculateCheckoutTotals = ({ subTotal, taxRate = 0, discountAmount = 0, discountType = 'amount' }) => {
  const value = Math.max(0, Number(discountAmount) || 0);
  const discount = Math.min(subTotal, Math.round(discountType === 'percent' ? subTotal * Math.min(100, value) / 100 : value));
  const taxAmount = Math.round(Math.max(0, subTotal - discount) * taxRate);
  return { discount, taxAmount, grandTotal: Math.max(0, subTotal - discount) + taxAmount };
};
