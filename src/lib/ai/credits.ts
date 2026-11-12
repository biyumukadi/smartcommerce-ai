import { prisma } from "@/lib/db";
import { CREDIT_COSTS } from "./strategies";
import { getOrgPlanContext } from "@/lib/billing/enforcement";

export class CreditsExceededError extends Error {
  constructor(used: number, limit: number) {
    super(
      `Crédits AI épuisés (${used}/${limit}). Augmentez la limite plan ou attendez la prochaine période.`,
    );
    this.name = "CreditsExceededError";
  }
}

function periodBounds(now = new Date()) {
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return { periodStart, periodEnd };
}

async function planAiCreditLimit(organizationId: string) {
  try {
    const { limits } = await getOrgPlanContext(organizationId);
    return limits.aiCredits;
  } catch {
    return Number(process.env.AI_CREDITS_LIMIT || 500);
  }
}

export async function getOrCreateUsage(organizationId: string) {
  const { periodStart, periodEnd } = periodBounds();
  const creditsLimit = await planAiCreditLimit(organizationId);
  return prisma.aIUsage.upsert({
    where: { organizationId_periodStart: { organizationId, periodStart } },
    update: { creditsLimit },
    create: {
      organizationId,
      periodStart,
      periodEnd,
      tokensUsed: 0,
      imageCount: 0,
      videoCount: 0,
      creditsUsed: 0,
      creditsLimit,
      costMinor: 0,
      currency: "USD",
    },
  });
}

export async function assertCreditsAvailable(
  organizationId: string,
  jobType: string,
) {
  const cost = CREDIT_COSTS[jobType] ?? 3;
  const usage = await getOrCreateUsage(organizationId);
  if (usage.creditsUsed + cost > usage.creditsLimit) {
    throw new CreditsExceededError(usage.creditsUsed, usage.creditsLimit);
  }
  return { usage, cost };
}

export async function incrementUsage(
  organizationId: string,
  delta: {
    tokens?: number;
    images?: number;
    videos?: number;
    credits?: number;
    costMinor?: number;
  },
) {
  const { periodStart, periodEnd } = periodBounds();
  const limit = Number(process.env.AI_CREDITS_LIMIT || 500);
  return prisma.aIUsage.upsert({
    where: { organizationId_periodStart: { organizationId, periodStart } },
    update: {
      tokensUsed: { increment: delta.tokens ?? 0 },
      imageCount: { increment: delta.images ?? 0 },
      videoCount: { increment: delta.videos ?? 0 },
      creditsUsed: { increment: delta.credits ?? 0 },
      costMinor: { increment: delta.costMinor ?? 0 },
    },
    create: {
      organizationId,
      periodStart,
      periodEnd,
      tokensUsed: delta.tokens ?? 0,
      imageCount: delta.images ?? 0,
      videoCount: delta.videos ?? 0,
      creditsUsed: delta.credits ?? 0,
      creditsLimit: limit,
      costMinor: delta.costMinor ?? 0,
      currency: "USD",
    },
  });
}

export function creditCostFor(jobType: string) {
  return CREDIT_COSTS[jobType] ?? 3;
}
