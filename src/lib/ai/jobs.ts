import { prisma } from "@/lib/db";
import { getImageProvider, getTextProvider, MissingApiKeyError } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { Queue, Worker } from "bullmq";
import { getRedis } from "@/lib/redis";

const QUEUE_NAME = "ai-jobs";

export function getAIQueue() {
  return new Queue(QUEUE_NAME, {
    connection: getRedis(),
  });
}

export async function enqueueAIJob(jobId: string) {
  try {
    const queue = getAIQueue();
    await queue.add(
      "process",
      { jobId },
      { jobId, removeOnComplete: 100, removeOnFail: 100 },
    );
  } catch (err) {
    logger.warn("ai.queue_unavailable_fallback_inline", {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    await processAIJob(jobId);
  }
}

export async function processAIJob(jobId: string) {
  const job = await prisma.aIJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.status === "succeeded" || job.status === "cancelled") return;

  await prisma.aIJob.update({
    where: { id: jobId },
    data: { status: "running", startedAt: new Date(), error: null },
  });

  try {
    const input = job.input as {
      prompt?: string;
      locale?: "fr" | "en";
      productName?: string;
      tone?: string;
    };

    if (job.type === "ad_copy" || job.type === "product_description") {
      const provider = getTextProvider();
      const prompt =
        input.prompt ||
        `Génère une pub courte pour ${input.productName || "notre produit"}. Ton: ${input.tone || "chaleureux, RDC-first"}.`;
      const result = await provider.generateText({
        prompt,
        locale: input.locale || "fr",
      });

      await prisma.aIJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          provider: result.provider,
          output: {
            headline: result.text.split("\n")[0]?.slice(0, 120),
            body: result.text,
          },
          usageTokens: result.usageTokens,
          finishedAt: new Date(),
        },
      });

      await prisma.adCreative.create({
        data: {
          storeId: job.storeId,
          type: "text",
          locale: input.locale || "fr",
          headline: result.text.split("\n")[0]?.slice(0, 120),
          body: result.text,
          cta: "Acheter maintenant",
          aiJobId: job.id,
          status: "ready",
        },
      });

      await incrementUsage(job.organizationId, {
        tokens: result.usageTokens,
        images: 0,
      });
    } else if (job.type === "ad_image") {
      const provider = getImageProvider();
      const prompt =
        input.prompt ||
        `Creative publicitaire ecommerce Africa, produit: ${input.productName || "produit"}, style photo réaliste`;
      const result = await provider.generateImage({ prompt });

      const assetKey = result.imageBase64
        ? `org/${job.organizationId}/store/${job.storeId}/ads/${job.id}.png`
        : result.imageUrl || null;

      await prisma.aIJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          provider: result.provider,
          output: {
            assetKey,
            imageUrl: result.imageUrl,
            hasBase64: Boolean(result.imageBase64),
          },
          usageTokens: result.usageTokens,
          finishedAt: new Date(),
        },
      });

      await prisma.adCreative.create({
        data: {
          storeId: job.storeId,
          type: "image",
          locale: input.locale || "fr",
          headline: input.productName || "Créatif AI",
          assetKey: assetKey || undefined,
          aiJobId: job.id,
          status: "ready",
        },
      });

      await incrementUsage(job.organizationId, {
        tokens: result.usageTokens,
        images: 1,
      });
    } else {
      throw new Error(`Unsupported AI job type: ${job.type}`);
    }

    logger.info("ai.job.succeeded", { jobId, storeId: job.storeId });
  } catch (err) {
    const message =
      err instanceof MissingApiKeyError
        ? err.message
        : err instanceof Error
          ? err.message
          : "AI job failed";

    await prisma.aIJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: message,
        finishedAt: new Date(),
      },
    });

    logger.error("ai.job.failed", {
      jobId,
      storeId: job.storeId,
      error: message,
    });
  }
}

async function incrementUsage(
  organizationId: string,
  delta: { tokens: number; images: number },
) {
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  await prisma.aIUsage.upsert({
    where: {
      organizationId_periodStart: { organizationId, periodStart },
    },
    update: {
      tokensUsed: { increment: delta.tokens },
      imageCount: { increment: delta.images },
    },
    create: {
      organizationId,
      periodStart,
      periodEnd,
      tokensUsed: delta.tokens,
      imageCount: delta.images,
      costMinor: 0,
      currency: "USD",
    },
  });
}

export function startAIWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await processAIJob(job.data.jobId as string);
    },
    { connection: getRedis() },
  );

  worker.on("failed", (job, err) => {
    logger.error("ai.worker.failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  return worker;
}
