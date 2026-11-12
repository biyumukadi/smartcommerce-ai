import { signHmacSha256, verifyMetaAppSecretSignature } from "./hmac";
import type {
  InboundWhatsAppMessage,
  ParsedWebhook,
  SendResult,
  SendTemplateInput,
  SendTextInput,
  WhatsAppAvailability,
  WhatsAppProvider,
  WhatsAppStatusUpdate,
} from "./types";

/**
 * Local mock WhatsApp — records sends as "sent" only in mock mode.
 * Still never claims Meta Cloud delivery without going through this provider.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  id = "whatsapp_mock";
  mode = "mock" as const;

  constructor(
    private webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET ||
      process.env.PAYMENT_WEBHOOK_SECRET ||
      "",
  ) {}

  describe(): WhatsAppAvailability {
    return {
      id: this.id,
      mode: this.mode,
      available: true,
      templatesSupported: true,
      requiresMetaApproval: false,
      notesFr:
        "Mock local WhatsApp. Les envois sont simulés (status sent) pour tests inbox/assistant — pas un envoi Meta réel.",
    };
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    const externalMessageId = `wamid.mock.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    return {
      provider: this.id,
      status: "sent",
      externalMessageId,
      raw: {
        mock: true,
        to: input.toE164,
        body: input.body,
        notice: "Mock send — not delivered via Meta Cloud API",
      },
    };
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const externalMessageId = `wamid.mock.tpl.${input.template}.${Date.now()}`;
    return {
      provider: this.id,
      status: "sent",
      externalMessageId,
      raw: {
        mock: true,
        template: input.template,
        variables: input.variables,
        to: input.toE164,
      },
    };
  }

  async parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<ParsedWebhook> {
    if (!this.webhookSecret) {
      throw new Error("WHATSAPP_WEBHOOK_SECRET missing — refusing webhook");
    }
    if (!verifyMetaAppSecretSignature(rawBody, signature, this.webhookSecret)) {
      throw new Error(
        signature ? "Invalid WhatsApp mock signature" : "Missing webhook signature",
      );
    }

    const payload = JSON.parse(rawBody) as {
      kind?: string;
      messages?: InboundWhatsAppMessage[];
      updates?: WhatsAppStatusUpdate[];
    };

    if (payload.kind === "status" && payload.updates) {
      return { kind: "status", updates: payload.updates };
    }
    if (payload.messages?.length) {
      return { kind: "inbound", messages: payload.messages };
    }
    return { kind: "empty" };
  }

  verifyChallenge(params: {
    mode: string | null;
    token: string | null;
    challenge: string | null;
  }): string | null {
    const expected =
      process.env.WHATSAPP_VERIFY_TOKEN || "smartcommerce-wa-verify";
    if (params.mode === "subscribe" && params.token === expected) {
      return params.challenge;
    }
    return null;
  }

  buildInboundWebhook(input: {
    fromE164: string;
    body: string;
    phoneNumberId?: string;
  }): { body: string; signature: string } {
    const msg: InboundWhatsAppMessage = {
      eventKey: `mock_in_${Date.now()}`,
      wabaPhoneNumberId: input.phoneNumberId || "mock_phone",
      fromE164: input.fromE164.replace(/\D/g, ""),
      body: input.body,
      externalMessageId: `wamid.in.${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      raw: { mock: true },
    };
    const body = JSON.stringify({ kind: "inbound", messages: [msg] });
    return { body, signature: `sha256=${signHmacSha256(body, this.webhookSecret)}` };
  }
}
