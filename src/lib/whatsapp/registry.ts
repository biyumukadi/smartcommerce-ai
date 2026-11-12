import { WhatsAppCloudApiProvider } from "./cloud-api";
import { MockWhatsAppProvider } from "./mock-provider";
import { UnavailableWhatsAppProvider } from "./unavailable";
import type { WhatsAppAvailability, WhatsAppProvider } from "./types";

export function resolveWhatsAppMode(): string {
  return (process.env.WHATSAPP_PROVIDER || "auto").toLowerCase();
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const mode = resolveWhatsAppMode();

  if (mode === "mock") {
    return new MockWhatsAppProvider();
  }

  if (mode === "unavailable") {
    return new UnavailableWhatsAppProvider();
  }

  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (mode === "cloud" || mode === "auto") {
    if (token && phoneNumberId) {
      return new WhatsAppCloudApiProvider(token, phoneNumberId);
    }
    if (mode === "cloud") {
      return new UnavailableWhatsAppProvider(
        "WHATSAPP_PROVIDER=cloud mais WHATSAPP_CLOUD_TOKEN / WHATSAPP_PHONE_NUMBER_ID manquants. Aucun envoi.",
      );
    }
    // auto without keys → mock in development, unavailable otherwise
    if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
      return new MockWhatsAppProvider();
    }
    return new UnavailableWhatsAppProvider();
  }

  return new UnavailableWhatsAppProvider(
    `WHATSAPP_PROVIDER=${mode} inconnu. Utilisez auto | mock | cloud.`,
  );
}

export function listWhatsAppCatalog(): WhatsAppAvailability[] {
  return [
    new MockWhatsAppProvider().describe(),
    new UnavailableWhatsAppProvider().describe(),
    (() => {
      const token = process.env.WHATSAPP_CLOUD_TOKEN;
      const phone = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (token && phone) return new WhatsAppCloudApiProvider(token, phone).describe();
      return {
        id: "whatsapp_cloud",
        mode: "unavailable" as const,
        available: false,
        templatesSupported: true,
        requiresMetaApproval: true,
        reason: "Clés Cloud API absentes",
        notesFr:
          "Configurer WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID + META_APP_SECRET. Production: Business Verification Meta + WABA + templates approuvés.",
      };
    })(),
  ];
}
