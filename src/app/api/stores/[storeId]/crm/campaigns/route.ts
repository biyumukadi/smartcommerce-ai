import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  createMarketingAutomation,
  listMarketingAutomations,
  runMarketingAutomation,
} from "@/lib/crm";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const campaigns = await listMarketingAutomations(storeId);
    return jsonOk({ campaigns }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(["meta", "tiktok", "whatsapp", "organic"]).optional(),
  segmentKey: z.string().optional(),
  messageTemplate: z.string().min(1),
  requireConsent: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "ads:write");
    const body = createSchema.parse(await req.json());
    const campaign = await createMarketingAutomation({
      storeId,
      name: body.name,
      channel: body.channel,
      segmentKey: body.segmentKey,
      messageTemplate: body.messageTemplate,
      requireConsent: body.requireConsent,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      createdById: session.user!.id!,
    });
    return jsonOk({ campaign }, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const runSchema = z.object({
  automationId: z.string().min(1),
  confirmSend: z.boolean(),
  action: z.literal("run"),
});

export async function PATCH(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "ads:write");
    const body = runSchema.parse(await req.json());
    const result = await runMarketingAutomation({
      storeId,
      automationId: body.automationId,
      confirmSend: body.confirmSend,
    });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
