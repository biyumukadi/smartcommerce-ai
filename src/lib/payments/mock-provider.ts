import { createHmac, timingSafeEqual } from "crypto";
import type {
  CreateIntentInput,
  PaymentIntent,
  PaymentProvider,
  PaymentResult,
  WebhookEvent,
} from "./types";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export class MockPaymentProvider implements PaymentProvider {
  id = "mock";
  mode = "mock" as const;
  capabilities = ["mobile_money", "card", "bank"] as const;

  constructor(private webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || "") {}

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
      },
      raw: {
        notice: "Sandbox mock — payment is NOT marked paid until webhook confirm",
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

  async parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookEvent> {
    if (!this.webhookSecret) {
      throw new Error("PAYMENT_WEBHOOK_SECRET missing — refusing webhook");
    }
    if (!signature) {
      throw new Error("Missing webhook signature");
    }
    const expected = sign(rawBody, this.webhookSecret);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Invalid webhook signature");
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
    return { body, signature: sign(body, this.webhookSecret) };
  }
}
