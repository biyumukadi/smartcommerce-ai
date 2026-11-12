import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { syncOrExportCatalog } from "@/lib/social/catalog";

type Params = { params: Promise<{ storeId: string }> };

const schema = z.object({
  platform: z.enum(["meta", "tiktok"]),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "channels:write");
    const body = schema.parse(await req.json());
    const result = await syncOrExportCatalog({
      storeId,
      platform: body.platform,
    });
    return jsonOk(result, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
