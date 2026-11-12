import { prisma } from "@/lib/db";
import { getPaymentProvider, MockPaymentProvider } from "@/lib/payments";
import { markOrderPaid } from "@/lib/commerce/orders";
import { logger } from "@/lib/logger";
import type { WebhookEvent } from "@/lib/payments";

export async function createPaymentForOrder(input: {
  storeId: string;
  orderId: string;
  returnUrl: string;
  method?: "card" | "mobile_money" | "bank" | "other";
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
  });
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "paid") {
    throw new Error("Order already paid");
  }

  const idempotencyKey = `pay_${order.id}`;
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
  });
  if (existing && existing.status === "succeeded") {
    return { payment: existing, intent: null };
  }

  const provider = getPaymentProvider();
  const intent = await provider.createIntent({
    amount: Number(order.totalAmount),
    currency: order.currency,
    orderId: order.id,
    storeId: order.storeId,
    idempotencyKey,
    method: input.method || "mobile_money",
    returnUrl: input.returnUrl,
  });

  const payment =
    existing ??
    (await prisma.payment.create({
      data: {
        storeId: order.storeId,
        orderId: order.id,
        provider: provider.id,
        providerRef: intent.providerRef,
        idempotencyKey,
        method: input.method || "mobile_money",
        status: "requires_action",
        amount: order.totalAmount,
        currency: order.currency,
        rawPayload: (intent.raw ?? {}) as object,
      },
    }));

  if (existing) {
    await prisma.payment.update({
      where: { id: existing.id },
      data: {
        providerRef: intent.providerRef,
        status: "requires_action",
        rawPayload: (intent.raw ?? {}) as object,
      },
    });
  }

  return { payment, intent };
}

export async function processPaymentWebhook(input: {
  providerId: string;
  rawBody: string;
  signature: string | null;
}) {
  const provider = getPaymentProvider();
  if (provider.id !== input.providerId && input.providerId !== "mock") {
    // Allow mock confirm endpoint even if default is mock
  }

  const active =
    input.providerId === "mock"
      ? new MockPaymentProvider()
      : provider.id === input.providerId
        ? provider
        : null;

  if (!active) {
    throw new Error(`Provider mismatch: expected ${provider.id}`);
  }

  const event: WebhookEvent = await active.parseWebhook(
    input.rawBody,
    input.signature,
  );

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: {
      provider_eventKey: {
        provider: active.id,
        eventKey: event.eventKey,
      },
    },
  });
  if (existingEvent?.processedAt) {
    logger.info("webhook.duplicate", {
      provider: active.id,
      eventKey: event.eventKey,
    });
    return { duplicate: true, event };
  }

  await prisma.webhookEvent.upsert({
    where: {
      provider_eventKey: {
        provider: active.id,
        eventKey: event.eventKey,
      },
    },
    update: {},
    create: {
      provider: active.id,
      eventKey: event.eventKey,
      payload: event.raw as object,
    },
  });

  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { providerRef: event.providerRef },
        event.idempotencyKey
          ? { idempotencyKey: event.idempotencyKey }
          : undefined,
      ].filter(Boolean) as { providerRef?: string; idempotencyKey?: string }[],
    },
  });

  if (!payment) {
    throw new Error(`Payment not found for providerRef ${event.providerRef}`);
  }

  if (event.type === "payment.succeeded") {
    // Never mark paid without this provider-confirmed event path
    await markOrderPaid({
      storeId: payment.storeId,
      orderId: payment.orderId,
      paymentId: payment.id,
      providerRef: event.providerRef,
    });
  } else if (event.type === "payment.failed") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "failed", rawPayload: event.raw as object },
    });
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: "failed" },
    });
  }

  await prisma.webhookEvent.update({
    where: {
      provider_eventKey: {
        provider: active.id,
        eventKey: event.eventKey,
      },
    },
    data: { processedAt: new Date(), payload: event.raw as object },
  });

  logger.info("webhook.processed", {
    provider: active.id,
    eventKey: event.eventKey,
    type: event.type,
    storeId: payment.storeId,
  });

  return { duplicate: false, event, paymentId: payment.id };
}

export async function confirmMockPayment(providerRef: string) {
  const payment = await prisma.payment.findFirst({
    where: { providerRef, provider: "mock" },
  });
  if (!payment) throw new Error("Mock payment not found");

  const mock = new MockPaymentProvider();
  const { body, signature } = mock.buildSucceededWebhook({
    providerRef: payment.providerRef!,
    idempotencyKey: payment.idempotencyKey,
    amount: Number(payment.amount),
    currency: payment.currency,
  });

  return processPaymentWebhook({
    providerId: "mock",
    rawBody: body,
    signature,
  });
}
