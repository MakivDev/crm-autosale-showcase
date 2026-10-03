-- DropIndex
DROP INDEX "ExchangeRate_currency_id_effective_month_key";

-- CreateIndex
CREATE INDEX "ExchangeRate_currency_id_created_at_idx" ON "ExchangeRate"("currency_id", "created_at" DESC);
