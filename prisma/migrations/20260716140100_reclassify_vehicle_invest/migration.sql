-- Vehicle-linked expenses are capital put into cars («вложення»), not opex.
UPDATE "Transaction"
SET type = 'VEHICLE_INVEST'
WHERE type = 'EXPENSE'
  AND "vehicle_id" IS NOT NULL;
