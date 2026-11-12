import { afterEach, describe, expect, it } from "vitest";
import {
  getPaymentProvider,
  getPaymentProviderForMethod,
  getProviderById,
  listProviderCatalog,
} from "../src/lib/payments";
import { CashOnDeliveryProvider } from "../src/lib/payments/cash-on-delivery";
import { UnavailablePaymentProvider } from "../src/lib/payments/unavailable-provider";
import { buildReceiptPdf } from "../src/lib/commerce/receipts";

describe("payment provider registry", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it("defaults to mock", () => {
    delete process.env.PAYMENT_PROVIDER;
    const p = getPaymentProvider();
    expect(p.id).toBe("mock");
    expect(p.mode).toBe("mock");
  });

  it("returns unavailable flutterwave without keys (no fake success)", async () => {
    process.env.PAYMENT_PROVIDER = "flutterwave";
    delete process.env.FLW_SECRET_KEY;
    const p = getPaymentProvider();
    expect(p).toBeInstanceOf(UnavailablePaymentProvider);
    expect(p.mode).toBe("unavailable");
    const intent = await p.createIntent({
      amount: 1000,
      currency: "CDF",
      orderId: "o1",
      storeId: "s1",
      idempotencyKey: "k1",
      returnUrl: "http://localhost/r",
      method: "mobile_money",
      operator: "orange_money",
    });
    expect(intent.status).toBe("unavailable");
    expect(intent.status).not.toBe("succeeded");
  });

  it("returns unavailable paystack/stripe/maxicash without keys", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    expect(getProviderById("paystack").mode).toBe("unavailable");
    expect(getProviderById("stripe").mode).toBe("unavailable");
    expect(getProviderById("maxicash").mode).toBe("unavailable");
    expect(getProviderById("flexpay").mode).toBe("unavailable");
  });

  it("routes COD to cash_on_delivery provider", async () => {
    const p = getPaymentProviderForMethod("cash_on_delivery");
    expect(p).toBeInstanceOf(CashOnDeliveryProvider);
    const intent = await p.createIntent({
      amount: 5000,
      currency: "USD",
      orderId: "o2",
      storeId: "s2",
      idempotencyKey: "cod1",
      method: "cash_on_delivery",
      returnUrl: "http://localhost/r",
    });
    expect(intent.status).toBe("pending");
    expect(intent.provider).toBe("cash_on_delivery");
  });

  it("lists catalog with FR notes", () => {
    const catalog = listProviderCatalog();
    expect(catalog.map((c) => c.id)).toContain("flutterwave");
    expect(catalog.find((c) => c.id === "cash_on_delivery")?.available).toBe(
      true,
    );
    expect(
      catalog.every((c) => typeof c.notesFr === "string" && c.notesFr.length > 0),
    ).toBe(true);
  });

  it("COD rejects payment webhooks", async () => {
    const p = new CashOnDeliveryProvider();
    await expect(p.parseWebhook("{}", "sig")).rejects.toThrow(/confirm-cod/i);
  });
});

describe("receipt PDF", () => {
  it("builds a valid-looking PDF buffer", () => {
    const pdf = buildReceiptPdf({
      orderNumber: "SC-TEST-1",
      currency: "USD",
      totalAmount: 4500,
      subtotalAmount: 4500,
      shippingAmount: 0,
      taxAmount: 0,
      discountAmount: 0,
      status: "paid",
      paymentStatus: "paid",
      placedAt: new Date(),
      createdAt: new Date(),
      storeName: "Demo",
      customerName: "Client",
      items: [
        {
          sku: "SKU-1",
          quantity: 1,
          unitPriceAmount: 4500,
          totalAmount: 4500,
          productName: { fr: "Produit" },
        },
      ],
      payments: [
        {
          provider: "mock",
          method: "mobile_money",
          status: "succeeded",
          amount: 4500,
          currency: "USD",
          providerRef: "mock_x",
        },
      ],
    });
    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(pdf.toString("utf8")).toContain("%%EOF");
  });
});
