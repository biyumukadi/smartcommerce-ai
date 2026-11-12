import { verifyHmacSha256 } from "./hmac";
import type {
  CreateIntentInput,
  MobileMoneyOperator,
  PaymentIntent,
  PaymentProvider,
  PaymentResult,
  ProviderAvailability,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from "./types";

const FLW_OPERATOR_MAP: Record<MobileMoneyOperator, string> = {
  mpesa: "mpesa",
  airtel_money: "mobilemoneyfranco",
  orange_money: "mobilemoneyfranco",
};

/**
 * Flutterwave sandbox — cartes + Mobile Money (M-Pesa / Airtel / Orange selon pays).
 * RDC: couverture MM via agrégateur ; clés test FLW_* requises. Pas de faux succès.
 */
export class FlutterwaveSandboxProvider implements PaymentProvider {
  id = "flutterwave";
  mode = "sandbox" as const;
  capabilities = ["card", "mobile_money"] as const;
  supportedCurrencies = ["USD", "CDF", "EUR"] as const;
  supportedOperators = ["mpesa", "airtel_money", "orange_money"] as const;
  refundsSupported = true;

  constructor(
    private secretKey: string,
    private publicKey = process.env.FLW_PUBLIC_KEY || "",
    private webhookSecret = process.env.FLW_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || "",
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
        "Sandbox Flutterwave: cartes Visa/MC + Mobile Money. Production RDC nécessite compte marchand + KYC Flutterwave. Clés FLW_SECRET_KEY / FLW_PUBLIC_KEY / FLW_WEBHOOK_SECRET.",
    };
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    if (!this.supportedCurrencies.includes(input.currency as "USD" | "CDF" | "EUR")) {
      throw new Error(`Flutterwave: devise ${input.currency} non supportée`);
    }

    const txRef = `flw_${input.idempotencyKey}`;
    const paymentType =
      input.method === "card"
        ? "card"
        : input.operator
          ? FLW_OPERATOR_MAP[input.operator]
          : "mobilemoneyfranco";

    const payload = {
      tx_ref: txRef,
      amount: input.amount / 100,
      currency: input.currency,
      redirect_url: input.returnUrl,
      payment_options: input.method === "card" ? "card" : "mobilemoneyfranco,mpesa",
      customer: {
        email: input.customerEmail || "customer@smartcommerce.ai",
        phonenumber: input.customerPhone || "",
        name: input.customerName || "Customer",
      },
      customizations: {
        title: "SmartCommerce AI",
        description: `Order ${input.orderId}`,
      },
      meta: {
        orderId: input.orderId,
        storeId: input.storeId,
        idempotencyKey: input.idempotencyKey,
        operator: input.operator || "",
        paymentType,
      },
    };

    const res = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { link?: string; id?: number };
    };

    if (!res.ok || data.status !== "success" || !data.data?.link) {
      // Honest failure — do not invent success
      return {
        id: txRef,
        provider: this.id,
        providerRef: txRef,
        status: "failed",
        clientAction: {
          type: "none",
          message:
            data.message ||
            "Flutterwave a refusé l'intent (sandbox). Aucun débit effectué.",
        },
        raw: data,
      };
    }

    return {
      id: txRef,
      provider: this.id,
      providerRef: txRef,
      status: "requires_action",
      clientAction: {
        type: "redirect",
        url: data.data.link,
        message: "Redirection Flutterwave sandbox — confirmation via webhook uniquement.",
      },
      raw: data,
    };
  }

  async capture(intentId: string): Promise<PaymentResult> {
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(intentId)}`,
      {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );
    const data = (await res.json()) as {
      status?: string;
      data?: { status?: string; id?: number };
    };
    const flwStatus = data.data?.status?.toLowerCase();
    if (flwStatus === "successful") {
      return {
        providerRef: intentId,
        status: "succeeded",
        paidAt: new Date(),
        raw: data,
      };
    }
    if (flwStatus === "failed") {
      return { providerRef: intentId, status: "failed", raw: data };
    }
    return { providerRef: intentId, status: "pending", raw: data };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(input.providerRef)}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: input.amount / 100,
          comments: input.reason || "SmartCommerce refund",
        }),
      },
    );
    const data = (await res.json()) as {
      status?: string;
      data?: { id?: number; status?: string };
      message?: string;
    };
    if (!res.ok || data.status !== "success") {
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
      throw new Error("FLW_WEBHOOK_SECRET missing — refusing webhook");
    }
    // Flutterwave sends verif-hash header; we also accept x-sc-signature for local tests
    if (!verifyHmacSha256(rawBody, signature, this.webhookSecret) && signature !== this.webhookSecret) {
      throw new Error(
        signature ? "Invalid Flutterwave webhook signature" : "Missing Flutterwave signature",
      );
    }

    const payload = JSON.parse(rawBody) as {
      event?: string;
      id?: string;
      data?: {
        id?: number;
        tx_ref?: string;
        status?: string;
        amount?: number;
        currency?: string;
        meta?: { idempotencyKey?: string };
      };
    };

    const status = payload.data?.status?.toLowerCase();
    const eventName = (payload.event || "").toLowerCase();
    let type: WebhookEvent["type"] = "payment.pending";
    if (eventName.includes("refund") && status === "completed")
      type = "refund.succeeded";
    else if (status === "successful" || eventName === "charge.completed")
      type = "payment.succeeded";
    else if (status === "failed") type = "payment.failed";

    const providerRef = payload.data?.tx_ref || String(payload.data?.id || "");
    if (!providerRef) throw new Error("Flutterwave webhook missing tx_ref");

    return {
      eventKey: String(payload.id || `${providerRef}_${status || eventName}`),
      type,
      providerRef,
      idempotencyKey: payload.data?.meta?.idempotencyKey,
      amount: payload.data?.amount
        ? Math.round(Number(payload.data.amount) * 100)
        : undefined,
      currency: payload.data?.currency?.toUpperCase(),
      raw: payload,
    };
  }
}
