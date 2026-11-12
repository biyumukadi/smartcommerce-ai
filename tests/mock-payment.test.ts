import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "../src/lib/payments/mock-provider";

describe("MockPaymentProvider", () => {
  const secret = "test-webhook-secret";
  const provider = new MockPaymentProvider(secret);

  it("creates requires_action intent (not succeeded)", async () => {
    const intent = await provider.createIntent({
      amount: 4500,
      currency: "USD",
      orderId: "ord_1",
      storeId: "store_1",
      idempotencyKey: "pay_ord_1",
      returnUrl: "http://localhost:3000/result",
    });
    expect(intent.status).toBe("requires_action");
    expect(intent.provider).toBe("mock");
    expect(intent.clientAction?.type).toBe("mock_confirm");
  });

  it("rejects unsigned webhooks", async () => {
    await expect(
      provider.parseWebhook(JSON.stringify({ eventKey: "x" }), null),
    ).rejects.toThrow(/signature/i);
  });

  it("accepts signed succeeded webhook", async () => {
    const { body, signature } = provider.buildSucceededWebhook({
      providerRef: "mock_pay_ord_1",
      idempotencyKey: "pay_ord_1",
      amount: 4500,
      currency: "USD",
    });
    const event = await provider.parseWebhook(body, signature);
    expect(event.type).toBe("payment.succeeded");
    expect(event.providerRef).toBe("mock_pay_ord_1");
  });

  it("rejects tampered webhook bodies", async () => {
    const { body, signature } = provider.buildSucceededWebhook({
      providerRef: "mock_pay_ord_1",
      idempotencyKey: "pay_ord_1",
      amount: 4500,
      currency: "USD",
    });
    await expect(
      provider.parseWebhook(body.replace("4500", "9999"), signature),
    ).rejects.toThrow(/Invalid webhook signature/);
  });

  it("supports mock refunds locally", async () => {
    const refund = await provider.refund({
      providerRef: "mock_pay_ord_1",
      amount: 1000,
      currency: "USD",
      idempotencyKey: "rf_1",
      reason: "test",
    });
    expect(refund.status).toBe("succeeded");
    expect(refund.amount).toBe(1000);
  });

  it("describes USD/CDF/EUR + MM operators", () => {
    const info = provider.describe();
    expect(info.supportedCurrencies).toEqual(
      expect.arrayContaining(["USD", "CDF", "EUR"]),
    );
    expect(info.supportedOperators).toEqual(
      expect.arrayContaining(["mpesa", "airtel_money", "orange_money"]),
    );
    expect(info.refundsSupported).toBe(true);
  });
});
