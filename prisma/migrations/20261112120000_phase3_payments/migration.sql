-- AlterEnum OrderStatus
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'cod_pending';

-- AlterEnum PaymentMethod
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'cash_on_delivery';

-- CreateEnum RefundStatus
DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('pending', 'succeeded', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable Payment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "operator" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_storeId_createdAt_idx" ON "Payment"("storeId", "createdAt");

-- CreateTable Refund
CREATE TABLE IF NOT EXISTS "Refund" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerRef" TEXT,
    "amount" DECIMAL(18,0) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX IF NOT EXISTS "Refund_storeId_orderId_idx" ON "Refund"("storeId", "orderId");

ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_storeId_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_paymentId_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_orderId_fkey";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
