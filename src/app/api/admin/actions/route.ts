import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import {
  requirePlatformAdmin,
  setOrganizationStatus,
  setSubscriptionStatus,
} from "@/lib/admin/platform";
import { assertRateLimit, requireSameOrigin } from "@/lib/security";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("org_status"),
    organizationId: z.string(),
    status: z.enum(["active", "suspended"]),
  }),
  z.object({
    action: z.literal("subscription_status"),
    subscriptionId: z.string(),
    status: z.enum(["trialing", "active", "past_due", "cancelled"]),
  }),
]);

export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    requireSameOrigin(req);
    const session = await requireSession();
    await requirePlatformAdmin(session.user!.id!);
    await assertRateLimit({
      key: `admin-action:${session.user!.id}`,
      limit: 30,
      windowSec: 60,
    });
    const body = schema.parse(await req.json());
    if (body.action === "org_status") {
      const org = await setOrganizationStatus({
        actorUserId: session.user!.id!,
        organizationId: body.organizationId,
        status: body.status,
      });
      return jsonOk({ organization: org }, { requestId: rid });
    }
    const subscription = await setSubscriptionStatus({
      actorUserId: session.user!.id!,
      subscriptionId: body.subscriptionId,
      status: body.status,
    });
    return jsonOk({ subscription }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
