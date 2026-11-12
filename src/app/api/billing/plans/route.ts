import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { listPublicPlans } from "@/lib/billing";
import { COST_CATEGORIES } from "@/lib/billing/plans";

export async function GET() {
  const rid = withRequestId();
  try {
    const plans = await listPublicPlans();
    return jsonOk(
      {
        plans,
        costCategories: COST_CATEGORIES,
        notice:
          "Les prix Starter/Business/Premium sont des frais SaaS plateforme — distincts des coûts externes Ads/WhatsApp/AI/transactions.",
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
