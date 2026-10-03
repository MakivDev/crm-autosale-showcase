-- Daily stock capital snapshots for history / chart
CREATE TABLE "StockCapitalSnapshot" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "stock_capital_usd" DECIMAL(15,2) NOT NULL,
    "cash_total_usd" DECIMAL(15,2) NOT NULL,
    "cash_plus_stock_usd" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCapitalSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockCapitalSnapshot_date_key" ON "StockCapitalSnapshot"("date");
