import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { listConversations } from "@/lib/messaging/conversations";
import { listWhatsAppCatalog, getWhatsAppProvider } from "@/lib/whatsapp";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const conversations = await listConversations(storeId);
    return jsonOk(
      {
        conversations,
        whatsapp: getWhatsAppProvider().describe(),
        catalog: listWhatsAppCatalog(),
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
