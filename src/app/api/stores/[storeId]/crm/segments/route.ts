import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { evaluateSegment, listSegments } from "@/lib/crm";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const key = new URL(req.url).searchParams.get("key");
    if (key) {
      const evaluated = await evaluateSegment(storeId, key);
      return jsonOk(evaluated, { requestId: rid });
    }
    const segments = await listSegments(storeId);
    return jsonOk({ segments }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
