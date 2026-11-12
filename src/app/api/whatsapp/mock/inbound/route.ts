import { z } from "zod";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { MockWhatsAppProvider } from "@/lib/whatsapp";
import { processWhatsAppWebhookBody } from "@/lib/messaging/inbound";

const schema = z.object({
  fromE164: z.string().min(8),
  body: z.string().min(1),
  phoneNumberId: z.string().optional(),
});

/**
 * Sandbox helper: emit a signed mock inbound WhatsApp webhook.
 * Does not claim Meta Cloud delivery.
 */
export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    if (
      (process.env.WHATSAPP_PROVIDER || "auto") === "cloud" &&
      process.env.NODE_ENV === "production"
    ) {
      throw new Error("Mock inbound disabled when WHATSAPP_PROVIDER=cloud in production");
    }
    const body = schema.parse(await req.json());
    const mock = new MockWhatsAppProvider();
    const { body: rawBody, signature } = mock.buildInboundWebhook({
      fromE164: body.fromE164,
      body: body.body,
      phoneNumberId:
        body.phoneNumberId ||
        process.env.WHATSAPP_PHONE_NUMBER_ID ||
        "mock_phone",
    });
    const result = await processWhatsAppWebhookBody({
      rawBody,
      signature,
    });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
