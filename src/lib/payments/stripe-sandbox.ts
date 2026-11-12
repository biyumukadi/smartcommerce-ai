import { verifyHmacSha256 } from "./hmac";
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

/**
 * Stripe sandbox adapter — cards (USD/EUR). Mobile Money RDC non natif.
 */
export class StripeSandboxProvider implements PaymentProvider {
  id = "stripe";
  mode = "sandbox" as const;
  capabilities = ["card"] as const;
  supportedCurrencies = ["USD", "EUR"] as const;
  supportedOperators = [] as const;
  refundsSupported = true;

  constructor(
    private secretKey: string,
    private webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "",
  ) {}

  describe(): ProviderAvailability {
    return {
      id: this.id,
      mode: this.mode,
      available: Boolean(this.secretKey),
      capabilities: this.capabilities,
      supportedCurrencies: this.supportedCurrencies,
      supportedOperators: this.supportedOperators,
      refundsSupported: true,
      requiresContract: false,
      notesFr:
        "Cartes Visa/MC en sandbox Stripe. CDF et Mobile Money RDC non supportés nativement — utiliser Flutterwave/Paystack pour MM.",
    };
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    if (input.method === "mobile_money") {
      throw new Error(
        "Stripe ne supporte pas Mobile Money RDC. Utilisez Flutterwave, Paystack ou mock.",
      );
    }
    if (!this.supportedCurrencies.includes(input.currency as "USD" | "EUR")) {
      throw new Error(
        `Stripe sandbox: devise ${input.currency} non supportée (USD/EUR). CDF → Flutterwave.`,
      );
    }

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
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
          : data.status === "requires_action" ||
              data.status === "requires_payment_method"
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

  async refund(input: RefundInput): Promise<RefundResult> {
    const res = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: new URLSearchParams({
        payment_intent: input.providerRef,
        amount: String(input.amount),
        ...(input.reason ? { reason: "requested_by_customer" } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Stripe refund failed: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      id: string;
      status: string;
      amount: number;
      currency: string;
    };
    return {
      providerRef: data.id,
      status:
        data.status === "succeeded"
          ? "succeeded"
          : data.status === "failed"
            ? "failed"
            : "pending",
      amount: data.amount,
      currency: data.currency.toUpperCase(),
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
    if (!verifyHmacSha256(rawBody, signature, this.webhookSecret)) {
      throw new Error(
        signature ? "Invalid Stripe webhook signature" : "Missing Stripe signature",
      );
    }

    const payload = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: {
        object: {
          id: string;
          status: string;
          amount?: number;
          currency?: string;
          payment_intent?: string;
          metadata?: Record<string, string>;
        };
      };
    };

    const obj = payload.data.object;
    let type: WebhookEvent["type"] = "payment.pending";
    if (payload.type === "payment_intent.succeeded") type = "payment.succeeded";
    else if (payload.type === "payment_intent.payment_failed")
      type = "payment.failed";
    else if (payload.type === "charge.refunded") type = "refund.succeeded";

    return {
      eventKey: payload.id,
      type,
      providerRef:
        type.startsWith("refund") && obj.payment_intent
          ? obj.payment_intent
          : obj.id,
      idempotencyKey: obj.metadata?.idempotencyKey,
      amount: obj.amount,
      currency: obj.currency?.toUpperCase(),
      raw: payload,
    };
  }
}
