import { afterEach, describe, expect, it } from "vitest";
import {
  getWhatsAppProvider,
  MockWhatsAppProvider,
  UnavailableWhatsAppProvider,
} from "../src/lib/whatsapp";
import { buildProductWhatsAppLink } from "../src/lib/messaging/product-cta";

describe("WhatsApp providers", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("unavailable never reports sent", async () => {
    const p = new UnavailableWhatsAppProvider();
    const text = await p.sendText({
      toE164: "+243900000000",
      body: "hello",
      storeId: "s1",
    });
    expect(text.status).toBe("unavailable");
    expect(text.status).not.toBe("sent");

    const tpl = await p.sendTemplate({
      toE164: "+243900000000",
      template: "order_confirmation",
      variables: { order_number: "SC-1" },
      storeId: "s1",
    });
    expect(tpl.status).toBe("unavailable");
  });

  it("cloud without keys resolves to unavailable when forced", () => {
    process.env.WHATSAPP_PROVIDER = "cloud";
    delete process.env.WHATSAPP_CLOUD_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const p = getWhatsAppProvider();
    expect(p.mode).toBe("unavailable");
  });

  it("mock accepts signed inbound webhook only", async () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = "wa-test-secret";
    const mock = new MockWhatsAppProvider("wa-test-secret");
    const { body, signature } = mock.buildInboundWebhook({
      fromE164: "+243900000001",
      body: "Prix du sac ?",
    });
    const parsed = await mock.parseWebhook(body, signature);
    expect(parsed.kind).toBe("inbound");
    if (parsed.kind === "inbound") {
      expect(parsed.messages[0].body).toContain("sac");
    }
    await expect(mock.parseWebhook(body, null)).rejects.toThrow(/signature/i);
  });

  it("builds product wa.me deep links", () => {
    const href = buildProductWhatsAppLink({
      phoneE164: "+243 900 000 000",
      storeName: "Marché",
      productName: "Sac",
      sku: "SAC-1",
      priceLabel: "15,00 $US",
    });
    expect(href.startsWith("https://wa.me/243900000000?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("SAC-1");
  });
});
