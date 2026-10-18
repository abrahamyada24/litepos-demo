const earnedPointsFor = (total, config) => {
  const threshold = Number(config?.multiplierAmount);
  const multiplier = Number(config?.pointMultiplier);
  if (!config?.isActive || !Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(multiplier) || multiplier < 0) return 0;
  return Math.max(0, Math.floor(Math.floor(Math.max(0, Number(total)) / threshold) * multiplier));
};

// Called inside the same transaction as checkout/settlement. Claiming the null
// snapshot prevents a repeated webhook from awarding the same points twice.
const awardTransactionPoints = async (tx, transaction, redeemed = 0) => {
  if (!transaction.customerId || !['PAID', 'COMPLETED'].includes(transaction.status) || transaction.pointsEarned != null) return null;
  const config = await tx.loyaltyConfig.findFirst({ where: { isActive: true } });
  if (!config) return null;
  const pointsEarned = earnedPointsFor(transaction.grandTotal, config);
  const pointsRedeemed = Number(redeemed) || 0;
  const claim = await tx.transaction.updateMany({
    where: { id: transaction.id, pointsEarned: null },
    data: { pointsEarned, pointsRedeemed },
  });
  if (claim.count !== 1) return null;
  const updated = await tx.customer.updateMany({
    where: { id: transaction.customerId, points: { gte: pointsRedeemed } },
    data: { points: { increment: pointsEarned - pointsRedeemed } },
  });
  if (updated.count !== 1) throw Object.assign(new Error('Saldo poin pelanggan tidak mencukupi.'), { code: 'INVALID_LOYALTY_POINTS' });
  const customer = await tx.customer.findUnique({ where: { id: transaction.customerId } });
  const snapshot = { pointsEarned, pointsRedeemed, pointsBalanceAfter: customer.points };
  await tx.transaction.update({ where: { id: transaction.id }, data: snapshot });
  return snapshot;
};

const reverseTransactionPoints = async (tx, transaction) => {
  if (!transaction.customerId || transaction.pointsEarned == null || transaction.loyaltyReversed) return;
  const claim = await tx.transaction.updateMany({
    where: { id: transaction.id, loyaltyReversed: false }, data: { loyaltyReversed: true },
  });
  if (claim.count !== 1) return;
  const customer = await tx.customer.findUnique({ where: { id: transaction.customerId } });
  if (!customer) return;
  const balance = Math.max(0, customer.points - Number(transaction.pointsEarned || 0) + Number(transaction.pointsRedeemed || 0));
  const updated = await tx.customer.updateMany({ where: { id: customer.id, points: customer.points }, data: { points: balance } });
  if (updated.count !== 1) throw new Error('Saldo poin berubah. Coba proses retur kembali.');
};

module.exports = { earnedPointsFor, awardTransactionPoints, reverseTransactionPoints };
