-- Enums
DO $$ BEGIN CREATE TYPE "ConversationChannel" AS ENUM ('whatsapp', 'instagram', 'tiktok', 'email', 'web'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ConversationStatus" AS ENUM ('open', 'pending', 'human_handoff', 'closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound', 'system'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MessageStatus" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed', 'unavailable'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Customer consent
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketingConsentWhatsApp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3);

-- Cart nudge tracking
ALTER TABLE "Cart" ADD COLUMN IF NOT EXISTS "abandonedNudgeSentAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Cart_status_abandonedNudgeSentAt_idx" ON "Cart"("status", "abandonedNudgeSentAt");

-- Conversation
CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" "ConversationChannel" NOT NULL DEFAULT 'whatsapp',
    "externalThreadId" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "assignedToUserId" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_storeId_channel_externalThreadId_key" ON "Conversation"("storeId", "channel", "externalThreadId");
CREATE INDEX IF NOT EXISTS "Conversation_storeId_status_lastMessageAt_idx" ON "Conversation"("storeId", "status", "lastMessageAt");

ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_storeId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_customerId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Message
CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "media" JSONB,
    "externalMessageId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'queued',
    "sentByUserId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_storeId_externalMessageId_idx" ON "Message"("storeId", "externalMessageId");

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_conversationId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_storeId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
