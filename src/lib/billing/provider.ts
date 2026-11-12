/**
 * SaaS billing provider — distinct from storefront PaymentProvider.
 * Fail-closed without STRIPE_SECRET_KEY (or SAAS_BILLING_PROVIDER=mock for local).
 */

export type SaasCheckoutResult =
  | {
      status: "redirect";
      provider: string;
      checkoutUrl: string;
      externalSubscriptionId?: string;
    }
  | {
      status: "mock_activated";
      provider: "mock";
      notice: string;
    }
  | {
      status: "unavailable" | "needs_confirmation" | "failed";
      provider: string;
      error: string;
    };

export function resolveSaasBillingProvider(): "stripe" | "mock" | "unavailable" {
  const forced = process.env.SAAS_BILLING_PROVIDER;
  if (forced === "mock") return "mock";
  if (forced === "unavailable") return "unavailable";
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  if (process.env.NODE_ENV !== "production" && forced !== "stripe") {
    // Dev without keys: still unavailable for paid claims unless mock explicitly set
    return "unavailable";
  }
  return "unavailable";
}

export async function startSaasCheckout(input: {
  organizationId: string;
  planCode: string;
  priceAmount: number;
  currency: string;
  customerEmail: string;
  confirmPurchase: boolean;
  successUrl: string;
  cancelUrl: string;
}): Promise<SaasCheckoutResult> {
  if (!input.confirmPurchase) {
    return {
      status: "needs_confirmation",
      provider: "saas",
      error: "confirmPurchase=true requis — aucun abonnement payant fictif.",
    };
  }

  const provider = resolveSaasBillingProvider();

  if (provider === "unavailable") {
    return {
      status: "unavailable",
      provider: "saas",
      error:
        "Billing SaaS indisponible (STRIPE_SECRET_KEY ou SAAS_BILLING_PROVIDER=mock manquant). Aucun abonnement marked paid.",
    };
  }

  if (provider === "mock") {
    return {
      status: "mock_activated",
      provider: "mock",
      notice:
        "Mock SaaS billing — abonnement activé localement uniquement (pas de charge réelle).",
    };
  }

  // Stripe Checkout Session for subscriptions
  try {
    const auth = Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString(
      "base64",
    );
    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("success_url", input.successUrl);
    body.set("cancel_url", input.cancelUrl);
    body.set("customer_email", input.customerEmail);
    body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
    body.set(
      "line_items[0][price_data][product_data][name]",
      `SmartCommerce ${input.planCode}`,
    );
    body.set(
      "line_items[0][price_data][unit_amount]",
      String(input.priceAmount),
    );
    body.set("line_items[0][price_data][recurring][interval]", "month");
    body.set("line_items[0][quantity]", "1");
    body.set("metadata[organizationId]", input.organizationId);
    body.set("metadata[planCode]", input.planCode);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      return {
        status: "failed",
        provider: "stripe",
        error: `Stripe checkout error: ${await res.text()}`,
      };
    }

    const data = (await res.json()) as {
      id?: string;
      url?: string;
    };
    if (!data.url) {
      return {
        status: "failed",
        provider: "stripe",
        error: "Stripe n'a pas renvoyé d'URL checkout — pas de faux succès.",
      };
    }
    return {
      status: "redirect",
      provider: "stripe",
      checkoutUrl: data.url,
      externalSubscriptionId: data.id,
    };
  } catch (err) {
    return {
      status: "failed",
      provider: "stripe",
      error: err instanceof Error ? err.message : "Stripe error",
    };
  }
}
