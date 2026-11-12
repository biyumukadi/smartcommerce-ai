-- Phase 8 SaaS billing + security

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaSecretEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaVerifiedAt" TIMESTAMP(3);

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "canceledAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "billingProvider" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "externalCustomerId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'saas_subscription';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "externalInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "lineItems" JSONB;

CREATE TABLE IF NOT EXISTS "CostLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT,
    "category" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "externalRef" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CostLedger_organizationId_category_occurredAt_idx" ON "CostLedger"("organizationId", "category", "occurredAt");
CREATE INDEX IF NOT EXISTS "CostLedger_organizationId_occurredAt_idx" ON "CostLedger"("organizationId", "occurredAt");

DO $$ BEGIN CREATE TYPE "PrivacyRequestType" AS ENUM ('export', 'delete'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PrivacyRequestStatus" AS ENUM ('pending', 'processing', 'completed', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "resultKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PrivacyRequest_userId_createdAt_idx" ON "PrivacyRequest"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PrivacyRequest_status_createdAt_idx" ON "PrivacyRequest"("status", "createdAt");

DO $$ BEGIN
 ALTER TABLE "CostLedger" ADD CONSTRAINT "CostLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
