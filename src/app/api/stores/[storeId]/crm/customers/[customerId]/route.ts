import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { getCustomerProfile, upsertCustomer } from "@/lib/crm";

type Params = {
  params: Promise<{ storeId: string; customerId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, customerId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const profile = await getCustomerProfile(storeId, customerId);
    return jsonOk(profile, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const patchSchema = z.object({
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  lifecycle: z
    .enum(["prospect", "active", "churn_risk", "inactive", "vip"])
    .optional(),
  marketingConsentWhatsApp: z.boolean().optional(),
  marketingConsentEmail: z.boolean().optional(),
  marketingConsentSms: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, customerId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = patchSchema.parse(await req.json());
    const customer = await upsertCustomer({
      storeId,
      id: customerId,
      ...body,
    });
    return jsonOk({ customer }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
