import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { adjustLoyalty } from "@/lib/crm";

type Params = { params: Promise<{ storeId: string }> };

const schema = z.object({
  customerId: z.string().min(1),
  type: z.enum(["earn", "redeem", "adjust", "expire"]),
  points: z.number().int(),
  reason: z.string().optional(),
  orderId: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = schema.parse(await req.json());
    const result = await adjustLoyalty({ storeId, ...body });
    return jsonOk(result, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
