-- Reclassify cash top-ups that were wrongly stored as business income.
-- Sales always have vehicle_id and description «Продаж…».
UPDATE "Transaction"
SET type = 'DEPOSIT'
WHERE type = 'INCOME'
  AND "vehicle_id" IS NULL
  AND (
    "description" IS NULL
    OR "description" NOT ILIKE '%продаж%'
  );
