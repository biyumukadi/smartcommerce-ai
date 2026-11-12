-- CreativeType additions
ALTER TYPE "CreativeType" ADD VALUE IF NOT EXISTS 'video';
ALTER TYPE "CreativeType" ADD VALUE IF NOT EXISTS 'banner';

-- CreativeStatus
ALTER TYPE "CreativeStatus" ADD VALUE IF NOT EXISTS 'approved';

-- AIJobType
ALTER TYPE "AIJobType" ADD VALUE IF NOT EXISTS 'ad_copy_pack';
ALTER TYPE "AIJobType" ADD VALUE IF NOT EXISTS 'ad_visual';
ALTER TYPE "AIJobType" ADD VALUE IF NOT EXISTS 'ad_video_script';
ALTER TYPE "AIJobType" ADD VALUE IF NOT EXISTS 'ad_ab_variants';

DO $$ BEGIN CREATE TYPE "AdStrategy" AS ENUM ('sales', 'acquisition', 'brand'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "strategy" "AdStrategy";
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "format" TEXT;
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "variantGroup" TEXT;
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "variantLabel" TEXT;
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "overlays" JSONB;
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "AdCreative" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AdCreative_storeId_status_idx" ON "AdCreative"("storeId", "status");
CREATE INDEX IF NOT EXISTS "AdCreative_storeId_variantGroup_idx" ON "AdCreative"("storeId", "variantGroup");

ALTER TABLE "AIUsage" ADD COLUMN IF NOT EXISTS "videoCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AIUsage" ADD COLUMN IF NOT EXISTS "creditsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AIUsage" ADD COLUMN IF NOT EXISTS "creditsLimit" INTEGER NOT NULL DEFAULT 500;
