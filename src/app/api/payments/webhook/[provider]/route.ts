import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { processPaymentWebhook } from "@/lib/commerce/payments";

type Params = { params: Promise<{ provider: string }> };

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { provider } = await params;
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-sc-signature") ||
      req.headers.get("stripe-signature") ||
      req.headers.get("x-webhook-signature");

    const result = await processPaymentWebhook({
      providerId: provider,
      rawBody,
      signature,
    });

    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
