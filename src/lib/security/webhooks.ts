/**
 * Webhook signature verification audit — documents which providers verify HMAC.
 * Used by health + tests; actual verify lives in each provider.
 */

export type WebhookAuditEntry = {
  provider: string;
  channel: string;
  signatureHeader: string;
  algorithm: string;
  envSecret: string;
  verifiedInCode: boolean;
  notes: string;
};

export function auditWebhookSignatures(): WebhookAuditEntry[] {
  return [
    {
      provider: "mock",
      channel: "payments",
      signatureHeader: "x-smartcommerce-signature",
      algorithm: "HMAC-SHA256",
      envSecret: "PAYMENT_WEBHOOK_SECRET",
      verifiedInCode: true,
      notes: "MockPaymentProvider.verifyWebhook",
    },
    {
      provider: "stripe",
      channel: "payments",
      signatureHeader: "stripe-signature",
      algorithm: "HMAC-SHA256",
      envSecret: "STRIPE_WEBHOOK_SECRET",
      verifiedInCode: true,
      notes: "stripe-sandbox verifyHmacSha256",
    },
    {
      provider: "flutterwave",
      channel: "payments",
      signatureHeader: "verif-hash",
      algorithm: "HMAC-SHA256",
      envSecret: "FLW_WEBHOOK_SECRET",
      verifiedInCode: true,
      notes: "flutterwave-sandbox",
    },
    {
      provider: "paystack",
      channel: "payments",
      signatureHeader: "x-paystack-signature",
      algorithm: "HMAC-SHA256",
      envSecret: "PAYSTACK_WEBHOOK_SECRET",
      verifiedInCode: true,
      notes: "paystack-sandbox",
    },
    {
      provider: "whatsapp",
      channel: "messaging",
      signatureHeader: "x-hub-signature-256",
      algorithm: "HMAC-SHA256",
      envSecret: "WHATSAPP_WEBHOOK_SECRET",
      verifiedInCode: true,
      notes: "Cloud API + mock inbound",
    },
  ];
}

export function webhookAuditSummary() {
  const entries = auditWebhookSignatures();
  return {
    total: entries.length,
    allVerified: entries.every((e) => e.verifiedInCode),
    missingSecrets: entries
      .filter((e) => !process.env[e.envSecret])
      .map((e) => e.envSecret),
    entries,
  };
}
