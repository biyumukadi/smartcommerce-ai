import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { enqueueAIJob } from "@/lib/ai/jobs";
import { aiProviderStatus, getOrCreateUsage } from "@/lib/ai";
import { creditCostFor } from "@/lib/ai/credits";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    const access = await requireStoreAccess(
      session.user!.id!,
      storeId,
      "ads:write",
    );
    const [jobs, usage] = await Promise.all([
      prisma.aIJob.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { creatives: true },
      }),
      getOrCreateUsage(access.store.organizationId),
    ]);
    return jsonOk(
      { jobs, usage, providers: aiProviderStatus() },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const createSchema = z.object({
  type: z.enum([
    "ad_copy",
    "ad_image",
    "product_description",
    "ad_copy_pack",
    "ad_visual",
    "ad_video_script",
    "ad_ab_variants",
  ]),
  prompt: z.string().max(2000).optional(),
  locale: z.enum(["fr", "en"]).default("fr"),
  productName: z.string().optional(),
  productId: z.string().optional(),
  tone: z.string().optional(),
  strategy: z.enum(["sales", "acquisition", "brand"]).optional(),
  strategies: z.array(z.enum(["sales", "acquisition", "brand"])).optional(),
  formats: z.array(z.string()).optional(),
  durationSec: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]).optional(),
  abCount: z.number().int().min(2).max(3).optional(),
  includeVoiceover: z.boolean().optional(),
  includeVideoRender: z.boolean().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    const access = await requireStoreAccess(
      session.user!.id!,
      storeId,
      "ads:write",
    );
    const body = createSchema.parse(await req.json());

    if (
      (body.type === "ad_copy_pack" ||
        body.type === "ad_visual" ||
        body.type === "ad_video_script" ||
        body.type === "ad_ab_variants") &&
      !body.productId &&
      !body.productName
    ) {
      // productId preferred; productName alone may fail product-aware jobs
    }

    const needsOpenAI =
      body.type !== "ad_video_script" ||
      body.includeVoiceover ||
      body.includeVideoRender;
    // video script without TTS/render can succeed without OpenAI (local engine)
    const providerGuess =
      body.type === "ad_video_script" &&
      !body.includeVoiceover &&
      !body.includeVideoRender
        ? "script_engine"
        : process.env.OPENAI_API_KEY
          ? "openai"
          : "noop";

    const job = await prisma.aIJob.create({
      data: {
        organizationId: access.store.organizationId,
        storeId,
        type: body.type,
        status: "queued",
        provider: providerGuess,
        input: {
          prompt: body.prompt,
          locale: body.locale,
          productName: body.productName,
          productId: body.productId,
          tone: body.tone,
          strategy: body.strategy,
          strategies: body.strategies,
          formats: body.formats,
          durationSec: body.durationSec,
          aspectRatio: body.aspectRatio,
          abCount: body.abCount,
          includeVoiceover: body.includeVoiceover,
          includeVideoRender: body.includeVideoRender,
        },
        createdById: session.user!.id!,
      },
    });

    void enqueueAIJob(job.id);

    const notice =
      providerGuess === "noop"
        ? "OPENAI_API_KEY absente — le job échouera explicitement (fail-closed)"
        : providerGuess === "script_engine"
          ? `Script vidéo local en file (−${creditCostFor(body.type)} crédits). TTS/render restent fail-closed sans clés.`
          : needsOpenAI
            ? `Job mis en file — OpenAI (−${creditCostFor(body.type)} crédits)`
            : "Job mis en file";

    return jsonOk(
      {
        job,
        providers: aiProviderStatus(),
        creditCost: creditCostFor(body.type),
        notice,
      },
      { status: 201, requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
