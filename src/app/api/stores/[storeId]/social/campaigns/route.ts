import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  createAdsCampaignDraft,
  launchAdsCampaign,
  listCampaigns,
} from "@/lib/social/ads";

type Params = { params: Promise<{ storeId: string }> };

const createSchema = z.object({
  platform: z.enum(["meta", "tiktok"]),
  name: z.string().min(2),
  budgetMinor: z.number().int().positive(),
  currency: z.enum(["USD", "CDF", "EUR"]).default("USD"),
  objective: z.string().optional(),
});

const launchSchema = z.object({
  campaignId: z.string().min(1),
  platform: z.enum(["meta", "tiktok"]),
  confirmSpend: z.boolean(),
});

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const campaigns = await listCampaigns(storeId);
    return jsonOk({ campaigns }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "ads:write");
    const json = await req.json();

    if (json.action === "launch") {
      const body = launchSchema.parse(json);
      const result = await launchAdsCampaign({
        storeId,
        campaignId: body.campaignId,
        platform: body.platform,
        confirmSpend: body.confirmSpend,
        confirmedById: session.user!.id!,
      });
      return jsonOk(result, { requestId: rid });
    }

    const body = createSchema.parse(json);
    const campaign = await createAdsCampaignDraft({
      storeId,
      platform: body.platform,
      name: body.name,
      budgetMinor: body.budgetMinor,
      currency: body.currency,
      objective: body.objective,
      createdById: session.user!.id!,
    });
    return jsonOk(
      {
        campaign,
        notice:
          "Campagne draft créée. Aucun spend tant que launch + confirmSpend=true.",
      },
      { status: 201, requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
