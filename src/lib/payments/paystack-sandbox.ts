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
 * Paystack sandbox — cartes + certains Mobile Money (couverture pays dépendante).
 * RDC: vérifier couverture actuelle ; sinon Flutterwave / contrats locaux.
 */
export class PaystackSandboxProvider implements PaymentProvider {
  id = "paystack";
  mode = "sandbox" as const;
  capabilities = ["card", "mobile_money"] as const;
  supportedCurrencies = ["USD", "CDF"] as const;
  supportedOperators = ["mpesa", "airtel_money"] as const;
  refundsSupported = true;

  constructor(
    private secretKey: string,
    private webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || "",
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
      requiresContract: true,
      notesFr:
        "Sandbox Paystack: cartes + MM selon pays. Production = KYC marchand. Orange Money RDC souvent hors couverture — préférer Flutterwave ou opérateur local.",
    };
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    if (!this.supportedCurrencies.includes(input.currency as "USD" | "CDF")) {
      throw new Error(
        `Paystack sandbox: devise ${input.currency} non supportée ici (USD/CDF).`,
      );
    }

    const reference = `psk_${input.idempotencyKey}`;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.customerEmail || "customer@smartcommerce.ai",
        amount: input.amount,
        currency: input.currency,
        reference,
        callback_url: input.returnUrl,
        channels:
          input.method === "card"
            ? ["card"]
            : ["mobile_money", "card"],
        metadata: {
          orderId: input.orderId,
          storeId: input.storeId,
          idempotencyKey: input.idempotencyKey,
          operator: input.operator || "",
        },
      }),
    });

    const data = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string; access_code?: string };
    };

    if (!res.ok || !data.status || !data.data?.authorization_url) {
      return {
        id: reference,
        provider: this.id,
        providerRef: reference,
        status: "failed",
        clientAction: {
          type: "none",
          message:
            data.message ||
            "Paystack a refusé l'intent. Aucun débit effectué.",
        },
        raw: data,
      };
    }

    return {
      id: data.data.reference || reference,
      provider: this.id,
      providerRef: data.data.reference || reference,
      status: "requires_action",
      clientAction: {
        type: "redirect",
        url: data.data.authorization_url,
        message: "Redirection Paystack sandbox — confirmation webhook obligatoire.",
      },
      raw: data,
    };
  }

  async capture(intentId: string): Promise<PaymentResult> {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(intentId)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    const data = (await res.json()) as {
      status?: boolean;
      data?: { status?: string; reference?: string };
    };
    const st = data.data?.status?.toLowerCase();
    if (st === "success") {
      return {
        providerRef: intentId,
        status: "succeeded",
        paidAt: new Date(),
        raw: data,
      };
    }
    if (st === "failed" || st === "abandoned") {
      return { providerRef: intentId, status: "failed", raw: data };
    }
    return { providerRef: intentId, status: "pending", raw: data };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const res = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: input.providerRef,
        amount: input.amount,
        merchant_note: input.reason || "SmartCommerce refund",
      }),
    });
    const data = (await res.json()) as {
      status?: boolean;
      data?: { id?: number; status?: string };
      message?: string;
    };
    if (!res.ok || !data.status) {
      return {
        providerRef: input.providerRef,
        status: "failed",
        amount: input.amount,
        currency: input.currency,
        raw: data,
      };
    }
    return {
      providerRef: String(data.data?.id || input.providerRef),
      status: "pending",
      amount: input.amount,
      currency: input.currency,
      raw: data,
    };
  }

  async parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookEvent> {
    if (!this.webhookSecret) {
      throw new Error("PAYSTACK_WEBHOOK_SECRET missing — refusing webhook");
    }
    if (!verifyHmacSha256(rawBody, signature, this.webhookSecret)) {
      throw new Error(
        signature ? "Invalid Paystack webhook signature" : "Missing Paystack signature",
      );
    }

    const payload = JSON.parse(rawBody) as {
      event?: string;
      data?: {
        id?: number;
        reference?: string;
        status?: string;
        amount?: number;
        currency?: string;
        metadata?: { idempotencyKey?: string };
      };
    };

    const eventName = (payload.event || "").toLowerCase();
    const status = payload.data?.status?.toLowerCase();
    let type: WebhookEvent["type"] = "payment.pending";
    if (eventName === "charge.success" || status === "success")
      type = "payment.succeeded";
    else if (eventName.includes("fail") || status === "failed")
      type = "payment.failed";
    else if (eventName.includes("refund")) type = "refund.succeeded";

    const providerRef = payload.data?.reference || String(payload.data?.id || "");
    if (!providerRef) throw new Error("Paystack webhook missing reference");

    return {
      eventKey: `${eventName}_${providerRef}_${payload.data?.id || "0"}`,
      type,
      providerRef,
      idempotencyKey: payload.data?.metadata?.idempotencyKey,
      amount: payload.data?.amount,
      currency: payload.data?.currency?.toUpperCase(),
      raw: payload,
    };
  }
}
