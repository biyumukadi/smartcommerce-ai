import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  listPermissionsUi,
  listStoreConnections,
} from "@/lib/social/connections";
import { listSocialCatalog } from "@/lib/social";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const connections = await listStoreConnections(storeId);
    return jsonOk(
      {
        connections,
        providers: listSocialCatalog(),
        permissionsUi: listPermissionsUi(),
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
