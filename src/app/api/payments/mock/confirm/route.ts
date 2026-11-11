import { z } from "zod";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { confirmMockPayment } from "@/lib/commerce/payments";

const schema = z.object({
  providerRef: z.string().min(1),
});

/**
 * Sandbox-only helper that emits a signed mock webhook.
 * Never available as "silent success" — still goes through webhook verification.
 */
export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    if ((process.env.PAYMENT_PROVIDER || "mock") !== "mock" && process.env.NODE_ENV === "production") {
      throw new Error("Mock confirm disabled when PAYMENT_PROVIDER is not mock");
    }
    const body = schema.parse(await req.json());
    const result = await confirmMockPayment(body.providerRef);
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
