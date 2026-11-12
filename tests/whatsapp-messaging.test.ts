import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  findOrCreateWhatsAppConversation,
  handoffToHuman,
  sendOutboundText,
} from "../src/lib/messaging/conversations";
import { processAbandonedCartNudges, setMarketingConsent } from "../src/lib/messaging/cart-nudges";
import { loadStoreCatalogFacts, generateSalesAssistantReply } from "../src/lib/messaging/assistant";
import { processInboundWhatsAppMessages } from "../src/lib/messaging/inbound";
import { MockWhatsAppProvider } from "../src/lib/whatsapp";

const prisma = new PrismaClient();

describe("WhatsApp messaging (DB)", () => {
  let storeId = "";
  let variantId = "";

  beforeAll(async () => {
    process.env.WHATSAPP_PROVIDER = "mock";
    process.env.WHATSAPP_WEBHOOK_SECRET = "wa-test-secret";
    process.env.PAYMENT_WEBHOOK_SECRET = "wa-test-secret";
    delete process.env.OPENAI_API_KEY;

    await prisma.role.upsert({
      where: { code: "ORG_OWNER" },
      update: {},
      create: {
        code: "ORG_OWNER",
        name: "Organization Owner",
        scope: "organization",
        permissions: ["org:manage"],
      },
    });
    await prisma.role.upsert({
      where: { code: "STORE_OWNER" },
      update: {},
      create: {
        code: "STORE_OWNER",
        name: "Store Owner",
        scope: "store",
        permissions: ["orders:write"],
      },
    });
    await prisma.plan.upsert({
      where: { code: "trial" },
      update: {},
      create: {
        code: "trial",
        name: { fr: "Essai", en: "Trial" },
        priceAmount: 0,
        currency: "USD",
        interval: "month",
        limits: { stores: 3 },
      },
    });

    const user = await prisma.user.create({
      data: {
        email: `wa-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash("Test1234!", 10),
        name: "WA Tester",
      },
    });

    const org = await prisma.organization.create({
      data: {
        name: "WA Org",
        slug: `wa-org-${Date.now()}`,
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
        name: "Boutique WA",
        slug: `wa-store-${Date.now()}`,
        currency: "USD",
        status: "live",
        settings: { whatsappCta: "+243900000010" },
        members: {
          create: {
            userId: user.id,
            roleId: (
              await prisma.role.findUniqueOrThrow({
                where: { code: "STORE_OWNER" },
              })
            ).id,
            status: "active",
          },
        },
      },
    });
    storeId = store.id;
    process.env.WHATSAPP_DEFAULT_STORE_ID = storeId;

    const product = await prisma.product.create({
      data: {
        storeId,
        name: { fr: "Pagne wax", en: "Wax fabric" },
        slug: `pagne-${Date.now()}`,
        status: "active",
        variants: {
          create: {
            storeId,
            sku: `WA-SKU-${Date.now()}`,
            priceAmount: 2500,
            currency: "USD",
            status: "active",
            inventory: {
              create: { storeId, quantityOnHand: 7, quantityReserved: 1 },
            },
          },
        },
      },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
  });

  it("loads real catalog facts only", async () => {
    const facts = await loadStoreCatalogFacts(storeId, "fr");
    expect(facts.length).toBeGreaterThan(0);
    expect(facts[0].name).toContain("Pagne");
    expect(facts[0].available).toBe(6);
    expect(facts[0].priceMinor).toBe(2500);
  });

  it("assistant fail-closed without OpenAI still grounds on catalog", async () => {
    const conversation = await findOrCreateWhatsAppConversation({
      storeId,
      phoneE164: "+243900000011",
      customerName: "Client",
    });
    const reply = await generateSalesAssistantReply({
      storeId,
      conversationId: conversation.id,
      userMessage: "Quel est le prix ?",
    });
    expect(reply.provider).toBe("noop");
    expect(reply.handoff).toBe(true);
    expect(reply.groundedProductCount).toBeGreaterThan(0);
    expect(reply.text).toMatch(/Pagne|OPENAI|indisponible/i);
    expect(reply.text.toLowerCase()).not.toContain("iphone 99");
  });

  it("handoff disables AI", async () => {
    const conversation = await findOrCreateWhatsAppConversation({
      storeId,
      phoneE164: "+243900000012",
    });
    await handoffToHuman({
      storeId,
      conversationId: conversation.id,
      reason: "test",
    });
    const updated = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(updated.status).toBe("human_handoff");
    expect(updated.aiEnabled).toBe(false);
  });

  it("mock outbound send records message", async () => {
    const conversation = await findOrCreateWhatsAppConversation({
      storeId,
      phoneE164: "+243900000013",
    });
    const { result, message } = await sendOutboundText({
      storeId,
      conversationId: conversation.id,
      body: "Bonjour mock",
    });
    expect(result.status).toBe("sent");
    expect(message.status).toBe("sent");
    expect(message.body).toBe("Bonjour mock");
  });

  it("skips abandoned cart nudge without consent", async () => {
    const customer = await setMarketingConsent({
      storeId,
      phone: "+243900000014",
      consent: false,
      name: "NoConsent",
    });
    await prisma.cart.create({
      data: {
        storeId,
        customerId: customer.id,
        sessionId: `abandon-${Date.now()}`,
        currency: "USD",
        status: "open",
        updatedAt: new Date(Date.now() - 120_000),
        items: {
          create: {
            variantId,
            quantity: 1,
            unitPriceAmount: 2500,
            currency: "USD",
          },
        },
      },
    });

    const res = await processAbandonedCartNudges({
      storeId,
      idleMs: 60_000,
    });
    const skipped = res.results.find((r) => r.reason === "no_consent");
    expect(skipped).toBeTruthy();
  });

  it("sends abandoned cart nudge only with consent", async () => {
    const customer = await setMarketingConsent({
      storeId,
      phone: "+243900000015",
      consent: true,
      name: "Consented",
    });
    const cart = await prisma.cart.create({
      data: {
        storeId,
        customerId: customer.id,
        sessionId: `consent-abandon-${Date.now()}`,
        currency: "USD",
        status: "open",
        updatedAt: new Date(Date.now() - 120_000),
        items: {
          create: {
            variantId,
            quantity: 2,
            unitPriceAmount: 2500,
            currency: "USD",
          },
        },
      },
    });

    const res = await processAbandonedCartNudges({
      storeId,
      idleMs: 60_000,
    });
    const hit = res.results.find((r) => r.cartId === cart.id);
    expect(hit?.status).toBe("sent");

    const refreshed = await prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
    });
    expect(refreshed.abandonedNudgeSentAt).toBeTruthy();
  });

  it("processes signed mock inbound with idempotence", async () => {
    const mock = new MockWhatsAppProvider("wa-test-secret");
    const { body } = mock.buildInboundWebhook({
      fromE164: "+243900000016",
      body: "Bonjour, stock pagne ?",
      phoneNumberId: "mock_phone",
    });
    const payload = JSON.parse(body);
    const msg = payload.messages[0];

    const first = await processInboundWhatsAppMessages([msg]);
    expect(first[0].duplicate).toBeFalsy();
    expect(first[0].conversationId).toBeTruthy();

    const second = await processInboundWhatsAppMessages([msg]);
    expect(second[0].duplicate).toBe(true);
  });
});
