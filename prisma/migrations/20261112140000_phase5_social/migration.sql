DO $$ BEGIN CREATE TYPE "SocialPostStatus" AS ENUM ('draft', 'scheduled', 'publishing', 'published', 'failed', 'unavailable', 'needs_approval'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CatalogSyncStatus" AS ENUM ('pending', 'exported', 'synced', 'failed', 'unavailable'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AttributionSource" AS ENUM ('meta', 'tiktok', 'whatsapp', 'organic', 'direct', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "spendConfirmedAt" TIMESTAMP(3);
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "spendConfirmedById" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "performance" JSONB;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "error" TEXT;

CREATE TABLE IF NOT EXISTS "SocialPost" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "caption" TEXT,
    "mediaUrls" JSONB,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "script" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "SocialPostStatus" NOT NULL DEFAULT 'draft',
    "externalPostId" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SocialPost_storeId_provider_status_idx" ON "SocialPost"("storeId", "provider", "status");
CREATE INDEX IF NOT EXISTS "SocialPost_storeId_scheduledAt_idx" ON "SocialPost"("storeId", "scheduledAt");
ALTER TABLE "SocialPost" DROP CONSTRAINT IF EXISTS "SocialPost_storeId_fkey";
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CatalogExport" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "status" "CatalogSyncStatus" NOT NULL DEFAULT 'pending',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "exportPayload" JSONB,
    "externalRef" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogExport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CatalogExport_storeId_provider_createdAt_idx" ON "CatalogExport"("storeId", "provider", "createdAt");
ALTER TABLE "CatalogExport" DROP CONSTRAINT IF EXISTS "CatalogExport_storeId_fkey";
ALTER TABLE "CatalogExport" ADD CONSTRAINT "CatalogExport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "AttributionEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" "AttributionSource" NOT NULL,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "clickId" TEXT,
    "sessionId" TEXT,
    "orderId" TEXT,
    "path" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttributionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AttributionEvent_storeId_source_createdAt_idx" ON "AttributionEvent"("storeId", "source", "createdAt");
CREATE INDEX IF NOT EXISTS "AttributionEvent_storeId_orderId_idx" ON "AttributionEvent"("storeId", "orderId");
CREATE INDEX IF NOT EXISTS "AttributionEvent_storeId_sessionId_idx" ON "AttributionEvent"("storeId", "sessionId");
ALTER TABLE "AttributionEvent" DROP CONSTRAINT IF EXISTS "AttributionEvent_storeId_fkey";
ALTER TABLE "AttributionEvent" ADD CONSTRAINT "AttributionEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
