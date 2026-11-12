import { prisma } from "@/lib/db";
import { getSocialProvider, prepareTikTokPromo } from "./index";
import { getConnectionAccessToken } from "./connections";
import type { SocialPlatform } from "./types";
import { logger } from "@/lib/logger";

export async function createSocialPostDraft(input: {
  storeId: string;
  platform: SocialPlatform;
  caption?: string;
  mediaUrls?: string[];
  hashtags?: string[];
  script?: string;
  scheduledAt?: Date;
  productName?: string;
  priceLabel?: string;
  storeName?: string;
  createdById?: string;
  /** Attempt live publish — requires confirmPublish true AND credentials */
  confirmPublish?: boolean;
}) {
  let script = input.script;
  let hashtags = input.hashtags || [];
  let caption = input.caption || "";

  if (input.platform === "tiktok" && input.productName) {
    const prep = prepareTikTokPromo({
      productName: input.productName,
      priceLabel: input.priceLabel || "",
      storeName: input.storeName || "Boutique",
    });
    script = script || prep.script;
    hashtags = hashtags.length ? hashtags : prep.hashtags;
    if (!caption) caption = `${input.productName} — ${input.priceLabel || ""}`.trim();
  }

  const post = await prisma.socialPost.create({
    data: {
      storeId: input.storeId,
      provider: input.platform,
      caption,
      mediaUrls: input.mediaUrls || [],
      hashtags,
      script,
      scheduledAt: input.scheduledAt,
      status: input.scheduledAt ? "scheduled" : "draft",
      createdById: input.createdById,
      metadata: { confirmPublishRequested: Boolean(input.confirmPublish) },
    },
  });

  if (!input.confirmPublish) {
    return {
      post,
      publish: {
        status: "draft" as const,
        error: "Brouillon créé — confirmez la publication pour envoyer à Meta/TikTok.",
      },
    };
  }

  const provider = getSocialProvider(input.platform);
  const auth = await getConnectionAccessToken(input.storeId, input.platform);
  if (!auth) {
    const updated = await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: "unavailable",
        error: `Connexion ${input.platform} absente — publication impossible.`,
      },
    });
    return {
      post: updated,
      publish: {
        status: "unavailable" as const,
        error: updated.error || undefined,
      },
    };
  }

  await prisma.socialPost.update({
    where: { id: post.id },
    data: { status: "publishing" },
  });

  const result = await provider.publishPost({
    storeId: input.storeId,
    caption,
    mediaUrls: input.mediaUrls,
    hashtags,
    script,
    scheduledAt: input.scheduledAt,
    confirmPublish: true,
    accessToken: auth.token,
  });

  const status =
    result.status === "published"
      ? "published"
      : result.status === "scheduled"
        ? "scheduled"
        : result.status === "needs_approval"
          ? "needs_approval"
          : result.status === "unavailable"
            ? "unavailable"
            : result.status === "draft"
              ? "draft"
              : "failed";

  const updated = await prisma.socialPost.update({
    where: { id: post.id },
    data: {
      status,
      externalPostId: result.externalPostId,
      error: result.error,
      metadata: { result: result.raw || null },
    },
  });

  logger.info("social.post_publish_attempt", {
    storeId: input.storeId,
    platform: input.platform,
    postId: post.id,
    status,
  });

  return { post: updated, publish: result };
}

export async function listSocialPosts(storeId: string) {
  return prisma.socialPost.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function fetchPostComments(input: {
  storeId: string;
  postId: string;
}) {
  const post = await prisma.socialPost.findFirst({
    where: { id: input.postId, storeId: input.storeId },
  });
  if (!post) throw new Error("Post introuvable");
  if (!post.externalPostId) {
    return {
      comments: [],
      error: "Pas d’ID externe — commentaires indisponibles",
    };
  }
  if (post.provider !== "meta") {
    return {
      comments: [],
      error: "Gestion commentaires Phase 5 limitée à Meta (permissions IG/FB).",
    };
  }
  const auth = await getConnectionAccessToken(input.storeId, "meta");
  if (!auth) {
    return { comments: [], error: "Connexion Meta absente" };
  }
  const provider = getSocialProvider("meta");
  if (!provider.fetchEngagement) {
    return { comments: [], error: "Engagement API non supportée" };
  }
  return provider.fetchEngagement({
    accessToken: auth.token,
    externalPostId: post.externalPostId,
  });
}
