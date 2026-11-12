import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createOrderFromCart } from "../src/lib/commerce/orders";
import {
  confirmCashOnDelivery,
  createPaymentForOrder,
  createRefundForPayment,
} from "../src/lib/commerce/payments";
import { MockPaymentProvider } from "../src/lib/payments/mock-provider";
import { processPaymentWebhook } from "../src/lib/commerce/payments";

const prisma = new PrismaClient();

describe("COD + refunds (DB)", () => {
  let storeId = "";
  let variantId = "";

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.PAYMENT_PROVIDER = "mock";

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
        permissions: ["products:write", "orders:write", "orders:refund"],
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
        email: `cod-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash("Test1234!", 10),
        name: "COD Tester",
      },
    });

    const org = await prisma.organization.create({
      data: {
        name: "COD Org",
        slug: `cod-org-${Date.now()}`,
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
        name: "COD Store",
        slug: `cod-store-${Date.now()}`,
        currency: "CDF",
        status: "live",
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

    const product = await prisma.product.create({
      data: {
        storeId,
        name: { fr: "Sac", en: "Bag" },
        slug: `sac-${Date.now()}`,
        status: "active",
        variants: {
          create: {
            storeId,
            sku: `COD-SKU-${Date.now()}`,
            priceAmount: 15000,
            currency: "CDF",
            status: "active",
            inventory: {
              create: { storeId, quantityOnHand: 5, quantityReserved: 0 },
            },
          },
        },
      },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
  });

  it("COD path stays unpaid until merchant confirm", async () => {
    const cart = await prisma.cart.create({
      data: {
        storeId,
        sessionId: `cod-sess-${Date.now()}`,
        currency: "CDF",
        status: "open",
        items: {
          create: {
            variantId,
            quantity: 1,
            unitPriceAmount: 15000,
            currency: "CDF",
          },
        },
      },
    });

    const order = await createOrderFromCart({
      storeId,
      cartId: cart.id,
      shippingAddress: { city: "Kinshasa", address: "Gombe" },
      customer: { name: "Client COD", phone: "+243900000099" },
    });

    const { payment, intent } = await createPaymentForOrder({
      storeId,
      orderId: order.id,
      returnUrl: "http://localhost/result",
      method: "cash_on_delivery",
    });

    expect(payment.provider).toBe("cash_on_delivery");
    expect(payment.status).toBe("pending");
    expect(intent?.status).toBe("pending");

    const pending = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(pending.status).toBe("cod_pending");
    expect(pending.paymentStatus).toBe("pending");

    await confirmCashOnDelivery({ storeId, orderId: order.id });

    const paid = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(paid.status).toBe("paid");
    expect(paid.paymentStatus).toBe("paid");
  });

  it("mock refund after paid webhook", async () => {
    const cart = await prisma.cart.create({
      data: {
        storeId,
        sessionId: `rf-sess-${Date.now()}`,
        currency: "CDF",
        status: "open",
        items: {
          create: {
            variantId,
            quantity: 1,
            unitPriceAmount: 15000,
            currency: "CDF",
          },
        },
      },
    });

    const order = await createOrderFromCart({
      storeId,
      cartId: cart.id,
      shippingAddress: { city: "Kinshasa", address: "Limete" },
    });

    const { payment } = await createPaymentForOrder({
      storeId,
      orderId: order.id,
      returnUrl: "http://localhost/result",
      method: "mobile_money",
      operator: "mpesa",
    });

    expect(payment.operator).toBe("mpesa");
    expect(payment.status).not.toBe("succeeded");

    const mock = new MockPaymentProvider("test-webhook-secret");
    const { body, signature } = mock.buildSucceededWebhook({
      providerRef: payment.providerRef!,
      idempotencyKey: payment.idempotencyKey,
      amount: Number(payment.amount),
      currency: payment.currency,
    });

    await processPaymentWebhook({
      providerId: "mock",
      rawBody: body,
      signature,
    });

    const { refund } = await createRefundForPayment({
      storeId,
      paymentId: payment.id,
      reason: "Client annulé",
    });

    expect(refund.status).toBe("succeeded");
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.paymentStatus).toBe("refunded");
    expect(after.status).toBe("refunded");
  });

  it("failed mock webhook marks payment failed", async () => {
    const cart = await prisma.cart.create({
      data: {
        storeId,
        sessionId: `fail-sess-${Date.now()}`,
        currency: "CDF",
        status: "open",
        items: {
          create: {
            variantId,
            quantity: 1,
            unitPriceAmount: 15000,
            currency: "CDF",
          },
        },
      },
    });

    const order = await createOrderFromCart({
      storeId,
      cartId: cart.id,
      shippingAddress: { city: "Kinshasa", address: "Ngaliema" },
    });

    const { payment } = await createPaymentForOrder({
      storeId,
      orderId: order.id,
      returnUrl: "http://localhost/result",
      method: "card",
    });

    const mock = new MockPaymentProvider("test-webhook-secret");
    const { body, signature } = mock.buildFailedWebhook({
      providerRef: payment.providerRef!,
      idempotencyKey: payment.idempotencyKey,
      amount: Number(payment.amount),
      currency: payment.currency,
    });

    await processPaymentWebhook({
      providerId: "mock",
      rawBody: body,
      signature,
    });

    const failedPay = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const failedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(failedPay.status).toBe("failed");
    expect(failedOrder.paymentStatus).toBe("failed");
    expect(failedOrder.status).not.toBe("paid");
  });
});
