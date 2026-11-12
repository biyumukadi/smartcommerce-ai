import { verifyMetaAppSecretSignature } from "./hmac";
import type {
  InboundWhatsAppMessage,
  ParsedWebhook,
  SendResult,
  SendTemplateInput,
  SendTextInput,
  WhatsAppAvailability,
  WhatsAppProvider,
  WhatsAppStatusUpdate,
  WhatsAppTemplateName,
} from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

const TEMPLATE_META_NAMES: Record<WhatsAppTemplateName, string> = {
  order_confirmation: "order_confirmation",
  payment_received: "payment_received",
  delivery_update: "delivery_update",
  abandoned_cart: "abandoned_cart",
  utility_text: "utility_text",
};

/**
 * Official WhatsApp Cloud API adapter.
 * Live only when token + phone number id are present.
 */
export class WhatsAppCloudApiProvider implements WhatsAppProvider {
  id = "whatsapp_cloud";
  mode = "sandbox" as const;

  constructor(
    private accessToken: string,
    private phoneNumberId: string,
    private appSecret = process.env.META_APP_SECRET || "",
    private verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "smartcommerce-wa-verify",
  ) {}

  describe(): WhatsAppAvailability {
    return {
      id: this.id,
      mode: this.mode,
      available: Boolean(this.accessToken && this.phoneNumberId),
      templatesSupported: true,
      requiresMetaApproval: true,
      notesFr:
        "Meta WhatsApp Cloud API. Sandbox: numéros de test + templates limités. Production: Business Verification, WABA, templates approuvés, numéro dédié.",
    };
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    const res = await fetch(`${GRAPH}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.toE164.replace(/\D/g, ""),
        type: "text",
        text: { body: input.body, preview_url: false },
      }),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };

    if (!res.ok || !data.messages?.[0]?.id) {
      return {
        provider: this.id,
        status: "failed",
        error: data.error?.message || `Cloud API send failed (${res.status})`,
        raw: data,
      };
    }

    return {
      provider: this.id,
      status: "sent",
      externalMessageId: data.messages[0].id,
      raw: data,
    };
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const name = TEMPLATE_META_NAMES[input.template];
    const params = Object.values(input.variables).map((text) => ({
      type: "text",
      text,
    }));

    const res = await fetch(`${GRAPH}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.toE164.replace(/\D/g, ""),
        type: "template",
        template: {
          name,
          language: { code: input.language || "fr" },
          components: params.length
            ? [{ type: "body", parameters: params }]
            : undefined,
        },
      }),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };

    if (!res.ok || !data.messages?.[0]?.id) {
      // Honest failure — templates often need Meta approval
      return {
        provider: this.id,
        status: "failed",
        error:
          data.error?.message ||
          `Template ${name} non envoyé (approbation Meta / sandbox ?)`,
        raw: data,
      };
    }

    return {
      provider: this.id,
      status: "sent",
      externalMessageId: data.messages[0].id,
      raw: data,
    };
  }

  async parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<ParsedWebhook> {
    if (!this.appSecret) {
      throw new Error("META_APP_SECRET missing — refusing WhatsApp webhook");
    }
    if (!verifyMetaAppSecretSignature(rawBody, signature, this.appSecret)) {
      throw new Error(
        signature ? "Invalid Meta webhook signature" : "Missing X-Hub-Signature-256",
      );
    }

    const payload = JSON.parse(rawBody) as {
      object?: string;
      entry?: Array<{
        id?: string;
        changes?: Array<{
          value?: {
            metadata?: { phone_number_id?: string };
            messages?: Array<{
              id: string;
              from: string;
              timestamp?: string;
              type?: string;
              text?: { body?: string };
            }>;
            statuses?: Array<{
              id: string;
              status: string;
              timestamp?: string;
            }>;
          };
        }>;
      }>;
    };

    const messages: InboundWhatsAppMessage[] = [];
    const updates: WhatsAppStatusUpdate[] = [];

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;
        const phoneNumberId = value.metadata?.phone_number_id;
        for (const m of value.messages || []) {
          if (m.type && m.type !== "text") continue;
          messages.push({
            eventKey: `wa_${m.id}`,
            wabaPhoneNumberId: phoneNumberId,
            fromE164: m.from,
            body: m.text?.body || "",
            externalMessageId: m.id,
            timestamp: m.timestamp,
            raw: m,
          });
        }
        for (const s of value.statuses || []) {
          const status =
            s.status === "delivered"
              ? "delivered"
              : s.status === "read"
                ? "read"
                : s.status === "failed"
                  ? "failed"
                  : "sent";
          updates.push({
            eventKey: `wa_status_${s.id}_${s.status}`,
            externalMessageId: s.id,
            status,
            raw: s,
          });
        }
      }
    }

    if (messages.length) return { kind: "inbound", messages };
    if (updates.length) return { kind: "status", updates };
    return { kind: "empty" };
  }

  verifyChallenge(params: {
    mode: string | null;
    token: string | null;
    challenge: string | null;
  }): string | null {
    if (params.mode === "subscribe" && params.token === this.verifyToken) {
      return params.challenge;
    }
    return null;
  }
}
