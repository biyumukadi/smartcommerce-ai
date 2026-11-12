import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  buildStoreAnalytics,
  runAnalyticsAssistant,
  type AnalyticsPeriod,
} from "@/lib/analytics";

type Params = { params: Promise<{ storeId: string }> };

const schema = z.object({
  question: z.string().max(1000).optional(),
  period: z.enum(["day", "week", "month", "custom"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  locale: z.enum(["fr", "en"]).optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const body = schema.parse(await req.json());
    const analytics = await buildStoreAnalytics(storeId, {
      period: (body.period || "month") as AnalyticsPeriod,
      from: body.from,
      to: body.to,
    });
    const result = await runAnalyticsAssistant({
      analytics,
      question: body.question,
      locale: body.locale || "fr",
    });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
