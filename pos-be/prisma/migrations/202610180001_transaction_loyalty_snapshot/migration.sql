-- Nullable snapshots preserve the distinction between historical transactions
-- without loyalty records and new transactions that earned zero points.
ALTER TABLE `transactions`
  ADD COLUMN `points_earned` INTEGER NULL,
  ADD COLUMN `points_redeemed` INTEGER NULL,
  ADD COLUMN `points_balance_after` INTEGER NULL,
  ADD COLUMN `loyalty_reversed` BOOLEAN NOT NULL DEFAULT false;
