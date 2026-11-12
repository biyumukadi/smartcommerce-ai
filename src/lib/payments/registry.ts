import { CashOnDeliveryProvider } from "./cash-on-delivery";
import { FlutterwaveSandboxProvider } from "./flutterwave-sandbox";
import { MockPaymentProvider } from "./mock-provider";
import { PaystackSandboxProvider } from "./paystack-sandbox";
import { StripeSandboxProvider } from "./stripe-sandbox";
import { UnavailablePaymentProvider } from "./unavailable-provider";
import type { PaymentMethodKind, PaymentProvider, ProviderAvailability } from "./types";

export type AggregatorId =
  | "mock"
  | "stripe"
  | "flutterwave"
  | "paystack"
  | "maxicash"
  | "flexpay"
  | "cash_on_delivery";

function buildFlutterwave(): PaymentProvider {
  const key = process.env.FLW_SECRET_KEY;
  if (!key) {
    return new UnavailablePaymentProvider(
      "flutterwave",
      "Flutterwave indisponible: FLW_SECRET_KEY manquante. Aucun débit. Configurez des clés sandbox ou utilisez PAYMENT_PROVIDER=mock.",
      {
        requiresContract: true,
        capabilities: ["card", "mobile_money"],
        supportedCurrencies: ["USD", "CDF", "EUR"],
        supportedOperators: ["mpesa", "airtel_money", "orange_money"],
      },
    );
  }
  return new FlutterwaveSandboxProvider(key);
}

function buildPaystack(): PaymentProvider {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    return new UnavailablePaymentProvider(
      "paystack",
      "Paystack indisponible: PAYSTACK_SECRET_KEY manquante. Aucun débit. Configurez des clés test ou utilisez PAYMENT_PROVIDER=mock.",
      {
        requiresContract: true,
        capabilities: ["card", "mobile_money"],
        supportedCurrencies: ["USD", "CDF"],
        supportedOperators: ["mpesa", "airtel_money"],
      },
    );
  }
  return new PaystackSandboxProvider(key);
}

function buildStripe(): PaymentProvider {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return new UnavailablePaymentProvider(
      "stripe",
      "Stripe indisponible: STRIPE_SECRET_KEY manquante. Aucun débit. Utilisez des clés test ou PAYMENT_PROVIDER=mock.",
      {
        requiresContract: false,
        capabilities: ["card"],
        supportedCurrencies: ["USD", "EUR"],
        supportedOperators: [],
      },
    );
  }
  return new StripeSandboxProvider(key);
}

function buildLocalOperator(id: "maxicash" | "flexpay"): PaymentProvider {
  return new UnavailablePaymentProvider(
    id,
    `Agrégateur/opérateur ${id}: contrat + clés API requis (sandbox souvent limité en RDC). Aucun débit simulé. Documentez FLW/Paystack sandbox en attendant.`,
    {
      requiresContract: true,
      capabilities: ["mobile_money", "card"],
      supportedCurrencies: ["USD", "CDF"],
      supportedOperators: ["mpesa", "airtel_money", "orange_money"],
    },
  );
}

/** Resolve default aggregator from env */
export function resolveDefaultAggregator(): AggregatorId {
  const selected = (process.env.PAYMENT_PROVIDER || "mock").toLowerCase();
  if (
    selected === "stripe" ||
    selected === "flutterwave" ||
    selected === "paystack" ||
    selected === "maxicash" ||
    selected === "flexpay" ||
    selected === "cash_on_delivery" ||
    selected === "mock"
  ) {
    return selected;
  }
  return "mock";
}

export function getProviderById(id: string): PaymentProvider {
  switch (id) {
    case "mock":
      return new MockPaymentProvider();
    case "stripe":
      return buildStripe();
    case "flutterwave":
      return buildFlutterwave();
    case "paystack":
      return buildPaystack();
    case "maxicash":
      return buildLocalOperator("maxicash");
    case "flexpay":
      return buildLocalOperator("flexpay");
    case "cash_on_delivery":
      return new CashOnDeliveryProvider();
    default:
      throw new Error(`Unknown payment provider: ${id}`);
  }
}

/**
 * Choose provider for a checkout method.
 * COD always uses cash_on_delivery path (never a card aggregator).
 */
export function getPaymentProviderForMethod(
  method: PaymentMethodKind = "mobile_money",
): PaymentProvider {
  if (method === "cash_on_delivery") {
    return new CashOnDeliveryProvider();
  }
  return getProviderById(resolveDefaultAggregator());
}

/** Backward-compatible default resolver */
export function getPaymentProvider(): PaymentProvider {
  return getProviderById(resolveDefaultAggregator());
}

export function listProviderCatalog(): ProviderAvailability[] {
  const ids: AggregatorId[] = [
    "mock",
    "stripe",
    "flutterwave",
    "paystack",
    "maxicash",
    "flexpay",
    "cash_on_delivery",
  ];
  return ids.map((id) => getProviderById(id).describe());
}
