import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { sendOrderLifecycleWhatsApp } from "@/lib/messaging/notifications";

type Params = { params: Promise<{ storeId: string }> };

const schema = z.object({
  orderId: z.string().min(1),
  template: z.enum([
    "order_confirmation",
    "payment_received",
    "delivery_update",
  ]),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = schema.parse(await req.json());
    const result = await sendOrderLifecycleWhatsApp({
      storeId,
      orderId: body.orderId,
      template: body.template,
    });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
