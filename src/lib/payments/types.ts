export type PaymentCapability = "mobile_money" | "card" | "bank";

export type CreateIntentInput = {
  amount: number;
  currency: string;
  orderId: string;
  storeId: string;
  idempotencyKey: string;
  method?: "card" | "mobile_money" | "bank" | "other";
  customerEmail?: string;
  metadata?: Record<string, string>;
  returnUrl: string;
};

export type PaymentIntent = {
  id: string;
  provider: string;
  status: "requires_action" | "pending" | "succeeded" | "failed" | "cancelled";
  clientAction?: {
    type: "redirect" | "mock_confirm";
    url?: string;
  };
  providerRef: string;
  raw?: unknown;
};

export type PaymentResult = {
  providerRef: string;
  status: "succeeded" | "failed" | "pending";
  paidAt?: Date;
  raw?: unknown;
};

export type WebhookEvent = {
  eventKey: string;
  type: "payment.succeeded" | "payment.failed" | "payment.pending";
  providerRef: string;
  idempotencyKey?: string;
  amount?: number;
  currency?: string;
  raw: unknown;
};

export interface PaymentProvider {
  id: string;
  mode: "sandbox" | "mock" | "production";
  capabilities: readonly PaymentCapability[];
  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  capture(intentId: string): Promise<PaymentResult>;
  parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookEvent>;
}
