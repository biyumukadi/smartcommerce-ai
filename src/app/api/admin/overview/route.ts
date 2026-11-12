import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { platformOverview, requirePlatformAdmin } from "@/lib/admin/platform";
import { assertRateLimit } from "@/lib/security";

export async function GET() {
  const rid = withRequestId();
  try {
    const session = await requireSession();
    await requirePlatformAdmin(session.user!.id!);
    await assertRateLimit({
      key: `admin:${session.user!.id}`,
      limit: 60,
      windowSec: 60,
    });
    const overview = await platformOverview();
    return jsonOk(overview, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
