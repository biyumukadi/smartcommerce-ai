import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { confirmCashOnDelivery } from "@/lib/commerce/payments";

type Params = { params: Promise<{ storeId: string; orderId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, orderId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const order = await confirmCashOnDelivery({ storeId, orderId });
    return jsonOk(
      {
        order,
        notice:
          "Espèces confirmées — commande marked paid via chemin COD (pas un succès carte).",
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
