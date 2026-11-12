import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { sendOutboundText } from "@/lib/messaging/conversations";

type Params = {
  params: Promise<{ storeId: string; conversationId: string }>;
};

const schema = z.object({
  body: z.string().min(1).max(4000),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, conversationId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = schema.parse(await req.json());
    const result = await sendOutboundText({
      storeId,
      conversationId,
      body: body.body,
      sentByUserId: session.user!.id!,
    });
    return jsonOk(result, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
