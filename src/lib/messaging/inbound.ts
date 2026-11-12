import { prisma } from "@/lib/db";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import type { InboundWhatsAppMessage } from "@/lib/whatsapp";
import {
  appendMessage,
  findOrCreateWhatsAppConversation,
  handoffToHuman,
  sendOutboundText,
} from "./conversations";
import { generateSalesAssistantReply } from "./assistant";
import { logger } from "@/lib/logger";

async function resolveStoreIdFromPhoneNumberId(
  phoneNumberId?: string,
): Promise<string | null> {
  if (!phoneNumberId) return null;

  // Prefer env mapping for single-tenant local/sandbox
  if (
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_DEFAULT_STORE_ID
  ) {
    return process.env.WHATSAPP_DEFAULT_STORE_ID;
  }

  const connection = await prisma.socialConnection.findFirst({
    where: {
      provider: "whatsapp",
      externalAccountId: phoneNumberId,
      status: { in: ["connected", "needs_approval"] },
    },
  });
  return connection?.storeId || process.env.WHATSAPP_DEFAULT_STORE_ID || null;
}

export async function processInboundWhatsAppMessages(
  messages: InboundWhatsAppMessage[],
) {
  const outcomes = [];

  for (const msg of messages) {
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: {
        provider_eventKey: {
          provider: "whatsapp",
          eventKey: msg.eventKey,
        },
      },
    });
    if (existingEvent?.processedAt) {
      outcomes.push({ eventKey: msg.eventKey, duplicate: true });
      continue;
    }

    await prisma.webhookEvent.upsert({
      where: {
        provider_eventKey: {
          provider: "whatsapp",
          eventKey: msg.eventKey,
        },
      },
      update: {},
      create: {
        provider: "whatsapp",
        eventKey: msg.eventKey,
        payload: msg.raw as object,
      },
    });

    const storeId = await resolveStoreIdFromPhoneNumberId(msg.wabaPhoneNumberId);
    if (!storeId) {
      logger.warn("whatsapp.inbound_no_store", {
        phoneNumberId: msg.wabaPhoneNumberId,
      });
      outcomes.push({
        eventKey: msg.eventKey,
        error: "store_unresolved",
      });
      continue;
    }

    const conversation = await findOrCreateWhatsAppConversation({
      storeId,
      phoneE164: msg.fromE164,
    });

    await appendMessage({
      conversationId: conversation.id,
      storeId,
      direction: "inbound",
      body: msg.body,
      status: "delivered",
      externalMessageId: msg.externalMessageId,
    });

    let assistantText: string | null = null;
    let handoff = false;

    if (conversation.aiEnabled && conversation.status !== "human_handoff") {
      const reply = await generateSalesAssistantReply({
        storeId,
        conversationId: conversation.id,
        userMessage: msg.body,
      });
      assistantText = reply.text;
      handoff = reply.handoff;

      await sendOutboundText({
        storeId,
        conversationId: conversation.id,
        body: reply.text,
      });

      if (handoff) {
        await handoffToHuman({
          storeId,
          conversationId: conversation.id,
          reason: "Demande client / assistant IA — handoff",
        });
      }
    }

    await prisma.webhookEvent.update({
      where: {
        provider_eventKey: {
          provider: "whatsapp",
          eventKey: msg.eventKey,
        },
      },
      data: { processedAt: new Date() },
    });

    outcomes.push({
      eventKey: msg.eventKey,
      conversationId: conversation.id,
      assistantText,
      handoff,
    });
  }

  return outcomes;
}

export async function processWhatsAppWebhookBody(input: {
  rawBody: string;
  signature: string | null;
}) {
  const provider = getWhatsAppProvider();
  const parsed = await provider.parseWebhook(input.rawBody, input.signature);

  if (parsed.kind === "inbound") {
    return {
      kind: "inbound" as const,
      outcomes: await processInboundWhatsAppMessages(parsed.messages),
    };
  }

  if (parsed.kind === "status") {
    for (const u of parsed.updates) {
      await prisma.message.updateMany({
        where: { externalMessageId: u.externalMessageId },
        data: { status: u.status },
      });
    }
    return { kind: "status" as const, updates: parsed.updates.length };
  }

  return { kind: "empty" as const };
}
