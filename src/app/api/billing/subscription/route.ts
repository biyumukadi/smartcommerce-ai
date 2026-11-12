import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { getUserMemberships } from "@/lib/tenant";
import {
  changePlan,
  getOrganizationSubscription,
  resolveSaasBillingProvider,
  summarizeCosts,
  syncAiCreditsLimit,
} from "@/lib/billing";
import { assertRateLimit, requireSameOrigin } from "@/lib/security";

export async function GET() {
  const rid = withRequestId();
  try {
    const session = await requireSession();
    const { orgMembers } = await getUserMemberships(session.user!.id!);
    const org = orgMembers[0]?.organization;
    if (!org) throw new Error("Aucune organisation");
    const subscription = await getOrganizationSubscription(org.id);
    const costs = await summarizeCosts(org.id);
    return jsonOk(
      {
        subscription,
        costs,
        billingProvider: resolveSaasBillingProvider(),
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}

const patchSchema = z.object({
  planCode: z.enum(["trial", "starter", "business", "premium"]),
  confirmPurchase: z.boolean(),
});

export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    requireSameOrigin(req);
    const session = await requireSession();
    await assertRateLimit({
      key: `billing:${session.user!.id}`,
      limit: 10,
      windowSec: 60,
    });
    const { orgMembers } = await getUserMemberships(session.user!.id!);
    const membership = orgMembers[0];
    if (!membership) throw new Error("Aucune organisation");
    if (
      !membership.role.permissions.includes("billing:write") &&
      !membership.role.permissions.includes("*") &&
      membership.role.code !== "ORG_OWNER"
    ) {
      throw new Error("Forbidden: billing:write");
    }
    const body = patchSchema.parse(await req.json());
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const result = await changePlan({
      organizationId: membership.organization.id,
      planCode: body.planCode,
      userId: session.user!.id!,
      userEmail: session.user!.email || "billing@smartcommerce.ai",
      confirmPurchase: body.confirmPurchase,
      successUrl: `${appUrl}/fr/dashboard/billing?ok=1`,
      cancelUrl: `${appUrl}/fr/dashboard/billing?cancel=1`,
    });
    await syncAiCreditsLimit(membership.organization.id);
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
