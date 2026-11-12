import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { enqueueAIJob } from "@/lib/ai/jobs";
import { aiProviderStatus } from "@/lib/ai";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user.id, storeId, "ads:write");
    const jobs = await prisma.aIJob.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { creatives: true },
    });
    return jsonOk({ jobs, providers: aiProviderStatus() }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const createSchema = z.object({
  type: z.enum(["ad_copy", "ad_image", "product_description"]),
  prompt: z.string().min(3).max(2000),
  locale: z.enum(["fr", "en"]).default("fr"),
  productName: z.string().optional(),
  tone: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    const access = await requireStoreAccess(
      session.user.id,
      storeId,
      "ads:write",
    );
    const body = createSchema.parse(await req.json());

    const job = await prisma.aIJob.create({
      data: {
        organizationId: access.store.organizationId,
        storeId,
        type: body.type,
        status: "queued",
        provider: process.env.OPENAI_API_KEY ? "openai" : "noop",
        input: {
          prompt: body.prompt,
          locale: body.locale,
          productName: body.productName,
          tone: body.tone,
        },
        createdById: session.user.id,
      },
    });

    // Process async via queue; falls back to inline if Redis queue unavailable
    void enqueueAIJob(job.id);

    return jsonOk(
      {
        job,
        providers: aiProviderStatus(),
        notice: process.env.OPENAI_API_KEY
          ? "Job mis en file — provider OpenAI"
          : "OPENAI_API_KEY absente — le job échouera explicitement (fail-closed)",
      },
      { status: 201, requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
