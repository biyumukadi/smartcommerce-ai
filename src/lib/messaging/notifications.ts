import { prisma } from "@/lib/db";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import type { WhatsAppTemplateName } from "@/lib/whatsapp";
import { appendMessage, findOrCreateWhatsAppConversation } from "./conversations";
import { logger } from "@/lib/logger";
import { formatMoney } from "@/lib/utils";

/**
 * Template notification hooks for order / payment / delivery.
 * Never fake success when Cloud API unavailable.
 */
export async function sendOrderLifecycleWhatsApp(input: {
  storeId: string;
  orderId: string;
  template: Extract<
    WhatsAppTemplateName,
    "order_confirmation" | "payment_received" | "delivery_update"
  >;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
    include: { customer: true, store: true },
  });
  if (!order) throw new Error("Order not found");

  const phone = order.customer?.phone;
  if (!phone) {
    return {
      skipped: true,
      reason: "Pas de téléphone client — notification WhatsApp non envoyée",
    };
  }

  const conversation = await findOrCreateWhatsAppConversation({
    storeId: input.storeId,
    phoneE164: phone,
    customerName: order.customer?.name || undefined,
  });

  const provider = getWhatsAppProvider();
  const variables = {
    customer_name: order.customer?.name || "Client",
    order_number: order.orderNumber,
    total: formatMoney(Number(order.totalAmount), order.currency),
    status: order.status,
    store_name: order.store.name,
  };

  const result = await provider.sendTemplate({
    toE164: phone,
    template: input.template,
    language: "fr",
    variables,
    storeId: input.storeId,
  });

  const status =
    result.status === "sent"
      ? "sent"
      : result.status === "unavailable"
        ? "unavailable"
        : "failed";

  await appendMessage({
    conversationId: conversation.id,
    storeId: input.storeId,
    direction: "outbound",
    body: `[template:${input.template}] ${variables.order_number} ${variables.total}`,
    status,
    externalMessageId: result.externalMessageId,
    error: result.error,
  });

  logger.info("whatsapp.template_hook", {
    storeId: input.storeId,
    orderId: order.id,
    template: input.template,
    status: result.status,
  });

  return { skipped: false, result, conversationId: conversation.id };
}
