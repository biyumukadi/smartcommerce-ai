import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  changePlan,
  ensureSaasPlansSeeded,
  resolveSaasBillingProvider,
  SAAS_PLANS,
  assertCanCreateStore,
  PlanLimitError,
  recordCost,
  summarizeCosts,
} from "../src/lib/billing";
import { ensureOrgAndStoreRoles } from "./helpers/ensure-basics";

const prisma = new PrismaClient();

describe("SaaS billing Phase 8", () => {
  const env = { ...process.env };
  let organizationId = "";
  let userId = "";

  afterEach(() => {
    process.env = { ...env };
  });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    await ensureSaasPlansSeeded();
    await ensureOrgAndStoreRoles(prisma);

    const user = await prisma.user.create({
      data: {
        email: `saas-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash("Test1234!", 10),
        name: "SaaS Tester",
      },
    });
    userId = user.id;
    const org = await prisma.organization.create({
      data: {
        name: "SaaS Org",
        slug: `saas-org-${Date.now()}`,
        members: {
          create: {
            userId: user.id,
            roleId: (
              await prisma.role.findUniqueOrThrow({ where: { code: "ORG_OWNER" } })
            ).id,
          },
        },
      },
    });
    organizationId = org.id;
    const trial = await prisma.plan.findUniqueOrThrow({ where: { code: "trial" } });
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    await prisma.subscription.create({
      data: {
        organizationId,
        planId: trial.id,
        status: "trialing",
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });
  });

  it("defines Starter 19 / Business 49 / Premium 99 USD", () => {
    expect(SAAS_PLANS.find((p) => p.code === "starter")?.priceAmount).toBe(1900);
    expect(SAAS_PLANS.find((p) => p.code === "business")?.priceAmount).toBe(4900);
    expect(SAAS_PLANS.find((p) => p.code === "premium")?.priceAmount).toBe(9900);
  });

  it("fail-closed paid plan without billing keys", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.SAAS_BILLING_PROVIDER = "unavailable";
    expect(resolveSaasBillingProvider()).toBe("unavailable");

    const result = await changePlan({
      organizationId,
      planCode: "starter",
      userId,
      userEmail: "saas@example.com",
      confirmPurchase: true,
      successUrl: "http://localhost/ok",
      cancelUrl: "http://localhost/cancel",
    });
    expect(result.checkout?.status).toBe("unavailable");
    const sub = await prisma.subscription.findFirstOrThrow({
      where: { organizationId },
      include: { plan: true },
    });
    expect(sub.plan.code).toBe("trial"); // not silently upgraded
  });

  it("requires confirmPurchase", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    const result = await changePlan({
      organizationId,
      planCode: "business",
      userId,
      userEmail: "saas@example.com",
      confirmPurchase: false,
      successUrl: "http://localhost/ok",
      cancelUrl: "http://localhost/cancel",
    });
    expect(result.checkout?.status).toBe("needs_confirmation");
  });

  it("mock billing activates paid plan + saas_fee ledger", async () => {
    process.env.SAAS_BILLING_PROVIDER = "mock";
    const result = await changePlan({
      organizationId,
      planCode: "starter",
      userId,
      userEmail: "saas@example.com",
      confirmPurchase: true,
      successUrl: "http://localhost/ok",
      cancelUrl: "http://localhost/cancel",
    });
    expect(result.checkout?.status).toBe("mock_activated");
    expect(result.subscription.plan.code).toBe("starter");
    expect(result.subscription.status).toBe("active");

    const costs = await summarizeCosts(organizationId);
    expect(costs.some((c) => c.category === "saas_fee" && c.amountMinor > 0)).toBe(
      true,
    );

    await recordCost({
      organizationId,
      category: "ads_spend",
      amountMinor: 5000,
      description: "Meta ads external",
    });
    const after = await summarizeCosts(organizationId);
    expect(after.find((c) => c.category === "ads_spend")?.amountMinor).toBe(5000);
  });

  it("enforces store limits on starter", async () => {
    // starter allows 1 store — create one then assert second fails
    await prisma.store.create({
      data: {
        organizationId,
        name: "Only Store",
        slug: `only-${Date.now()}`,
        currency: "USD",
        status: "live",
      },
    });
    await expect(assertCanCreateStore(organizationId)).rejects.toBeInstanceOf(
      PlanLimitError,
    );
  });
});
