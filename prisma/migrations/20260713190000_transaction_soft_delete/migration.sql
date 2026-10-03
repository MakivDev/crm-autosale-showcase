-- Soft-delete support for transactions (balance integrity)
ALTER TABLE "Transaction" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "Transaction_deleted_at_idx" ON "Transaction"("deleted_at");
