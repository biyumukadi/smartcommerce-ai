import { signHmacSha256, verifyHmacSha256 } from "./hmac";
import type {
  CreateIntentInput,
  PaymentIntent,
  PaymentProvider,
  PaymentResult,
  ProviderAvailability,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from "./types";

export class MockPaymentProvider implements PaymentProvider {
  id = "mock";
  mode = "mock" as const;
  capabilities = ["mobile_money", "card", "bank"] as const;
  supportedCurrencies = ["USD", "CDF", "EUR"] as const;
  supportedOperators = ["mpesa", "airtel_money", "orange_money"] as const;
  refundsSupported = true;

  constructor(private webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || "") {}

  describe(): ProviderAvailability {
    return {
      id: this.id,
      mode: this.mode,
      available: true,
      capabilities: this.capabilities,
      supportedCurrencies: this.supportedCurrencies,
      supportedOperators: this.supportedOperators,
      refundsSupported: true,
      requiresContract: false,
      notesFr:
        "Mock local uniquement. Les paiements ne passent en succeeded qu'après webhook signé.",
    };
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const providerRef = `mock_${input.idempotencyKey}`;
    const confirmUrl = `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}mockPayment=${providerRef}&orderId=${input.orderId}`;
    return {
      id: providerRef,
      provider: this.id,
      status: "requires_action",
      providerRef,
      clientAction: {
        type: "mock_confirm",
        url: confirmUrl,
        message: "Confirmez via webhook mock signé (sandbox).",
      },
      raw: {
        notice:
          "Sandbox mock — payment is NOT marked paid until webhook confirm",
        method: input.method,
        operator: input.operator,
        currency: input.currency,
      },
    };
  }

  async capture(intentId: string): Promise<PaymentResult> {
    return {
      providerRef: intentId,
      status: "pending",
      raw: { message: "Use webhook confirmation for mock payments" },
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return {
      providerRef: `mock_rf_${input.idempotencyKey}`,
      status: "succeeded",
      amount: input.amount,
      currency: input.currency,
      raw: {
        notice: "Mock refund recorded locally (no external charge).",
        reason: input.reason,
      },
    };
  }

  async parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookEvent> {
    if (!this.webhookSecret) {
      throw new Error("PAYMENT_WEBHOOK_SECRET missing — refusing webhook");
    }
    if (!verifyHmacSha256(rawBody, signature, this.webhookSecret)) {
      throw new Error(
        signature ? "Invalid webhook signature" : "Missing webhook signature",
      );
    }

    const payload = JSON.parse(rawBody) as {
      eventKey: string;
      type: WebhookEvent["type"];
      providerRef: string;
      idempotencyKey?: string;
      amount?: number;
      currency?: string;
    };

    if (!payload.eventKey || !payload.providerRef || !payload.type) {
      throw new Error("Invalid webhook payload");
    }

    return {
      eventKey: payload.eventKey,
      type: payload.type,
      providerRef: payload.providerRef,
      idempotencyKey: payload.idempotencyKey,
      amount: payload.amount,
      currency: payload.currency,
      raw: payload,
    };
  }

  /** Helper for local sandbox UI — signs a succeeded event */
  buildSucceededWebhook(input: {
    providerRef: string;
    idempotencyKey: string;
    amount: number;
    currency: string;
  }): { body: string; signature: string } {
    const body = JSON.stringify({
      eventKey: `mock_evt_${input.providerRef}`,
      type: "payment.succeeded",
      providerRef: input.providerRef,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      currency: input.currency,
    });
    return { body, signature: signHmacSha256(body, this.webhookSecret) };
  }

  buildFailedWebhook(input: {
    providerRef: string;
    idempotencyKey: string;
    amount: number;
    currency: string;
  }): { body: string; signature: string } {
    const body = JSON.stringify({
      eventKey: `mock_evt_fail_${input.providerRef}`,
      type: "payment.failed",
      providerRef: input.providerRef,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      currency: input.currency,
    });
    return { body, signature: signHmacSha256(body, this.webhookSecret) };
  }
}
