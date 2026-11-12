import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { getConversationDetail } from "@/lib/messaging/conversations";

type Params = {
  params: Promise<{ storeId: string; conversationId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, conversationId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const conversation = await getConversationDetail(storeId, conversationId);
    if (!conversation) throw new Error("Conversation introuvable");
    return jsonOk({ conversation }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
