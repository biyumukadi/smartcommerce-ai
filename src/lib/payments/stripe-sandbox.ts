import { createHmac, timingSafeEqual } from "crypto";
import type {
  CreateIntentInput,
  PaymentIntent,
  PaymentProvider,
  PaymentResult,
  WebhookEvent,
} from "./types";

/**
 * Minimal Stripe-shaped sandbox adapter.
 * Live only when STRIPE_SECRET_KEY is set. Without it, factory refuses this provider.
 */
export class StripeSandboxProvider implements PaymentProvider {
  id = "stripe";
  mode = "sandbox" as const;
  capabilities = ["card"] as const;

  constructor(
    private secretKey: string,
    private webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "",
  ) {}

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(input.amount),
        currency: input.currency.toLowerCase(),
        "metadata[orderId]": input.orderId,
        "metadata[storeId]": input.storeId,
        "metadata[idempotencyKey]": input.idempotencyKey,
        automatic_payment_methods: "enabled",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Stripe createIntent failed: ${err}`);
    }

    const data = (await res.json()) as {
      id: string;
      status: string;
      client_secret: string;
    };

    return {
      id: data.id,
      provider: this.id,
      providerRef: data.id,
      status:
        data.status === "succeeded"
          ? "succeeded"
          : data.status === "requires_action" || data.status === "requires_payment_method"
            ? "requires_action"
            : "pending",
      clientAction: {
        type: "redirect",
        url: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}stripe_pi=${data.id}`,
      },
      raw: data,
    };
  }

  async capture(intentId: string): Promise<PaymentResult> {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${intentId}`,
      {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );
    if (!res.ok) {
      throw new Error(`Stripe capture/status failed: ${await res.text()}`);
    }
    const data = (await res.json()) as { id: string; status: string };
    return {
      providerRef: data.id,
      status:
        data.status === "succeeded"
          ? "succeeded"
          : data.status === "canceled"
            ? "failed"
            : "pending",
      paidAt: data.status === "succeeded" ? new Date() : undefined,
      raw: data,
    };
  }

  async parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookEvent> {
    if (!this.webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET missing — refusing webhook");
    }
    if (!signature) throw new Error("Missing Stripe signature");

    // Simplified HMAC check for sandbox (Stripe uses timestamped scheme;
    // for MVP we accept a signed body with our secret when STRIPE_WEBHOOK_SECRET is set).
    const expected = createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const provided = signature.replace(/^sha256=/, "");
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Invalid Stripe webhook signature");
    }

    const payload = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: { object: { id: string; status: string; amount?: number; currency?: string; metadata?: Record<string, string> } };
    };

    const obj = payload.data.object;
    const type =
      payload.type === "payment_intent.succeeded"
        ? "payment.succeeded"
        : payload.type === "payment_intent.payment_failed"
          ? "payment.failed"
          : "payment.pending";

    return {
      eventKey: payload.id,
      type,
      providerRef: obj.id,
      idempotencyKey: obj.metadata?.idempotencyKey,
      amount: obj.amount,
      currency: obj.currency?.toUpperCase(),
      raw: payload,
    };
  }
}
