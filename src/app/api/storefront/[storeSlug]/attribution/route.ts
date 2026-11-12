import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { recordAttributionEvent } from "@/lib/social/attribution";

type Params = { params: Promise<{ storeSlug: string }> };

const schema = z.object({
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
  content: z.string().optional(),
  term: z.string().optional(),
  clickId: z.string().optional(),
  path: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeSlug } = await params;
  try {
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug, status: "live", deletedAt: null },
    });
    if (!store) throw new Error("Boutique introuvable");
    const body = schema.parse(await req.json());
    const jar = await cookies();
    const sessionId = jar.get("sc_cart")?.value;
    const event = await recordAttributionEvent({
      storeId: store.id,
      sessionId,
      source: body.source,
      medium: body.medium,
      campaign: body.campaign,
      content: body.content,
      term: body.term,
      clickId: body.clickId,
      path: body.path || "storefront",
    });
    return jsonOk({ eventId: event.id }, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
