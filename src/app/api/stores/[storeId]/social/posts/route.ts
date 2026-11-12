import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { createSocialPostDraft, listSocialPosts } from "@/lib/social/posts";

type Params = { params: Promise<{ storeId: string }> };

const schema = z.object({
  platform: z.enum(["meta", "tiktok"]),
  caption: z.string().optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  hashtags: z.array(z.string()).optional(),
  script: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  productName: z.string().optional(),
  priceLabel: z.string().optional(),
  storeName: z.string().optional(),
  confirmPublish: z.boolean().default(false),
});

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const posts = await listSocialPosts(storeId);
    return jsonOk({ posts }, { requestId: rid });
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
    const body = schema.parse(await req.json());
    const result = await createSocialPostDraft({
      storeId,
      platform: body.platform,
      caption: body.caption,
      mediaUrls: body.mediaUrls,
      hashtags: body.hashtags,
      script: body.script,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      productName: body.productName,
      priceLabel: body.priceLabel,
      storeName: body.storeName,
      createdById: session.user!.id!,
      confirmPublish: body.confirmPublish,
    });
    return jsonOk(result, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
