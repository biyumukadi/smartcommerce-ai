import { prisma } from "@/lib/db";
import {
  getPaymentProvider,
  getPaymentProviderForMethod,
  getProviderById,
  MockPaymentProvider,
  type MobileMoneyOperator,
  type PaymentMethodKind,
  type WebhookEvent,
} from "@/lib/payments";
import { markOrderPaid } from "@/lib/commerce/orders";
import { logger } from "@/lib/logger";
import type { PaymentMethod, PaymentRecordStatus, Prisma } from "@prisma/client";

function mapIntentStatus(
  status: string,
): PaymentRecordStatus {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
    case "unavailable":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "requires_action":
      return "requires_action";
    default:
      return "pending";
  }
}

export async function createPaymentForOrder(input: {
  storeId: string;
  orderId: string;
  returnUrl: string;
  method?: PaymentMethodKind;
  operator?: MobileMoneyOperator;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
  });
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "paid") {
    throw new Error("Order already paid");
  }

  const method: PaymentMethodKind = input.method || "mobile_money";

  // Cash on delivery — explicit offline path (never card success)
  if (method === "cash_on_delivery") {
    const provider = getPaymentProviderForMethod("cash_on_delivery");
    const idempotencyKey = `pay_${order.id}_cod`;
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { payment: existing, intent: null, mode: provider.mode };
    }

    const intent = await provider.createIntent({
      amount: Number(order.totalAmount),
      currency: order.currency,
      orderId: order.id,
      storeId: order.storeId,
      idempotencyKey,
      method: "cash_on_delivery",
      returnUrl: input.returnUrl,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      customerName: input.customerName,
    });

    const payment = await prisma.payment.create({
      data: {
        storeId: order.storeId,
        orderId: order.id,
        provider: provider.id,
        providerRef: intent.providerRef,
        idempotencyKey,
        method: "cash_on_delivery",
        status: "pending",
        amount: order.totalAmount,
        currency: order.currency,
        operator: null,
        rawPayload: (intent.raw ?? {}) as Prisma.InputJsonValue,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "cod_pending",
        paymentStatus: "pending",
      },
    });

    return { payment, intent, mode: provider.mode };
  }

  const idempotencyKey = `pay_${order.id}`;
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
  });
  if (existing && existing.status === "succeeded") {
    return { payment: existing, intent: null, mode: existing.provider };
  }

  const provider = getPaymentProviderForMethod(method);
  const intent = await provider.createIntent({
    amount: Number(order.totalAmount),
    currency: order.currency,
    orderId: order.id,
    storeId: order.storeId,
    idempotencyKey,
    method,
    operator: input.operator,
    returnUrl: input.returnUrl,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    customerName: input.customerName,
  });

  const status = mapIntentStatus(intent.status);

  // Never mark order paid from createIntent — even if provider returns succeeded,
  // we require webhook confirmation (except we still store the intent state).
  const prismaMethod: PaymentMethod =
    method === "card" || method === "mobile_money" || method === "bank"
      ? method
      : "other";

  const paymentData = {
    storeId: order.storeId,
    orderId: order.id,
    provider: provider.id,
    providerRef: intent.providerRef,
    idempotencyKey,
    method: prismaMethod,
    status: status === "succeeded" ? ("requires_action" as const) : status,
    amount: order.totalAmount,
    currency: order.currency,
    operator: input.operator || null,
    rawPayload: (intent.raw ?? {}) as Prisma.InputJsonValue,
  };

  const payment =
    existing ??
    (await prisma.payment.create({
      data: paymentData,
    }));

  if (existing) {
    await prisma.payment.update({
      where: { id: existing.id },
      data: {
        providerRef: intent.providerRef,
        status: paymentData.status,
        operator: input.operator || null,
        rawPayload: paymentData.rawPayload,
      },
    });
  }

  if (status === "failed" || status === "cancelled") {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "failed" },
    });
  }

  return {
    payment: existing
      ? await prisma.payment.findUniqueOrThrow({ where: { id: existing.id } })
      : payment,
    intent: {
      ...intent,
      // Force client path through webhook for success claims
      status:
        intent.status === "succeeded" ? ("requires_action" as const) : intent.status,
    },
    mode: provider.mode,
  };
}

export async function processPaymentWebhook(input: {
  providerId: string;
  rawBody: string;
  signature: string | null;
}) {
  const defaultProvider = getPaymentProvider();
  let active;
  try {
    active =
      input.providerId === "mock"
        ? new MockPaymentProvider()
        : getProviderById(input.providerId);
  } catch {
    active = null;
  }

  if (!active) {
    throw new Error(`Unknown provider: ${input.providerId}`);
  }

  if (
    active.mode === "unavailable" ||
    active.id === "cash_on_delivery"
  ) {
    throw new Error(
      `Webhooks non acceptés pour provider ${active.id} (${active.mode})`,
    );
  }

  // Soft check: preferred default vs webhook provider (allow mock confirm in any env for sandbox)
  if (
    input.providerId !== "mock" &&
    defaultProvider.id !== input.providerId &&
    defaultProvider.mode !== "unavailable"
  ) {
    logger.info("webhook.provider_mismatch_note", {
      expected: defaultProvider.id,
      received: input.providerId,
    });
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
  } else if (event.type === "refund.succeeded") {
    await prisma.refund.updateMany({
      where: {
        paymentId: payment.id,
        status: "pending",
      },
      data: { status: "succeeded", providerRef: event.providerRef },
    });
    const refunds = await prisma.refund.findMany({
      where: { paymentId: payment.id, status: "succeeded" },
    });
    const refundedTotal = refunds.reduce((s, r) => s + Number(r.amount), 0);
    const paidAmount = Number(payment.amount);
    await prisma.order.update({
      where: { id: payment.orderId },
      data: {
        paymentStatus:
          refundedTotal >= paidAmount ? "refunded" : "partially_refunded",
        status: refundedTotal >= paidAmount ? "refunded" : undefined,
      },
    });
  } else if (event.type === "refund.failed") {
    await prisma.refund.updateMany({
      where: { paymentId: payment.id, status: "pending" },
      data: { status: "failed" },
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

/** Merchant confirms cash collected for COD orders */
export async function confirmCashOnDelivery(input: {
  storeId: string;
  orderId: string;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
    include: { payments: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.status !== "cod_pending" && order.paymentStatus !== "pending") {
    // allow if COD payment exists even if status drifted
  }

  const payment = order.payments.find(
    (p) => p.provider === "cash_on_delivery" || p.method === "cash_on_delivery",
  );
  if (!payment) {
    throw new Error("Aucun paiement COD sur cette commande");
  }
  if (order.paymentStatus === "paid") {
    return order;
  }

  return markOrderPaid({
    storeId: order.storeId,
    orderId: order.id,
    paymentId: payment.id,
    providerRef: payment.providerRef || `cod_confirmed_${payment.id}`,
  });
}

export async function createRefundForPayment(input: {
  storeId: string;
  paymentId: string;
  amount?: number;
  reason?: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, storeId: input.storeId },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.status !== "succeeded") {
    throw new Error("Seuls les paiements succeeded peuvent être remboursés");
  }
  if (payment.provider === "cash_on_delivery") {
    throw new Error("Remboursement COD: traiter hors-ligne (pas de charge provider)");
  }

  const amount = input.amount ?? Number(payment.amount);
  if (amount <= 0 || amount > Number(payment.amount)) {
    throw new Error("Montant de remboursement invalide");
  }

  const existingRefunds = await prisma.refund.findMany({
    where: {
      paymentId: payment.id,
      status: { in: ["succeeded", "pending"] },
    },
  });
  const already = existingRefunds.reduce((s, r) => s + Number(r.amount), 0);
  if (already + amount > Number(payment.amount)) {
    throw new Error("Montant total remboursé dépasserait le paiement");
  }

  const provider = getProviderById(payment.provider);
  if (!provider.refundsSupported || provider.mode === "unavailable") {
    throw new Error(
      `Remboursements non disponibles pour ${payment.provider} (${provider.mode})`,
    );
  }
  if (!payment.providerRef) {
    throw new Error("providerRef manquant");
  }

  const idempotencyKey = `rf_${payment.id}_${amount}_${existingRefunds.length}`;
  const result = await provider.refund({
    providerRef: payment.providerRef,
    amount,
    currency: payment.currency,
    reason: input.reason,
    idempotencyKey,
  });

  const refund = await prisma.refund.create({
    data: {
      storeId: payment.storeId,
      paymentId: payment.id,
      orderId: payment.orderId,
      providerRef: result.providerRef,
      amount,
      currency: payment.currency,
      reason: input.reason,
      status: result.status,
      rawPayload: (result.raw ?? {}) as Prisma.InputJsonValue,
    },
  });

  if (result.status === "succeeded") {
    const totalRefunded = already + amount;
    await prisma.order.update({
      where: { id: payment.orderId },
      data: {
        paymentStatus:
          totalRefunded >= Number(payment.amount)
            ? "refunded"
            : "partially_refunded",
        status:
          totalRefunded >= Number(payment.amount) ? "refunded" : undefined,
      },
    });
  }

  logger.info("payment.refund_created", {
    storeId: payment.storeId,
    paymentId: payment.id,
    refundId: refund.id,
    status: refund.status,
  });

  return { refund, providerResult: result };
}

export async function listPaymentHistory(input: {
  storeId: string;
  limit?: number;
}) {
  return prisma.payment.findMany({
    where: { storeId: input.storeId },
    include: {
      order: { select: { id: true, orderNumber: true, status: true } },
      refunds: true,
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 50,
  });
}
