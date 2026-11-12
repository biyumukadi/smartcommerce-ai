import { prisma } from "@/lib/db";
import { parsePlanLimits, SAAS_PLANS, type CostCategory } from "./plans";
import {
  resolveSaasBillingProvider,
  startSaasCheckout,
} from "./provider";
import { writeAuditLog } from "@/lib/security/audit";
import { randomBytes } from "crypto";

export async function ensureSaasPlansSeeded() {
  for (const plan of SAAS_PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        interval: plan.interval,
        limits: plan.limits,
        isActive: true,
      },
      create: {
        code: plan.code,
        name: plan.name,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        interval: plan.interval,
        limits: plan.limits,
        isActive: true,
      },
    });
  }
  await prisma.plan.upsert({
    where: { code: "trial" },
    update: {
      limits: {
        stores: 3,
        products: 100,
        staff: 5,
        aiCredits: 50,
        campaigns: 5,
        crm: true,
        social: true,
        analyticsAssistant: true,
        features: ["trial_all"],
      },
    },
    create: {
      code: "trial",
      name: { fr: "Essai", en: "Trial" },
      priceAmount: 0,
      currency: "USD",
      interval: "month",
      limits: {
        stores: 3,
        products: 100,
        staff: 5,
        aiCredits: 50,
        campaigns: 5,
        crm: true,
        social: true,
        analyticsAssistant: true,
        features: ["trial_all"],
      },
      isActive: true,
    },
  });
}

export async function getOrganizationSubscription(organizationId: string) {
  return prisma.subscription.findFirst({
    where: { organizationId },
    include: { plan: true, invoices: { orderBy: { createdAt: "desc" }, take: 12 } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPublicPlans() {
  await ensureSaasPlansSeeded();
  return prisma.plan.findMany({
    where: { isActive: true, code: { in: ["starter", "business", "premium", "trial"] } },
    orderBy: { priceAmount: "asc" },
  });
}

function periodBounds(from = new Date()) {
  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1),
  );
  return { start, end };
}

export async function changePlan(input: {
  organizationId: string;
  planCode: string;
  userId: string;
  userEmail: string;
  confirmPurchase: boolean;
  successUrl: string;
  cancelUrl: string;
}) {
  await ensureSaasPlansSeeded();
  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || !plan.isActive) throw new Error("Plan introuvable");

  const existing = await getOrganizationSubscription(input.organizationId);
  if (!existing) throw new Error("Abonnement introuvable");

  // Free / trial changes don't need billing provider
  if (Number(plan.priceAmount) === 0) {
    const { start, end } = periodBounds();
    const updated = await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        status: "trialing",
        currentPeriodStart: start,
        currentPeriodEnd: end,
        billingProvider: "none",
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
      include: { plan: true },
    });
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.userId,
      action: "billing.plan_changed_free",
      entityType: "Subscription",
      entityId: updated.id,
      diff: { planCode: plan.code },
    });
    return { subscription: updated, checkout: null as null };
  }

  const checkout = await startSaasCheckout({
    organizationId: input.organizationId,
    planCode: plan.code,
    priceAmount: Number(plan.priceAmount),
    currency: plan.currency,
    customerEmail: input.userEmail,
    confirmPurchase: input.confirmPurchase,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });

  if (checkout.status === "mock_activated") {
    const { start, end } = periodBounds();
    const updated = await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        status: "active",
        currentPeriodStart: start,
        currentPeriodEnd: end,
        billingProvider: "mock",
        externalSubscriptionId: `mock_sub_${randomBytes(4).toString("hex")}`,
      },
      include: { plan: true },
    });

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId: updated.id,
        number: `INV-${Date.now()}-${randomBytes(2).toString("hex")}`,
        amount: plan.priceAmount,
        currency: plan.currency,
        status: "paid",
        kind: "saas_subscription",
        paidAt: new Date(),
        lineItems: [
          {
            description: `Abonnement SaaS ${plan.code}`,
            amountMinor: Number(plan.priceAmount),
          },
        ],
      },
    });

    await recordCost({
      organizationId: input.organizationId,
      category: "saas_fee",
      amountMinor: Number(plan.priceAmount),
      currency: plan.currency,
      description: `Plan ${plan.code} (mock)`,
      externalRef: invoice.id,
    });

    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.userId,
      action: "billing.plan_activated_mock",
      entityType: "Subscription",
      entityId: updated.id,
      diff: { planCode: plan.code, invoiceId: invoice.id },
    });

    return { subscription: updated, checkout, invoice };
  }

  // Stripe redirect or unavailable — do NOT mark paid
  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: "billing.checkout_started",
    entityType: "Subscription",
    entityId: existing.id,
    diff: { planCode: plan.code, checkoutStatus: checkout.status },
  });

  return { subscription: existing, checkout };
}

export async function recordCost(input: {
  organizationId: string;
  storeId?: string;
  category: CostCategory;
  amountMinor: number;
  currency?: string;
  description?: string;
  externalRef?: string;
  metadata?: object;
}) {
  return prisma.costLedger.create({
    data: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      category: input.category,
      amountMinor: input.amountMinor,
      currency: input.currency || "USD",
      description: input.description,
      externalRef: input.externalRef,
      metadata: input.metadata || undefined,
    },
  });
}

export async function summarizeCosts(organizationId: string) {
  const rows = await prisma.costLedger.groupBy({
    by: ["category"],
    where: { organizationId },
    _sum: { amountMinor: true },
  });
  return rows.map((r) => ({
    category: r.category,
    amountMinor: r._sum.amountMinor || 0,
  }));
}

export function subscriptionLimits(sub: {
  plan: { limits: unknown; code: string };
} | null) {
  if (!sub) return parsePlanLimits(null);
  return parsePlanLimits(sub.plan.limits);
}

export { resolveSaasBillingProvider };
