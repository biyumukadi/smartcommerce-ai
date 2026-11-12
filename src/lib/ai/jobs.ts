import { prisma } from "@/lib/db";
import { MissingApiKeyError } from "@/lib/ai/types";
import { getImageProvider, getTextProvider } from "@/lib/ai/openai-factory";
import { logger } from "@/lib/logger";
import { Queue, Worker } from "bullmq";
import { getRedis } from "@/lib/redis";
import { generateCopyPack } from "./copy-pack";
import {
  assertCreditsAvailable,
  creditCostFor,
  CreditsExceededError,
  incrementUsage,
} from "./credits";
import {
  loadProductAdContext,
  productFactsBlock,
} from "./product-context";
import {
  AD_FORMATS,
  AD_STRATEGIES,
  type AdStrategyKind,
} from "./strategies";
import {
  buildVideoScriptPack,
  renderVideoPlaceholder,
  synthesizeVoiceover,
} from "./video";
import { randomBytes } from "crypto";

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

type JobInput = {
  prompt?: string;
  locale?: "fr" | "en";
  productName?: string;
  productId?: string;
  tone?: string;
  strategy?: AdStrategyKind;
  strategies?: AdStrategyKind[];
  formats?: string[];
  durationSec?: 15 | 30 | 60;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  abCount?: number;
  includeVoiceover?: boolean;
  includeVideoRender?: boolean;
};

export async function processAIJob(jobId: string) {
  const job = await prisma.aIJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.status === "succeeded" || job.status === "cancelled") return;

  await prisma.aIJob.update({
    where: { id: jobId },
    data: { status: "running", startedAt: new Date(), error: null },
  });

  try {
    const credit = await assertCreditsAvailable(job.organizationId, job.type);
    const input = job.input as JobInput;
    const locale = input.locale || "fr";

    if (job.type === "ad_copy" || job.type === "product_description") {
      const product = input.productId
        ? await loadProductAdContext({
            storeId: job.storeId,
            productId: input.productId,
            locale,
          })
        : null;
      const provider = getTextProvider();
      const prompt =
        input.prompt ||
        `Génère une pub courte pour ${product?.name || input.productName || "notre produit"}. Ton: ${input.tone || "chaleureux, RDC-first"}.`;
      const result = await provider.generateText({
        prompt: product
          ? `${productFactsBlock(product)}\n\n${prompt}`
          : prompt,
        locale,
      });

      await prisma.aIJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          provider: result.provider,
          output: {
            headline: result.text.split("\n")[0]?.slice(0, 120),
            body: result.text,
            productId: product?.productId,
          },
          usageTokens: result.usageTokens,
          costMinor: credit.cost,
          finishedAt: new Date(),
        },
      });

      await prisma.adCreative.create({
        data: {
          storeId: job.storeId,
          type: "text",
          locale,
          headline: result.text.split("\n")[0]?.slice(0, 120),
          body: result.text,
          cta: "Acheter maintenant",
          aiJobId: job.id,
          status: "ready",
          strategy: input.strategy || "sales",
          productId: product?.productId,
          overlays: product
            ? {
                priceLabel: product.priceLabel,
                discountPercent: product.discountPercent,
              }
            : undefined,
        },
      });

      await incrementUsage(job.organizationId, {
        tokens: result.usageTokens,
        credits: credit.cost,
      });
    } else if (job.type === "ad_copy_pack") {
      const pack = await generateCopyPack({
        storeId: job.storeId,
        productId: input.productId,
        locale,
        prompt: input.prompt,
        strategies: input.strategies,
      });

      await prisma.aIJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          provider: pack.provider,
          output: { packs: pack.packs, productId: pack.product.productId },
          usageTokens: pack.usageTokens,
          costMinor: credit.cost,
          finishedAt: new Date(),
        },
      });

      for (const p of pack.packs) {
        await prisma.adCreative.create({
          data: {
            storeId: job.storeId,
            type: "text",
            locale,
            headline: p.title,
            body: `${p.description}\n\nWhatsApp: ${p.whatsappPromo}`,
            cta: p.cta,
            hashtags: p.hashtags,
            strategy: p.strategy,
            productId: pack.product.productId,
            overlays: {
              priceLabel: pack.product.priceLabel,
              discountPercent: pack.product.discountPercent,
            },
            aiJobId: job.id,
            status: "ready",
            metadata: { whatsappPromo: p.whatsappPromo },
          },
        });
      }

      await incrementUsage(job.organizationId, {
        tokens: pack.usageTokens,
        credits: credit.cost,
      });
    } else if (job.type === "ad_image" || job.type === "ad_visual") {
      const product = await loadProductAdContext({
        storeId: job.storeId,
        productId: input.productId,
        locale,
      });
      const provider = getImageProvider();
      const formats =
        job.type === "ad_visual"
          ? AD_FORMATS.filter(
              (f) =>
                !input.formats?.length || input.formats.includes(f.id),
            )
          : [AD_FORMATS[0]];

      const outputs: Array<{
        format: string;
        assetKey: string | null;
        imageUrl?: string;
        hasBase64: boolean;
      }> = [];
      let tokens = 0;
      const variantGroup =
        job.type === "ad_visual" ? `vis_${randomBytes(4).toString("hex")}` : null;

      for (const format of formats) {
        const overlayBits = product
          ? ` Overlay texte: prix ${product.priceLabel}${product.discountPercent ? `, promo -${product.discountPercent}%` : ""}, nom ${product.name}.`
          : "";
        const prompt =
          input.prompt ||
          `Creative publicitaire ecommerce Africa, format ${format.label}, produit: ${product?.name || input.productName || "produit"}, style photo réaliste.${overlayBits}`;
        const result = await provider.generateImage({
          prompt,
          size: format.size,
          overlays: product
            ? {
                priceLabel: product.priceLabel,
                discountPercent: product.discountPercent,
                productName: product.name,
              }
            : undefined,
        });
        tokens += result.usageTokens;
        const assetKey = result.imageBase64
          ? `org/${job.organizationId}/store/${job.storeId}/ads/${job.id}_${format.id}.png`
          : result.imageUrl || null;

        outputs.push({
          format: format.id,
          assetKey,
          imageUrl: result.imageUrl,
          hasBase64: Boolean(result.imageBase64),
        });

        await prisma.adCreative.create({
          data: {
            storeId: job.storeId,
            type: format.id.startsWith("banner") ? "banner" : "image",
            locale,
            headline: product?.name || input.productName || "Créatif AI",
            body: product
              ? `${product.priceLabel}${product.discountPercent ? ` (−${product.discountPercent}%)` : ""}`
              : undefined,
            cta: "Acheter",
            assetKey: assetKey || undefined,
            aiJobId: job.id,
            status: "ready",
            strategy: input.strategy || "sales",
            format: format.id,
            variantGroup: variantGroup || undefined,
            variantLabel: format.label,
            productId: product?.productId,
            overlays: product
              ? {
                  priceLabel: product.priceLabel,
                  discountPercent: product.discountPercent,
                  productName: product.name,
                }
              : undefined,
            metadata: { channel: format.channel, size: format.size },
          },
        });
      }

      await prisma.aIJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          provider: "openai",
          output: { variants: outputs, productId: product?.productId },
          usageTokens: tokens,
          costMinor: credit.cost,
          finishedAt: new Date(),
        },
      });

      await incrementUsage(job.organizationId, {
        tokens,
        images: formats.length,
        credits: credit.cost,
      });
    } else if (job.type === "ad_ab_variants") {
      const product = await loadProductAdContext({
        storeId: job.storeId,
        productId: input.productId,
        locale,
      });
      if (!product) {
        throw new Error("A/B variants exigent un productId catalogue réel");
      }
      const textProvider = getTextProvider();
      const imageProvider = getImageProvider();
      const count = Math.min(Math.max(input.abCount || 2, 2), 3);
      const variantGroup = `ab_${randomBytes(4).toString("hex")}`;
      let tokens = 0;
      const variants = [];

      for (let i = 0; i < count; i++) {
        const strategy = AD_STRATEGIES[i % AD_STRATEGIES.length];
        const copy = await textProvider.generateText({
          locale,
          system: `Copywriter A/B variant ${String.fromCharCode(65 + i)} stratégie ${strategy}. JSON: title, description, cta.`,
          prompt: `${productFactsBlock(product)}\nBrief: ${input.prompt || "promo"}\nVariante ${i + 1}`,
        });
        tokens += copy.usageTokens;
        const img = await imageProvider.generateImage({
          prompt: `Ad variant ${String.fromCharCode(65 + i)} for ${product.name}, ${product.priceLabel}, Africa ecommerce, clean product shot`,
          size: "1024x1024",
        });
        tokens += img.usageTokens;
        const assetKey = img.imageBase64
          ? `org/${job.organizationId}/store/${job.storeId}/ads/${job.id}_${i}.png`
          : img.imageUrl || null;

        const creative = await prisma.adCreative.create({
          data: {
            storeId: job.storeId,
            type: "image",
            locale,
            headline: copy.text.split("\n")[0]?.slice(0, 100) || product.name,
            body: copy.text.slice(0, 600),
            cta: "Commander",
            assetKey: assetKey || undefined,
            aiJobId: job.id,
            status: "ready",
            strategy,
            format: "ig_feed_1x1",
            variantGroup,
            variantLabel: `Variant ${String.fromCharCode(65 + i)}`,
            productId: product.productId,
            overlays: {
              priceLabel: product.priceLabel,
              discountPercent: product.discountPercent,
              productName: product.name,
            },
          },
        });
        variants.push({ id: creative.id, strategy, assetKey });
      }

      await prisma.aIJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          provider: "openai",
          output: { variantGroup, variants },
          usageTokens: tokens,
          costMinor: credit.cost,
          finishedAt: new Date(),
        },
      });
      await incrementUsage(job.organizationId, {
        tokens,
        images: count,
        credits: credit.cost,
      });
    } else if (job.type === "ad_video_script") {
      const product = await loadProductAdContext({
        storeId: job.storeId,
        productId: input.productId,
        locale,
      });
      if (!product) {
        throw new Error("Scripts vidéo exigent un productId catalogue réel");
      }
      const strategy = input.strategy || "sales";
      const durationSec = input.durationSec || 30;
      const aspectRatio = input.aspectRatio || "9:16";
      const pack = buildVideoScriptPack({
        product,
        strategy,
        durationSec,
        aspectRatio,
        locale,
      });

      let voiceover: Record<string, string> | null = null;
      let videoRender: Record<string, string> | null = null;
      if (input.includeVoiceover) {
        try {
          const vo = await synthesizeVoiceover({
            text: pack.voiceoverScript,
            locale,
          });
          voiceover = {
            status: vo.status,
            error: vo.error,
            provider: vo.provider,
          };
        } catch (err) {
          if (err instanceof MissingApiKeyError) {
            voiceover = { status: "unavailable", error: err.message };
          } else throw err;
        }
      }
      if (input.includeVideoRender) {
        try {
          const vr = await renderVideoPlaceholder({ script: pack });
          videoRender = { status: vr.status, error: vr.error };
        } catch (err) {
          if (err instanceof MissingApiKeyError) {
            videoRender = { status: "unavailable", error: err.message };
          } else throw err;
        }
      }

      await prisma.aIJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          provider: "script_engine",
          output: {
            pack,
            voiceover,
            videoRender,
          },
          usageTokens: 0,
          costMinor: credit.cost,
          finishedAt: new Date(),
        },
      });

      await prisma.adCreative.create({
        data: {
          storeId: job.storeId,
          type: "video",
          locale,
          headline: pack.hook,
          body: pack.scenes.map((s) => `${s.t}: ${s.line}`).join("\n"),
          cta: pack.cta,
          hashtags: pack.hashtags,
          strategy,
          format: `video_${aspectRatio.replace(":", "x")}_${durationSec}s`,
          productId: product.productId,
          overlays: {
            priceLabel: product.priceLabel,
            discountPercent: product.discountPercent,
            subtitles: pack.subtitleTrack,
          },
          metadata: {
            voiceoverScript: pack.voiceoverScript,
            aspectRatio,
            durationSec,
            voiceover,
            videoRender,
          },
          aiJobId: job.id,
          status: "ready",
        },
      });

      await incrementUsage(job.organizationId, {
        videos: 1,
        credits: credit.cost,
      });
    } else {
      throw new Error(`Unsupported AI job type: ${job.type}`);
    }

    logger.info("ai.job.succeeded", { jobId, storeId: job.storeId });
  } catch (err) {
    const message =
      err instanceof MissingApiKeyError || err instanceof CreditsExceededError
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

export { creditCostFor };
