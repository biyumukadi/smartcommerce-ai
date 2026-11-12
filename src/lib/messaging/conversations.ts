import { prisma } from "@/lib/db";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

export async function findOrCreateWhatsAppConversation(input: {
  storeId: string;
  phoneE164: string;
  customerName?: string;
}) {
  const phone = input.phoneE164.replace(/\D/g, "");
  let customer = await prisma.customer.findFirst({
    where: { storeId: input.storeId, phone, deletedAt: null },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        storeId: input.storeId,
        phone,
        name: input.customerName,
      },
    });
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      storeId: input.storeId,
      channel: "whatsapp",
      externalThreadId: phone,
    },
  });
  if (existing) {
    if (!existing.customerId) {
      return prisma.conversation.update({
        where: { id: existing.id },
        data: { customerId: customer.id },
      });
    }
    return existing;
  }

  return prisma.conversation.create({
    data: {
      storeId: input.storeId,
      customerId: customer.id,
      channel: "whatsapp",
      externalThreadId: phone,
      status: "open",
      aiEnabled: true,
    },
  });
}

export async function appendMessage(input: {
  conversationId: string;
  storeId: string;
  direction: "inbound" | "outbound" | "system";
  body: string;
  status?: "queued" | "sent" | "delivered" | "read" | "failed" | "unavailable";
  externalMessageId?: string;
  sentByUserId?: string;
  error?: string;
  media?: Prisma.InputJsonValue;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      storeId: input.storeId,
      direction: input.direction,
      body: input.body,
      status: input.status || "queued",
      externalMessageId: input.externalMessageId,
      sentByUserId: input.sentByUserId,
      error: input.error,
      media: input.media,
    },
  });

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: new Date() },
  });

  return message;
}

export async function handoffToHuman(input: {
  storeId: string;
  conversationId: string;
  assignedToUserId?: string;
  reason?: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, storeId: input.storeId },
  });
  if (!conversation) throw new Error("Conversation introuvable");

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: "human_handoff",
      aiEnabled: false,
      assignedToUserId: input.assignedToUserId || conversation.assignedToUserId,
    },
  });

  await appendMessage({
    conversationId: conversation.id,
    storeId: input.storeId,
    direction: "system",
    body: input.reason || "Transfert vers un conseiller humain.",
    status: "sent",
  });

  logger.info("conversation.handoff", {
    storeId: input.storeId,
    conversationId: conversation.id,
  });

  return updated;
}

export async function resumeAi(input: {
  storeId: string;
  conversationId: string;
}) {
  return prisma.conversation.updateMany({
    where: { id: input.conversationId, storeId: input.storeId },
    data: { status: "open", aiEnabled: true },
  });
}

export async function sendOutboundText(input: {
  storeId: string;
  conversationId: string;
  body: string;
  sentByUserId?: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, storeId: input.storeId },
    include: { customer: true },
  });
  if (!conversation) throw new Error("Conversation introuvable");

  const to =
    conversation.externalThreadId ||
    conversation.customer?.phone ||
    "";
  if (!to) throw new Error("Numéro WhatsApp manquant sur la conversation");

  const provider = getWhatsAppProvider();
  const result = await provider.sendText({
    toE164: to,
    body: input.body,
    storeId: input.storeId,
    conversationId: conversation.id,
  });

  const status =
    result.status === "sent"
      ? "sent"
      : result.status === "unavailable"
        ? "unavailable"
        : result.status === "queued"
          ? "queued"
          : "failed";

  const message = await appendMessage({
    conversationId: conversation.id,
    storeId: input.storeId,
    direction: "outbound",
    body: input.body,
    status,
    externalMessageId: result.externalMessageId,
    sentByUserId: input.sentByUserId,
    error: result.error,
  });

  return { message, result, provider: provider.describe() };
}

export async function listConversations(storeId: string, limit = 50) {
  return prisma.conversation.findMany({
    where: { storeId },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function getConversationDetail(
  storeId: string,
  conversationId: string,
) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, storeId },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
}
