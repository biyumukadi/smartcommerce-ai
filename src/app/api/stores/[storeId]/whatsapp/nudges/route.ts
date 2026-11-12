import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { processAbandonedCartNudges } from "@/lib/messaging/cart-nudges";

type Params = { params: Promise<{ storeId: string }> };

const schema = z.object({
  idleMs: z.number().int().positive().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = schema.parse(await req.json().catch(() => ({})));
    const result = await processAbandonedCartNudges({
      storeId,
      idleMs: body.idleMs ?? 1, // allow immediate test scans when consented
    });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
