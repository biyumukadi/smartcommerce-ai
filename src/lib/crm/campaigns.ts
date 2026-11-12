import { prisma } from "@/lib/db";
import type { CampaignChannel } from "@prisma/client";
import { evaluateSegment } from "./segments";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import {
  appendMessage,
  findOrCreateWhatsAppConversation,
} from "@/lib/messaging/conversations";
import { logger } from "@/lib/logger";

function hasChannelConsent(
  customer: {
    marketingConsentWhatsApp: boolean;
    marketingConsentEmail: boolean;
    marketingConsentSms: boolean;
  },
  channel: CampaignChannel,
) {
  if (channel === "whatsapp") return customer.marketingConsentWhatsApp;
  if (channel === "organic") return true; // in-app only, no outbound spam
  // meta/tiktok organic boosts still require WhatsApp/email consent for DMs
  return (
    customer.marketingConsentWhatsApp || customer.marketingConsentEmail
  );
}

export async function createMarketingAutomation(input: {
  storeId: string;
  name: string;
  channel?: CampaignChannel;
  segmentKey?: string;
  messageTemplate: string;
  requireConsent?: boolean;
  scheduledAt?: Date;
  createdById?: string;
}) {
  if (!input.messageTemplate.trim()) {
    throw new Error("messageTemplate requis");
  }
  return prisma.marketingAutomation.create({
    data: {
      storeId: input.storeId,
      name: input.name,
      channel: input.channel || "whatsapp",
      segmentKey: input.segmentKey,
      messageTemplate: input.messageTemplate,
      requireConsent: input.requireConsent !== false,
      scheduledAt: input.scheduledAt,
      createdById: input.createdById,
      status: input.scheduledAt ? "scheduled" : "draft",
    },
  });
}

export async function listMarketingAutomations(storeId: string) {
  return prisma.marketingAutomation.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Run a consent-gated campaign. Never sends without consent when requireConsent.
 * WhatsApp sends use live provider or fail-closed unavailable — no fake success.
 */
export async function runMarketingAutomation(input: {
  storeId: string;
  automationId: string;
  confirmSend: boolean;
}) {
  if (!input.confirmSend) {
    return {
      status: "needs_confirmation" as const,
      error: "confirmSend=true requis — aucun envoi marketing fictif.",
    };
  }

  const automation = await prisma.marketingAutomation.findFirst({
    where: { id: input.automationId, storeId: input.storeId },
  });
  if (!automation) throw new Error("Campagne introuvable");

  let recipients = await prisma.customer.findMany({
    where: { storeId: input.storeId, deletedAt: null },
    take: 500,
  });

  if (automation.segmentKey) {
    const evaluated = await evaluateSegment(
      input.storeId,
      automation.segmentKey,
    );
    recipients = evaluated.customers;
  }

  if (automation.requireConsent) {
    const consented = recipients.filter((c) =>
      hasChannelConsent(c, automation.channel),
    );
    const skipped = recipients.length - consented.length;
    if (consented.length === 0) {
      const updated = await prisma.marketingAutomation.update({
        where: { id: automation.id },
        data: {
          status: "blocked_no_consent",
          skippedNoConsent: skipped,
          sentCount: 0,
          error:
            "Aucun destinataire avec consentement — spam interdit.",
          ranAt: new Date(),
        },
      });
      return {
        status: "blocked_no_consent" as const,
        automation: updated,
        notice: "Campagne bloquée — consentement manquant",
      };
    }
    recipients = consented;
  }

  await prisma.marketingAutomation.update({
    where: { id: automation.id },
    data: { status: "running", error: null },
  });

  let sentCount = 0;
  let failedCount = 0;
  let skippedNoConsent = 0;
  const provider = getWhatsAppProvider();

  for (const customer of recipients) {
    if (
      automation.requireConsent &&
      !hasChannelConsent(customer, automation.channel)
    ) {
      skippedNoConsent += 1;
      continue;
    }

    if (automation.channel === "whatsapp") {
      if (!customer.phone) {
        failedCount += 1;
        continue;
      }
      try {
        const conversation = await findOrCreateWhatsAppConversation({
          storeId: input.storeId,
          phoneE164: customer.phone,
          customerName: customer.name || undefined,
        });
        const body = automation.messageTemplate
          .replace(/\{\{name\}\}/g, customer.name || "client")
          .replace(/\{\{points\}\}/g, String(customer.loyaltyPoints));
        const result = await provider.sendText({
          toE164: customer.phone,
          body,
          storeId: input.storeId,
          conversationId: conversation.id,
        });
        await appendMessage({
          conversationId: conversation.id,
          storeId: input.storeId,
          direction: "outbound",
          body,
          status:
            result.status === "sent" || result.status === "queued"
              ? "sent"
              : result.status === "unavailable"
                ? "unavailable"
                : "failed",
          externalMessageId: result.externalMessageId,
          error: result.error,
        });
        if (result.status === "sent" || result.status === "queued") {
          sentCount += 1;
        } else {
          failedCount += 1;
        }
      } catch (err) {
        failedCount += 1;
        logger.warn("crm.campaign_send_failed", {
          storeId: input.storeId,
          customerId: customer.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      // Non-WhatsApp channels: record as draft intent only (no fake publish)
      failedCount += 1;
    }
  }

  const status =
    sentCount > 0
      ? "completed"
      : skippedNoConsent > 0 && sentCount === 0
        ? "blocked_no_consent"
        : "failed";

  const updated = await prisma.marketingAutomation.update({
    where: { id: automation.id },
    data: {
      status,
      sentCount,
      failedCount,
      skippedNoConsent:
        skippedNoConsent ||
        (automation.requireConsent
          ? Math.max(0, (await prisma.customer.count({ where: { storeId: input.storeId, deletedAt: null } })) - recipients.length)
          : 0),
      ranAt: new Date(),
      error:
        status === "failed"
          ? "Aucun envoi réussi (provider unavailable ou canal non supporté) — pas de faux succès"
          : null,
    },
  });

  logger.info("crm.campaign_ran", {
    storeId: input.storeId,
    automationId: automation.id,
    status,
    sentCount,
    failedCount,
  });

  return {
    status,
    automation: updated,
    notice:
      status === "completed"
        ? `Envoyé à ${sentCount} destinataire(s) consentants`
        : updated.error || status,
  };
}
