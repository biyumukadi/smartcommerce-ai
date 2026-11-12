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
 * Honest adapter when keys/contracts are missing.
 * Never marks a charge as succeeded.
 */
export class UnavailablePaymentProvider implements PaymentProvider {
  mode = "unavailable" as const;
  capabilities = ["card", "mobile_money", "bank"] as const;
  supportedCurrencies = ["USD", "CDF", "EUR"] as const;
  supportedOperators = ["mpesa", "airtel_money", "orange_money"] as const;
  refundsSupported = false;

  constructor(
    public id: string,
    private reasonFr: string,
    private opts: {
      requiresContract?: boolean;
      capabilities?: readonly PaymentProvider["capabilities"][number][];
      supportedCurrencies?: readonly string[];
      supportedOperators?: readonly PaymentProvider["supportedOperators"][number][];
    } = {},
  ) {
    if (opts.capabilities) this.capabilities = opts.capabilities as typeof this.capabilities;
    if (opts.supportedCurrencies) {
      this.supportedCurrencies = opts.supportedCurrencies as typeof this.supportedCurrencies;
    }
    if (opts.supportedOperators) {
      this.supportedOperators = opts.supportedOperators as typeof this.supportedOperators;
    }
  }

  describe(): ProviderAvailability {
    return {
      id: this.id,
      mode: this.mode,
      available: false,
      reason: this.reasonFr,
      capabilities: this.capabilities,
      supportedCurrencies: this.supportedCurrencies,
      supportedOperators: this.supportedOperators,
      refundsSupported: false,
      requiresContract: this.opts.requiresContract ?? true,
      notesFr: this.reasonFr,
    };
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const providerRef = `${this.id}_unavailable_${input.idempotencyKey}`;
    return {
      id: providerRef,
      provider: this.id,
      providerRef,
      status: "unavailable",
      clientAction: {
        type: "none",
        message: this.reasonFr,
      },
      raw: {
        available: false,
        reason: this.reasonFr,
        notice:
          "Provider indisponible — aucun débit effectué. Commande reste non payée.",
      },
    };
  }

  async capture(intentId: string): Promise<PaymentResult> {
    return {
      providerRef: intentId,
      status: "pending",
      raw: { available: false, reason: this.reasonFr },
    };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error(
      `Remboursement impossible: provider ${this.id} indisponible (${this.reasonFr})`,
    );
  }

  async parseWebhook(
    _rawBody: string,
    _signature: string | null,
  ): Promise<WebhookEvent> {
    throw new Error(
      `Webhook refusé: provider ${this.id} indisponible — configurez les clés sandbox/contrat.`,
    );
  }
}
