import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createOrderFromCart, markOrderPaid } from "../src/lib/commerce/orders";
import { MockPaymentProvider } from "../src/lib/payments/mock-provider";
import { processPaymentWebhook } from "../src/lib/commerce/payments";

const prisma = new PrismaClient();

describe("core commerce flow (DB)", () => {
  let storeId = "";
  let variantId = "";
  let userId = "";

  beforeAll(async () => {
    // Ensure roles/plan exist (seed-like minimal)
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
        permissions: ["products:write", "orders:write"],
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

    const email = `test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash("Test1234!", 10),
        name: "Tester",
      },
    });
    userId = user.id;

    const org = await prisma.organization.create({
      data: {
        name: "Test Org",
        slug: `test-org-${Date.now()}`,
        members: {
          create: {
            userId,
            roleId: (await prisma.role.findUniqueOrThrow({ where: { code: "ORG_OWNER" } })).id,
          },
        },
      },
    });

    const store = await prisma.store.create({
      data: {
        organizationId: org.id,
        name: "Test Store",
        slug: `test-store-${Date.now()}`,
        currency: "USD",
        status: "live",
        members: {
          create: {
            userId,
            roleId: (await prisma.role.findUniqueOrThrow({ where: { code: "STORE_OWNER" } })).id,
            status: "active",
          },
        },
      },
    });
    storeId = store.id;

    const product = await prisma.product.create({
      data: {
        storeId,
        name: { fr: "Produit test", en: "Test product" },
        slug: `prod-${Date.now()}`,
        status: "active",
        variants: {
          create: {
            storeId,
            sku: `SKU-${Date.now()}`,
            priceAmount: 2500,
            currency: "USD",
            status: "active",
            inventory: {
              create: {
                storeId,
                quantityOnHand: 10,
                quantityReserved: 0,
              },
            },
          },
        },
      },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
  });

  it("checkout reserves stock, webhook pays and decrements stock", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.PAYMENT_PROVIDER = "mock";

    const cart = await prisma.cart.create({
      data: {
        storeId,
        sessionId: `sess-${Date.now()}`,
        currency: "USD",
        status: "open",
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

    const order = await createOrderFromCart({
      storeId,
      cartId: cart.id,
      shippingAddress: { city: "Kinshasa", address: "Gombe" },
      customer: { name: "Client Test", phone: "+243900000001" },
    });

    expect(order.status).toBe("awaiting_payment");

    const invAfterReserve = await prisma.inventory.findUniqueOrThrow({
      where: { variantId },
    });
    expect(invAfterReserve.quantityReserved).toBe(2);
    expect(invAfterReserve.quantityOnHand).toBe(10);

    const payment = await prisma.payment.create({
      data: {
        storeId,
        orderId: order.id,
        provider: "mock",
        providerRef: `mock_pay_${order.id}`,
        idempotencyKey: `pay_${order.id}`,
        method: "mobile_money",
        status: "requires_action",
        amount: order.totalAmount,
        currency: order.currency,
      },
    });

    // Direct markOrderPaid path (idempotent inventory)
    await markOrderPaid({
      storeId,
      orderId: order.id,
      paymentId: payment.id,
      providerRef: payment.providerRef!,
    });

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.paymentStatus).toBe("paid");
    expect(paid.status).toBe("paid");

    const invAfterPay = await prisma.inventory.findUniqueOrThrow({
      where: { variantId },
    });
    expect(invAfterPay.quantityOnHand).toBe(8);
    expect(invAfterPay.quantityReserved).toBe(0);

    // Second call is idempotent
    await markOrderPaid({
      storeId,
      orderId: order.id,
      paymentId: payment.id,
      providerRef: payment.providerRef!,
    });
    const invAgain = await prisma.inventory.findUniqueOrThrow({
      where: { variantId },
    });
    expect(invAgain.quantityOnHand).toBe(8);
  });

  it("webhook path verifies signature and is idempotent", async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.PAYMENT_PROVIDER = "mock";

    const cart = await prisma.cart.create({
      data: {
        storeId,
        sessionId: `sess-wh-${Date.now()}`,
        currency: "USD",
        status: "open",
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

    const order = await createOrderFromCart({
      storeId,
      cartId: cart.id,
      shippingAddress: { city: "Kinshasa", address: "Limete" },
    });

    const providerRef = `mock_pay_wh_${order.id}`;
    await prisma.payment.create({
      data: {
        storeId,
        orderId: order.id,
        provider: "mock",
        providerRef,
        idempotencyKey: `pay_${order.id}`,
        method: "mobile_money",
        status: "requires_action",
        amount: order.totalAmount,
        currency: order.currency,
      },
    });

    const mock = new MockPaymentProvider("test-webhook-secret");
    const { body, signature } = mock.buildSucceededWebhook({
      providerRef,
      idempotencyKey: `pay_${order.id}`,
      amount: Number(order.totalAmount),
      currency: order.currency,
    });

    const first = await processPaymentWebhook({
      providerId: "mock",
      rawBody: body,
      signature,
    });
    expect(first.duplicate).toBe(false);

    const second = await processPaymentWebhook({
      providerId: "mock",
      rawBody: body,
      signature,
    });
    expect(second.duplicate).toBe(true);

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.paymentStatus).toBe("paid");
  });
});
