import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  adjustLoyalty,
  createComplaint,
  createMarketingAutomation,
  createPersonalCoupon,
  ensureDefaultSegments,
  evaluateSegment,
  refreshCustomerStats,
  runMarketingAutomation,
  upsertCustomer,
} from "../src/lib/crm";
import {
  buildStoreAnalytics,
  runAnalyticsAssistant,
} from "../src/lib/analytics";
import { recordAttributionEvent } from "../src/lib/social/attribution";
import { ensureOrgAndStoreRoles } from "./helpers/ensure-basics";

const prisma = new PrismaClient();

describe("CRM + analytics Phase 7 (DB)", () => {
  let storeId = "";
  let customerId = "";

  beforeAll(async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.WHATSAPP_PROVIDER = "mock";

    await ensureOrgAndStoreRoles(prisma);

    const user = await prisma.user.create({
      data: {
        email: `crm-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash("Test1234!", 10),
        name: "CRM Tester",
      },
    });
    const org = await prisma.organization.create({
      data: {
        name: "CRM Org",
        slug: `crm-org-${Date.now()}`,
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
    const store = await prisma.store.create({
      data: {
        organizationId: org.id,
        name: "CRM Store",
        slug: `crm-store-${Date.now()}`,
        currency: "USD",
        status: "live",
        members: {
          create: {
            userId: user.id,
            roleId: (
              await prisma.role.findUniqueOrThrow({
                where: { code: "STORE_OWNER" },
              })
            ).id,
          },
        },
      },
    });
    storeId = store.id;

    const customer = await upsertCustomer({
      storeId,
      name: "Amina",
      phone: "2438000111222",
      lifecycle: "prospect",
      marketingConsentWhatsApp: false,
    });
    customerId = customer.id;
  });

  it("tracks loyalty, personal coupon, and complaints", async () => {
    const loyalty = await adjustLoyalty({
      storeId,
      customerId,
      type: "earn",
      points: 50,
      reason: "welcome",
    });
    expect(loyalty.customer.loyaltyPoints).toBe(50);

    const coupon = await createPersonalCoupon({
      storeId,
      customerId,
      type: "percent",
      valueMinor: 15,
    });
    expect(coupon.code).toMatch(/^PERS-/);
    expect(coupon.customerId).toBe(customerId);

    const complaint = await createComplaint({
      storeId,
      customerId,
      subject: "Livraison retardée",
      body: "Colis non reçu",
    });
    expect(complaint.status).toBe("open");
  });

  it("segments and blocks campaigns without consent", async () => {
    await ensureDefaultSegments(storeId);
    await refreshCustomerStats(storeId, customerId);

    const prospects = await evaluateSegment(storeId, "prospects");
    expect(prospects.count).toBeGreaterThanOrEqual(1);

    const campaign = await createMarketingAutomation({
      storeId,
      name: "Test WA",
      channel: "whatsapp",
      segmentKey: "prospects",
      messageTemplate: "Salut {{name}}",
      requireConsent: true,
    });

    const blocked = await runMarketingAutomation({
      storeId,
      automationId: campaign.id,
      confirmSend: true,
    });
    expect(blocked.status).toBe("blocked_no_consent");

    const needs = await runMarketingAutomation({
      storeId,
      automationId: campaign.id,
      confirmSend: false,
    });
    expect(needs.status).toBe("needs_confirmation");
  });

  it("sends only to consented customers (mock WA)", async () => {
    await upsertCustomer({
      storeId,
      id: customerId,
      marketingConsentWhatsApp: true,
    });
    await refreshCustomerStats(storeId, customerId);

    const campaign = await createMarketingAutomation({
      storeId,
      name: "Consent OK",
      channel: "whatsapp",
      segmentKey: "consent_whatsapp",
      messageTemplate: "Bonjour {{name}} pts={{points}}",
      requireConsent: true,
    });

    const result = await runMarketingAutomation({
      storeId,
      automationId: campaign.id,
      confirmSend: true,
    });
    expect(result.status).toBe("completed");
    expect(result.automation?.sentCount).toBeGreaterThanOrEqual(1);
  });

  it("builds analytics with attribution and fail-closed assistant", async () => {
    await recordAttributionEvent({
      storeId,
      source: "whatsapp",
      medium: "chat",
    });
    await recordAttributionEvent({
      storeId,
      source: "tiktok",
      medium: "cpc",
    });

    const analytics = await buildStoreAnalytics(storeId, { period: "month" });
    expect(analytics.kpis).toBeDefined();
    expect(analytics.channelAttribution.some((c) => c.source === "whatsapp")).toBe(
      true,
    );
    expect(analytics.revenueSeries).toBeDefined();

    delete process.env.OPENAI_API_KEY;
    const assistant = await runAnalyticsAssistant({
      analytics,
      locale: "fr",
    });
    expect(assistant.status).toBe("unavailable");
    expect(assistant.recommendations).toBeTruthy();
    expect(assistant.notice || "").toMatch(/Clé LLM|heuristiques/i);
  });
});
