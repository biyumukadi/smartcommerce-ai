import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { listPaymentHistory } from "@/lib/commerce/payments";
import { listProviderCatalog } from "@/lib/payments";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    const payments = await listPaymentHistory({ storeId, limit });
    return jsonOk(
      {
        payments,
        providers: listProviderCatalog(),
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
