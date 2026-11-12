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
 * Cash on delivery — explicit offline path.
 * Never pretends to be a card/MM charge success.
 */
export class CashOnDeliveryProvider implements PaymentProvider {
  id = "cash_on_delivery";
  mode = "mock" as const;
  capabilities = ["cash_on_delivery"] as const;
  supportedCurrencies = ["USD", "CDF", "EUR"] as const;
  supportedOperators = [] as const;
  refundsSupported = false;

  describe(): ProviderAvailability {
    return {
      id: this.id,
      mode: this.mode,
      available: true,
      capabilities: this.capabilities,
      supportedCurrencies: this.supportedCurrencies,
      supportedOperators: this.supportedOperators,
      refundsSupported: false,
      requiresContract: false,
      notesFr:
        "Paiement à la livraison. La commande reste cod_pending jusqu'à confirmation manuelle du marchand (espèces reçues). Pas de webhook carte.",
    };
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const providerRef = `cod_${input.idempotencyKey}`;
    return {
      id: providerRef,
      provider: this.id,
      providerRef,
      status: "pending",
      clientAction: {
        type: "none",
        message:
          "Paiement à la livraison enregistré. Aucun débit carte/MM. Le marchand confirmera la réception des espèces.",
      },
      raw: {
        path: "cash_on_delivery",
        notice: "Order stays unpaid until merchant confirms cash collected",
      },
    };
  }

  async capture(intentId: string): Promise<PaymentResult> {
    return {
      providerRef: intentId,
      status: "pending",
      raw: {
        message:
          "COD: utilisez l'endpoint confirm-cod marchand — pas de capture provider.",
      },
    };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error(
      "Remboursement COD: gérer hors-ligne / avoir manuel (pas de charge provider).",
    );
  }

  async parseWebhook(
    _rawBody: string,
    _signature: string | null,
  ): Promise<WebhookEvent> {
    throw new Error(
      "Cash on delivery n'accepte pas de webhooks paiement — confirmez via confirm-cod.",
    );
  }
}
