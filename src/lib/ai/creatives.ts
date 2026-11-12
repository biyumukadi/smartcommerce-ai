import { prisma } from "@/lib/db";
import { createSocialPostDraft } from "@/lib/social/posts";
import {
  createAdsCampaignDraft,
  launchAdsCampaign,
} from "@/lib/social/ads";
import type { SocialPlatform } from "@/lib/social";
import { logger } from "@/lib/logger";

export async function listCreatives(storeId: string) {
  return prisma.adCreative.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function updateCreative(input: {
  storeId: string;
  creativeId: string;
  headline?: string;
  body?: string;
  cta?: string;
  hashtags?: string[];
}) {
  const existing = await prisma.adCreative.findFirst({
    where: { id: input.creativeId, storeId: input.storeId },
  });
  if (!existing) throw new Error("Créatif introuvable");
  if (existing.status === "published") {
    throw new Error("Créatif déjà publié — dupliquez pour éditer");
  }
  return prisma.adCreative.update({
    where: { id: existing.id },
    data: {
      headline: input.headline ?? existing.headline,
      body: input.body ?? existing.body,
      cta: input.cta ?? existing.cta,
      hashtags: input.hashtags ?? existing.hashtags,
      status: existing.status === "approved" ? "ready" : existing.status,
      approvedAt: null,
      approvedById: null,
    },
  });
}

export async function approveCreative(input: {
  storeId: string;
  creativeId: string;
  userId: string;
}) {
  const existing = await prisma.adCreative.findFirst({
    where: { id: input.creativeId, storeId: input.storeId },
  });
  if (!existing) throw new Error("Créatif introuvable");
  if (!["ready", "draft", "approved"].includes(existing.status)) {
    throw new Error(`Statut ${existing.status} non approuvable`);
  }
  return prisma.adCreative.update({
    where: { id: existing.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedById: input.userId,
    },
  });
}

export function buildCreativeDownload(creative: {
  id: string;
  headline: string | null;
  body: string | null;
  cta: string | null;
  hashtags: string[];
  format: string | null;
  strategy: string | null;
  overlays: unknown;
  metadata: unknown;
  assetKey: string | null;
}) {
  const payload = {
    id: creative.id,
    headline: creative.headline,
    body: creative.body,
    cta: creative.cta,
    hashtags: creative.hashtags,
    format: creative.format,
    strategy: creative.strategy,
    overlays: creative.overlays,
    metadata: creative.metadata,
    assetKey: creative.assetKey,
    exportedAt: new Date().toISOString(),
  };
  return {
    filename: `creative-${creative.id}.json`,
    contentType: "application/json",
    body: JSON.stringify(payload, null, 2),
  };
}

/**
 * Publish approved creative to a connected Phase 5 channel.
 * Organic: confirmPublish. Paid spend: confirmSpend (never invent success).
 */
export async function publishCreativeToChannel(input: {
  storeId: string;
  creativeId: string;
  platform: SocialPlatform;
  confirmPublish: boolean;
  confirmSpend?: boolean;
  mode?: "organic" | "spend";
  budgetMinor?: number;
  currency?: string;
  userId?: string;
}) {
  const mode = input.mode || "organic";

  if (mode === "organic" && !input.confirmPublish) {
    return {
      status: "needs_confirmation" as const,
      error: "confirmPublish=true requis — aucune publication fictive.",
    };
  }
  if (mode === "spend" && !input.confirmSpend) {
    return {
      status: "needs_confirmation" as const,
      error: "confirmSpend=true requis — aucune dépense publicitaire fictive.",
    };
  }

  const creative = await prisma.adCreative.findFirst({
    where: { id: input.creativeId, storeId: input.storeId },
  });
  if (!creative) throw new Error("Créatif introuvable");
  if (creative.status !== "approved" && creative.status !== "ready") {
    return {
      status: "needs_approval" as const,
      error: "Approuvez le créatif avant publication canal.",
    };
  }

  if (mode === "spend") {
    const campaign = await createAdsCampaignDraft({
      storeId: input.storeId,
      platform: input.platform,
      name: `Studio · ${creative.headline || creative.id}`.slice(0, 80),
      budgetMinor: input.budgetMinor ?? 0,
      currency: input.currency || "USD",
      objective: creative.strategy || "sales",
      createdById: input.userId,
    });
    await prisma.adCreative.update({
      where: { id: creative.id },
      data: { campaignId: campaign.id },
    });
    const launched = await launchAdsCampaign({
      storeId: input.storeId,
      campaignId: campaign.id,
      platform: input.platform,
      confirmSpend: true,
      confirmedById: input.userId,
    });
    if (launched.launch.status === "submitted") {
      await prisma.adCreative.update({
        where: { id: creative.id },
        data: { status: "published", publishedAt: new Date() },
      });
    }
    logger.info("ai.creative_spend", {
      storeId: input.storeId,
      creativeId: creative.id,
      platform: input.platform,
      status: launched.launch.status,
    });
    return {
      status: launched.launch.status,
      error: launched.launch.error,
      campaignId: campaign.id,
      notice:
        launched.launch.status === "submitted"
          ? "Campagne Ads soumise sur canal connecté"
          : "Dépense Ads non réussie / indisponible — pas de faux succès",
    };
  }

  const caption = [
    creative.headline,
    creative.body,
    creative.cta,
    ...(creative.hashtags || []).map((h) => `#${h.replace(/^#/, "")}`),
  ]
    .filter(Boolean)
    .join("\n");

  const result = await createSocialPostDraft({
    storeId: input.storeId,
    platform: input.platform,
    caption,
    hashtags: creative.hashtags,
    mediaUrls: creative.assetKey?.startsWith("http")
      ? [creative.assetKey]
      : undefined,
    script:
      typeof creative.metadata === "object" &&
      creative.metadata &&
      "voiceoverScript" in (creative.metadata as object)
        ? String(
            (creative.metadata as { voiceoverScript?: string }).voiceoverScript,
          )
        : undefined,
    createdById: input.userId,
    confirmPublish: true,
  });

  if (
    result.publish.status === "published" ||
    result.publish.status === "scheduled"
  ) {
    await prisma.adCreative.update({
      where: { id: creative.id },
      data: { status: "published", publishedAt: new Date() },
    });
  }

  logger.info("ai.creative_publish", {
    storeId: input.storeId,
    creativeId: creative.id,
    platform: input.platform,
    status: result.publish.status,
  });

  return {
    status: result.publish.status,
    error: result.publish.error,
    socialPostId: result.post.id,
    notice:
      result.publish.status === "published"
        ? "Publié sur canal connecté"
        : "Publication non réussie / indisponible — pas de faux succès",
  };
}
