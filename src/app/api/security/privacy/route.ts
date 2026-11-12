import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import {
  assertRateLimit,
  requestPrivacyDelete,
  requestPrivacyExport,
  requireSameOrigin,
} from "@/lib/security";
import { getUserMemberships } from "@/lib/tenant";

const schema = z.object({
  action: z.enum(["export", "delete"]),
  confirm: z.boolean().optional(),
});

export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    requireSameOrigin(req);
    const session = await requireSession();
    await assertRateLimit({
      key: `privacy:${session.user!.id}`,
      limit: 5,
      windowSec: 300,
    });
    const body = schema.parse(await req.json());
    const { orgMembers } = await getUserMemberships(session.user!.id!);
    const organizationId = orgMembers[0]?.organization.id;

    if (body.action === "export") {
      const result = await requestPrivacyExport({
        userId: session.user!.id!,
        organizationId,
      });
      return jsonOk(result, { requestId: rid });
    }

    const result = await requestPrivacyDelete({
      userId: session.user!.id!,
      organizationId,
      confirm: Boolean(body.confirm),
    });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
