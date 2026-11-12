import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { startSocialOAuth } from "@/lib/social/connections";

type Params = { params: Promise<{ platform: string }> };

const schema = z.object({
  storeId: z.string().min(1),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { platform } = await params;
  try {
    if (platform !== "meta" && platform !== "tiktok") {
      throw new Error("Platform must be meta or tiktok");
    }
    const session = await requireSession();
    const body = schema.parse(await req.json());
    await requireStoreAccess(session.user!.id!, body.storeId, "channels:write");
    const result = await startSocialOAuth({
      storeId: body.storeId,
      platform,
    });
    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
