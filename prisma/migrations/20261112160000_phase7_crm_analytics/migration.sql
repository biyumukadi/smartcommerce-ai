-- Phase 7 CRM / analytics enums & tables

DO $$ BEGIN CREATE TYPE "CustomerLifecycle" AS ENUM ('prospect', 'active', 'churn_risk', 'inactive', 'vip'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CouponType" AS ENUM ('percent', 'fixed', 'free_shipping'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CouponStatus" AS ENUM ('active', 'expired', 'redeemed', 'revoked'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ComplaintStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "LoyaltyTxnType" AS ENUM ('earn', 'redeem', 'adjust', 'expire'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MarketingAutomationStatus" AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'blocked_no_consent', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "segmentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lifecycle" "CustomerLifecycle" NOT NULL DEFAULT 'prospect';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "orderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "totalSpentMinor" DECIMAL(18,0) NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastOrderAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketingConsentEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketingConsentSms" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Customer_storeId_lifecycle_idx" ON "Customer"("storeId", "lifecycle");
CREATE INDEX IF NOT EXISTS "Customer_storeId_loyaltyPoints_idx" ON "Customer"("storeId", "loyaltyPoints");

CREATE TABLE IF NOT EXISTS "LoyaltyLedger" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LoyaltyTxnType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "orderId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoyaltyLedger_storeId_customerId_createdAt_idx" ON "LoyaltyLedger"("storeId", "customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "LoyaltyLedger_customerId_createdAt_idx" ON "LoyaltyLedger"("customerId", "createdAt");

CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL DEFAULT 'percent',
    "valueMinor" INTEGER NOT NULL,
    "currency" TEXT,
    "minOrderMinor" INTEGER,
    "status" "CouponStatus" NOT NULL DEFAULT 'active',
    "segmentKey" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_storeId_code_key" ON "Coupon"("storeId", "code");
CREATE INDEX IF NOT EXISTS "Coupon_storeId_status_idx" ON "Coupon"("storeId", "status");
CREATE INDEX IF NOT EXISTS "Coupon_storeId_customerId_idx" ON "Coupon"("storeId", "customerId");

CREATE TABLE IF NOT EXISTS "CouponRedemption" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_createdAt_idx" ON "CouponRedemption"("couponId", "createdAt");
CREATE INDEX IF NOT EXISTS "CouponRedemption_storeId_customerId_idx" ON "CouponRedemption"("storeId", "customerId");

CREATE TABLE IF NOT EXISTS "Complaint" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "assignedTo" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Complaint_storeId_status_createdAt_idx" ON "Complaint"("storeId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Complaint_customerId_createdAt_idx" ON "Complaint"("customerId", "createdAt");

CREATE TABLE IF NOT EXISTS "CustomerSegment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSegment_storeId_key_key" ON "CustomerSegment"("storeId", "key");
CREATE INDEX IF NOT EXISTS "CustomerSegment_storeId_idx" ON "CustomerSegment"("storeId");

CREATE TABLE IF NOT EXISTS "MarketingAutomation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'whatsapp',
    "status" "MarketingAutomationStatus" NOT NULL DEFAULT 'draft',
    "segmentKey" TEXT,
    "requireConsent" BOOLEAN NOT NULL DEFAULT true,
    "messageTemplate" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skippedNoConsent" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ranAt" TIMESTAMP(3),
    CONSTRAINT "MarketingAutomation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketingAutomation_storeId_status_idx" ON "MarketingAutomation"("storeId", "status");
CREATE INDEX IF NOT EXISTS "MarketingAutomation_storeId_channel_idx" ON "MarketingAutomation"("storeId", "channel");

DO $$ BEGIN
 ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "MarketingAutomation" ADD CONSTRAINT "MarketingAutomation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
