import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { createPersonalCoupon, listCoupons } from "@/lib/crm";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const customerId =
      new URL(req.url).searchParams.get("customerId") || undefined;
    const coupons = await listCoupons(storeId, customerId);
    return jsonOk({ coupons }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const schema = z.object({
  customerId: z.string().min(1),
  type: z.enum(["percent", "fixed", "free_shipping"]).optional(),
  valueMinor: z.number().int().positive(),
  currency: z.string().optional(),
  minOrderMinor: z.number().int().optional(),
  code: z.string().optional(),
  endsAt: z.string().datetime().optional(),
  segmentKey: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = schema.parse(await req.json());
    const coupon = await createPersonalCoupon({
      storeId,
      customerId: body.customerId,
      type: body.type,
      valueMinor: body.valueMinor,
      currency: body.currency,
      minOrderMinor: body.minOrderMinor,
      code: body.code,
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
      segmentKey: body.segmentKey,
    });
    return jsonOk({ coupon }, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
