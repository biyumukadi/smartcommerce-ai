import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  ensureDefaultSegments,
  listCustomers,
  upsertCustomer,
} from "@/lib/crm";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const url = new URL(req.url);
    await ensureDefaultSegments(storeId);
    const customers = await listCustomers(storeId, {
      lifecycle: (url.searchParams.get("lifecycle") as never) || undefined,
      segmentKey: url.searchParams.get("segment") || undefined,
      q: url.searchParams.get("q") || undefined,
    });
    return jsonOk({ customers }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const createSchema = z.object({
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  lifecycle: z
    .enum(["prospect", "active", "churn_risk", "inactive", "vip"])
    .optional(),
  marketingConsentWhatsApp: z.boolean().optional(),
  marketingConsentEmail: z.boolean().optional(),
  marketingConsentSms: z.boolean().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = createSchema.parse(await req.json());
    const customer = await upsertCustomer({ storeId, ...body });
    return jsonOk({ customer }, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
