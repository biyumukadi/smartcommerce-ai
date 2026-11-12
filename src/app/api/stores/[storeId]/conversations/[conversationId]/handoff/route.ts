import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  handoffToHuman,
  resumeAi,
} from "@/lib/messaging/conversations";

type Params = {
  params: Promise<{ storeId: string; conversationId: string }>;
};

const schema = z.object({
  action: z.enum(["handoff", "resume_ai"]).default("handoff"),
  reason: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, conversationId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = schema.parse(await req.json().catch(() => ({})));

    if (body.action === "resume_ai") {
      await resumeAi({ storeId, conversationId });
      return jsonOk({ status: "open", aiEnabled: true }, { requestId: rid });
    }

    const conversation = await handoffToHuman({
      storeId,
      conversationId,
      assignedToUserId: session.user!.id!,
      reason: body.reason,
    });
    return jsonOk({ conversation }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
