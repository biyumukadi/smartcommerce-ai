import { prisma } from "@/lib/db";
import { getSocialProvider } from "./registry";
import { getConnectionAccessToken } from "./connections";
import type { SocialPlatform } from "./types";
import { logger } from "@/lib/logger";

export async function createAdsCampaignDraft(input: {
  storeId: string;
  platform: SocialPlatform;
  name: string;
  budgetMinor: number;
  currency: string;
  objective?: string;
  createdById?: string;
}) {
  const channel = input.platform === "meta" ? "meta" : "tiktok";
  const campaign = await prisma.marketingCampaign.create({
    data: {
      storeId: input.storeId,
      name: input.name,
      channel,
      status: "draft",
      budgetAmount: input.budgetMinor,
      currency: input.currency,
      createdById: input.createdById,
      performance: { objective: input.objective || null },
    },
  });
  return campaign;
}

/**
 * Launch / submit ads ONLY with explicit confirmSpend.
 * Never invents publish/spend success when keys or eligibility missing.
 */
export async function launchAdsCampaign(input: {
  storeId: string;
  campaignId: string;
  platform: SocialPlatform;
  confirmSpend: boolean;
  confirmedById?: string;
}) {
  const campaign = await prisma.marketingCampaign.findFirst({
    where: { id: input.campaignId, storeId: input.storeId },
  });
  if (!campaign) throw new Error("Campagne introuvable");

  if (!input.confirmSpend) {
    await prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: {
        error: "Spend non confirmé — campagne reste draft.",
      },
    });
    return {
      campaign,
      launch: {
        status: "needs_confirmation" as const,
        error: "Aucune dépense sans confirmSpend=true.",
      },
    };
  }

  const provider = getSocialProvider(input.platform);
  const auth = await getConnectionAccessToken(input.storeId, input.platform);

  const launch = await provider.launchAdsCampaign({
    accessToken: auth?.token || "",
    draft: {
      name: campaign.name,
      budgetMinor: Number(campaign.budgetAmount || 0),
      currency: campaign.currency || "USD",
      objective:
        ((campaign.performance as { objective?: string } | null)?.objective) ||
        undefined,
    },
    confirmSpend: true,
  });

  const status =
    launch.status === "submitted"
      ? "active"
      : launch.status === "needs_confirmation"
        ? "draft"
        : launch.status === "unavailable"
          ? "failed"
          : "failed";

  const updated = await prisma.marketingCampaign.update({
    where: { id: campaign.id },
    data: {
      status,
      externalCampaignId: launch.externalCampaignId,
      spendConfirmedAt: new Date(),
      spendConfirmedById: input.confirmedById,
      error: launch.error,
      performance: {
        ...(typeof campaign.performance === "object" && campaign.performance
          ? (campaign.performance as object)
          : {}),
        launchRaw: launch.raw || null,
      },
    },
  });

  logger.info("social.ads_launch", {
    storeId: input.storeId,
    campaignId: campaign.id,
    platform: input.platform,
    status: launch.status,
  });

  return { campaign: updated, launch };
}

export async function listCampaigns(storeId: string) {
  return prisma.marketingCampaign.findMany({
    where: { storeId },
    include: { creatives: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
