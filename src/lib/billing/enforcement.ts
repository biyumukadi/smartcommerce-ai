import { prisma } from "@/lib/db";
import {
  getOrganizationSubscription,
  subscriptionLimits,
} from "./subscriptions";
import type { PlanLimits } from "./plans";

export class PlanLimitError extends Error {
  constructor(
    public limitKey: keyof PlanLimits,
    public used: number,
    public limit: number,
  ) {
    super(
      `Limite plan atteinte (${limitKey}: ${used}/${limit}). Passez à un plan supérieur.`,
    );
    this.name = "PlanLimitError";
  }
}

export async function getOrgPlanContext(organizationId: string) {
  const sub = await getOrganizationSubscription(organizationId);
  const limits = subscriptionLimits(sub);
  const status = sub?.status || "none";
  const pastDue = status === "past_due" || status === "cancelled";
  return { sub, limits, status, pastDue };
}

export async function assertCanCreateStore(organizationId: string) {
  const { limits, pastDue } = await getOrgPlanContext(organizationId);
  if (pastDue) throw new PlanLimitError("stores", 0, 0);
  const used = await prisma.store.count({
    where: { organizationId, deletedAt: null },
  });
  if (used >= limits.stores) {
    throw new PlanLimitError("stores", used, limits.stores);
  }
  return { used, limit: limits.stores };
}

export async function assertCanCreateProduct(
  organizationId: string,
  storeId: string,
) {
  const { limits } = await getOrgPlanContext(organizationId);
  const used = await prisma.product.count({
    where: { storeId, deletedAt: null },
  });
  if (used >= limits.products) {
    throw new PlanLimitError("products", used, limits.products);
  }
  return { used, limit: limits.products };
}

export async function assertAiCreditsAvailable(organizationId: string) {
  const { limits } = await getOrgPlanContext(organizationId);
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const usage = await prisma.aIUsage.findUnique({
    where: {
      organizationId_periodStart: { organizationId, periodStart },
    },
  });
  const used = usage?.creditsUsed ?? 0;
  // Prefer plan aiCredits; AIUsage.creditsLimit may lag
  const limit = Math.min(
    limits.aiCredits,
    usage?.creditsLimit ?? limits.aiCredits,
  );
  if (used >= limit) {
    throw new PlanLimitError("aiCredits", used, limit);
  }
  return { used, limit };
}

export async function assertFeatureEnabled(
  organizationId: string,
  feature: "social" | "crm" | "analyticsAssistant",
) {
  const { limits } = await getOrgPlanContext(organizationId);
  if (feature === "social" && !limits.social) {
    throw new Error("Fonctionnalité Social réservée aux plans Business/Premium");
  }
  if (feature === "analyticsAssistant" && !limits.analyticsAssistant) {
    throw new Error(
      "Assistant analytique réservé aux plans Business/Premium (ou essai)",
    );
  }
  if (feature === "crm" && !limits.crm) {
    throw new Error("CRM non inclus dans ce plan");
  }
}

/** Sync AIUsage.creditsLimit from current plan */
export async function syncAiCreditsLimit(organizationId: string) {
  const { limits } = await getOrgPlanContext(organizationId);
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  return prisma.aIUsage.upsert({
    where: { organizationId_periodStart: { organizationId, periodStart } },
    update: { creditsLimit: limits.aiCredits },
    create: {
      organizationId,
      periodStart,
      periodEnd,
      creditsLimit: limits.aiCredits,
      creditsUsed: 0,
      tokensUsed: 0,
      imageCount: 0,
      videoCount: 0,
      costMinor: 0,
      currency: "USD",
    },
  });
}
