import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { fetchPostComments } from "@/lib/social/posts";

type Params = {
  params: Promise<{ storeId: string; postId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, postId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const result = await fetchPostComments({ storeId, postId });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
