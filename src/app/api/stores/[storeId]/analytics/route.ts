import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  buildStoreAnalytics,
  type AnalyticsPeriod,
} from "@/lib/analytics";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const url = new URL(req.url);
    const period = (url.searchParams.get("period") ||
      "month") as AnalyticsPeriod;
    const analytics = await buildStoreAnalytics(storeId, {
      period,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
    });
    return jsonOk({ analytics }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
