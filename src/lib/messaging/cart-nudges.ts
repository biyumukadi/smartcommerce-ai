import { prisma } from "@/lib/db";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import {
  appendMessage,
  findOrCreateWhatsAppConversation,
} from "./conversations";
import { logger } from "@/lib/logger";
import { formatMoney } from "@/lib/utils";

const DEFAULT_IDLE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Abandoned-cart WhatsApp nudges — ONLY with explicit marketingConsentWhatsApp.
 */
export async function processAbandonedCartNudges(input?: {
  storeId?: string;
  idleMs?: number;
}) {
  const idleMs = input?.idleMs ?? DEFAULT_IDLE_MS;
  const cutoff = new Date(Date.now() - idleMs);

  const carts = await prisma.cart.findMany({
    where: {
      status: "open",
      abandonedNudgeSentAt: null,
      updatedAt: { lte: cutoff },
      customerId: { not: null },
      ...(input?.storeId ? { storeId: input.storeId } : {}),
      items: { some: {} },
    },
    include: {
      customer: true,
      items: true,
      store: true,
    },
    take: 50,
  });

  const results: Array<{
    cartId: string;
    status: string;
    reason?: string;
  }> = [];

  const provider = getWhatsAppProvider();

  for (const cart of carts) {
    const customer = cart.customer;
    if (!customer?.phone) {
      results.push({
        cartId: cart.id,
        status: "skipped",
        reason: "no_phone",
      });
      continue;
    }
    if (!customer.marketingConsentWhatsApp) {
      results.push({
        cartId: cart.id,
        status: "skipped",
        reason: "no_consent",
      });
      continue;
    }

    const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
    const subtotal = cart.items.reduce(
      (s, i) => s + Number(i.unitPriceAmount) * i.quantity,
      0,
    );

    const conversation = await findOrCreateWhatsAppConversation({
      storeId: cart.storeId,
      phoneE164: customer.phone,
      customerName: customer.name || undefined,
    });

    const result = await provider.sendTemplate({
      toE164: customer.phone,
      template: "abandoned_cart",
      language: customer.locale || "fr",
      variables: {
        customer_name: customer.name || "Client",
        store_name: cart.store.name,
        item_count: String(itemCount),
        total: formatMoney(subtotal, cart.currency),
      },
      storeId: cart.storeId,
    });

    const msgStatus =
      result.status === "sent"
        ? "sent"
        : result.status === "unavailable"
          ? "unavailable"
          : "failed";

    await appendMessage({
      conversationId: conversation.id,
      storeId: cart.storeId,
      direction: "outbound",
      body: `[template:abandoned_cart] ${itemCount} article(s) · ${formatMoney(subtotal, cart.currency)}`,
      status: msgStatus,
      externalMessageId: result.externalMessageId,
      error: result.error,
    });

    // Mark nudge attempted only on sent OR unavailable/failed after consent path
    // so we don't spam; unavailable still marks to avoid hammering.
    await prisma.cart.update({
      where: { id: cart.id },
      data: { abandonedNudgeSentAt: new Date() },
    });

    results.push({ cartId: cart.id, status: result.status, reason: result.error });
    logger.info("whatsapp.abandoned_cart_nudge", {
      storeId: cart.storeId,
      cartId: cart.id,
      status: result.status,
    });
  }

  return { processed: results.length, results };
}

export async function setMarketingConsent(input: {
  storeId: string;
  phone?: string;
  email?: string;
  name?: string;
  consent: boolean;
  customerId?: string;
}) {
  if (input.customerId) {
    return prisma.customer.update({
      where: { id: input.customerId },
      data: {
        marketingConsentWhatsApp: input.consent,
        marketingConsentAt: input.consent ? new Date() : null,
      },
    });
  }

  const phone = input.phone?.replace(/\D/g, "");
  let customer = await prisma.customer.findFirst({
    where: {
      storeId: input.storeId,
      deletedAt: null,
      OR: [
        phone ? { phone } : undefined,
        input.email ? { email: input.email.toLowerCase() } : undefined,
      ].filter(Boolean) as { phone?: string; email?: string }[],
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        storeId: input.storeId,
        phone: phone || undefined,
        email: input.email?.toLowerCase(),
        name: input.name,
        marketingConsentWhatsApp: input.consent,
        marketingConsentAt: input.consent ? new Date() : null,
      },
    });
    return customer;
  }

  return prisma.customer.update({
    where: { id: customer.id },
    data: {
      name: input.name || customer.name,
      phone: phone || customer.phone,
      email: input.email?.toLowerCase() || customer.email,
      marketingConsentWhatsApp: input.consent,
      marketingConsentAt: input.consent ? new Date() : null,
    },
  });
}
