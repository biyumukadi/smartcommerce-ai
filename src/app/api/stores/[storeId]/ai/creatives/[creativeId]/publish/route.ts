import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { publishCreativeToChannel } from "@/lib/ai/creatives";

type Params = {
  params: Promise<{ storeId: string; creativeId: string }>;
};

const schema = z.object({
  platform: z.enum(["meta", "tiktok"]),
  mode: z.enum(["organic", "spend"]).default("organic"),
  confirmPublish: z.boolean().default(false),
  confirmSpend: z.boolean().optional(),
  budgetMinor: z.number().int().min(0).optional(),
  currency: z.string().min(3).max(3).optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, creativeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "ads:write");
    const body = schema.parse(await req.json());
    const result = await publishCreativeToChannel({
      storeId,
      creativeId,
      platform: body.platform,
      mode: body.mode,
      confirmPublish: body.confirmPublish,
      confirmSpend: body.confirmSpend,
      budgetMinor: body.budgetMinor,
      currency: body.currency,
      userId: session.user!.id!,
    });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
