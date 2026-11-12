export type WhatsAppMode = "sandbox" | "mock" | "unavailable" | "production";

export type WhatsAppTemplateName =
  | "order_confirmation"
  | "payment_received"
  | "delivery_update"
  | "abandoned_cart"
  | "utility_text";

export type SendTextInput = {
  toE164: string;
  body: string;
  storeId: string;
  conversationId?: string;
};

export type SendTemplateInput = {
  toE164: string;
  template: WhatsAppTemplateName;
  language?: string;
  variables: Record<string, string>;
  storeId: string;
};

export type SendResult = {
  provider: string;
  status: "sent" | "queued" | "failed" | "unavailable";
  externalMessageId?: string;
  error?: string;
  raw?: unknown;
};

export type InboundWhatsAppMessage = {
  eventKey: string;
  wabaPhoneNumberId?: string;
  fromE164: string;
  body: string;
  externalMessageId: string;
  timestamp?: string;
  raw: unknown;
};

export type WhatsAppStatusUpdate = {
  eventKey: string;
  externalMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  raw: unknown;
};

export type ParsedWebhook =
  | { kind: "inbound"; messages: InboundWhatsAppMessage[] }
  | { kind: "status"; updates: WhatsAppStatusUpdate[] }
  | { kind: "empty" };

export type WhatsAppAvailability = {
  id: string;
  mode: WhatsAppMode;
  available: boolean;
  reason?: string;
  templatesSupported: boolean;
  requiresMetaApproval: boolean;
  notesFr: string;
};

export interface WhatsAppProvider {
  id: string;
  mode: WhatsAppMode;
  sendText(input: SendTextInput): Promise<SendResult>;
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  parseWebhook(rawBody: string, signature: string | null): Promise<ParsedWebhook>;
  verifyChallenge?(params: {
    mode: string | null;
    token: string | null;
    challenge: string | null;
  }): string | null;
  describe(): WhatsAppAvailability;
}
