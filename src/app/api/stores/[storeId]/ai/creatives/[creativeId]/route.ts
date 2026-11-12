import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  approveCreative,
  buildCreativeDownload,
  updateCreative,
} from "@/lib/ai/creatives";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

type Params = {
  params: Promise<{ storeId: string; creativeId: string }>;
};

const patchSchema = z.object({
  headline: z.string().optional(),
  body: z.string().optional(),
  cta: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  action: z.enum(["approve"]).optional(),
});

export async function GET(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, creativeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "ads:write");
    const creative = await prisma.adCreative.findFirst({
      where: { id: creativeId, storeId },
    });
    if (!creative) throw new Error("Créatif introuvable");

    const url = new URL(req.url);
    if (url.searchParams.get("download") === "1") {
      const file = buildCreativeDownload(creative);
      return new NextResponse(file.body, {
        status: 200,
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "X-Request-Id": rid,
        },
      });
    }

    return jsonOk({ creative }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, creativeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "ads:write");
    const body = patchSchema.parse(await req.json());
    if (body.action === "approve") {
      const creative = await approveCreative({
        storeId,
        creativeId,
        userId: session.user!.id!,
      });
      return jsonOk({ creative }, { requestId: rid });
    }
    const creative = await updateCreative({
      storeId,
      creativeId,
      headline: body.headline,
      body: body.body,
      cta: body.cta,
      hashtags: body.hashtags,
    });
    return jsonOk({ creative }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
