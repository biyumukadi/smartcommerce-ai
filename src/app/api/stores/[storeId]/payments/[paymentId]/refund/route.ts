import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { createRefundForPayment } from "@/lib/commerce/payments";

type Params = { params: Promise<{ storeId: string; paymentId: string }> };

const schema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, paymentId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:refund");
    const body = schema.parse(await req.json().catch(() => ({})));
    const result = await createRefundForPayment({
      storeId,
      paymentId,
      amount: body.amount,
      reason: body.reason,
    });
    return jsonOk(result, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
