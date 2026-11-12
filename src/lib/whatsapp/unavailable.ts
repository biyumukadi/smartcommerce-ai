import type {
  ParsedWebhook,
  SendResult,
  SendTemplateInput,
  SendTextInput,
  WhatsAppAvailability,
  WhatsAppProvider,
} from "./types";

/**
 * Honest Cloud API stub when WABA/token missing.
 * Never reports send success.
 */
export class UnavailableWhatsAppProvider implements WhatsAppProvider {
  id = "whatsapp_cloud";
  mode = "unavailable" as const;

  constructor(
    private reasonFr = "WhatsApp Cloud API indisponible: WHATSAPP_CLOUD_TOKEN / WHATSAPP_PHONE_NUMBER_ID manquants. Aucun envoi effectué.",
  ) {}

  describe(): WhatsAppAvailability {
    return {
      id: this.id,
      mode: this.mode,
      available: false,
      reason: this.reasonFr,
      templatesSupported: false,
      requiresMetaApproval: true,
      notesFr: this.reasonFr,
    };
  }

  async sendText(_input: SendTextInput): Promise<SendResult> {
    return {
      provider: this.id,
      status: "unavailable",
      error: this.reasonFr,
      raw: { available: false },
    };
  }

  async sendTemplate(_input: SendTemplateInput): Promise<SendResult> {
    return {
      provider: this.id,
      status: "unavailable",
      error: this.reasonFr,
      raw: { available: false },
    };
  }

  async parseWebhook(
    _rawBody: string,
    _signature: string | null,
  ): Promise<ParsedWebhook> {
    throw new Error(
      "Webhook WhatsApp refusé: credentials Cloud API manquants. Configurez WHATSAPP_CLOUD_TOKEN + META_APP_SECRET.",
    );
  }

  verifyChallenge(): string | null {
    return null;
  }
}
