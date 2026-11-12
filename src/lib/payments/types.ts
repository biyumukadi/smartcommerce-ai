export type PaymentCapability = "mobile_money" | "card" | "bank" | "cash_on_delivery";

export type MobileMoneyOperator = "mpesa" | "airtel_money" | "orange_money";

export type PaymentMethodKind =
  | "card"
  | "mobile_money"
  | "bank"
  | "cash_on_delivery"
  | "other";

export type CreateIntentInput = {
  amount: number;
  currency: string;
  orderId: string;
  storeId: string;
  idempotencyKey: string;
  method?: PaymentMethodKind;
  operator?: MobileMoneyOperator;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  metadata?: Record<string, string>;
  returnUrl: string;
};

export type PaymentIntent = {
  id: string;
  provider: string;
  status: "requires_action" | "pending" | "succeeded" | "failed" | "cancelled" | "unavailable";
  clientAction?: {
    type: "redirect" | "mock_confirm" | "ussd_push" | "none";
    url?: string;
    message?: string;
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

export type RefundInput = {
  providerRef: string;
  amount: number;
  currency: string;
  reason?: string;
  idempotencyKey: string;
};

export type RefundResult = {
  providerRef: string;
  status: "succeeded" | "failed" | "pending";
  amount: number;
  currency: string;
  raw?: unknown;
};

export type WebhookEvent = {
  eventKey: string;
  type:
    | "payment.succeeded"
    | "payment.failed"
    | "payment.pending"
    | "refund.succeeded"
    | "refund.failed";
  providerRef: string;
  idempotencyKey?: string;
  amount?: number;
  currency?: string;
  raw: unknown;
};

export type ProviderAvailability = {
  id: string;
  mode: "sandbox" | "mock" | "production" | "unavailable";
  available: boolean;
  reason?: string;
  capabilities: readonly PaymentCapability[];
  supportedCurrencies: readonly string[];
  supportedOperators: readonly MobileMoneyOperator[];
  refundsSupported: boolean;
  requiresContract: boolean;
  notesFr: string;
};

export interface PaymentProvider {
  id: string;
  mode: "sandbox" | "mock" | "production" | "unavailable";
  capabilities: readonly PaymentCapability[];
  supportedCurrencies: readonly string[];
  supportedOperators: readonly MobileMoneyOperator[];
  refundsSupported: boolean;
  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  capture(intentId: string): Promise<PaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookEvent>;
  describe(): ProviderAvailability;
}
