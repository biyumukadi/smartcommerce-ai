import { MockPaymentProvider } from "./mock-provider";
import { StripeSandboxProvider } from "./stripe-sandbox";
import type { PaymentProvider } from "./types";

export type { PaymentProvider, WebhookEvent, PaymentIntent } from "./types";
export { MockPaymentProvider };

export function getPaymentProvider(): PaymentProvider {
  const selected = (process.env.PAYMENT_PROVIDER || "mock").toLowerCase();

  if (selected === "stripe") {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "PAYMENT_PROVIDER=stripe but STRIPE_SECRET_KEY is missing. Use PAYMENT_PROVIDER=mock or set test keys.",
      );
    }
    return new StripeSandboxProvider(key);
  }

  return new MockPaymentProvider();
}
