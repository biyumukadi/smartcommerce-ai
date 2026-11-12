import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { encryptCredentials, decryptCredentials } from "@/lib/crypto/credentials";
import { getSocialProvider } from "./registry";
import type { SocialPlatform } from "./types";
import { logger } from "@/lib/logger";

export function createOAuthState(storeId: string, platform: SocialPlatform) {
  const nonce = randomBytes(16).toString("hex");
  return Buffer.from(JSON.stringify({ storeId, platform, nonce, ts: Date.now() })).toString(
    "base64url",
  );
}

export function parseOAuthState(state: string): {
  storeId: string;
  platform: SocialPlatform;
  nonce: string;
} {
  const raw = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
    storeId: string;
    platform: SocialPlatform;
    nonce: string;
  };
  if (!raw.storeId || (raw.platform !== "meta" && raw.platform !== "tiktok")) {
    throw new Error("OAuth state invalide");
  }
  return raw;
}

export async function startSocialOAuth(input: {
  storeId: string;
  platform: SocialPlatform;
  appUrl?: string;
}) {
  const provider = getSocialProvider(input.platform);
  const appUrl = input.appUrl || process.env.APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/social/${input.platform}/callback`;
  const state = createOAuthState(input.storeId, input.platform);
  const result = provider.getOAuthUrl({
    storeId: input.storeId,
    redirectUri,
    state,
  });
  return { ...result, redirectUri, provider: provider.describe() };
}

export async function completeSocialOAuth(input: {
  platform: SocialPlatform;
  code: string;
  state: string;
  appUrl?: string;
}) {
  const parsed = parseOAuthState(input.state);
  if (parsed.platform !== input.platform) {
    throw new Error("Platform mismatch in OAuth state");
  }
  const provider = getSocialProvider(input.platform);
  const appUrl = input.appUrl || process.env.APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/social/${input.platform}/callback`;
  const tokens = await provider.exchangeCode({
    code: input.code,
    redirectUri,
  });

  const encrypted = encryptCredentials(
    JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
    }),
  );

  const connection = await prisma.socialConnection.upsert({
    where: {
      storeId_provider_externalAccountId: {
        storeId: parsed.storeId,
        provider: input.platform,
        externalAccountId: tokens.externalAccountId,
      },
    },
    update: {
      encryptedCredentials: encrypted,
      scopes: tokens.scopes,
      status: "connected",
      accountLabel: tokens.accountLabel,
      connectedAt: new Date(),
      expiresAt: tokens.expiresAt,
      metadata: (tokens.metadata || {}) as object,
    },
    create: {
      storeId: parsed.storeId,
      provider: input.platform,
      externalAccountId: tokens.externalAccountId,
      encryptedCredentials: encrypted,
      scopes: tokens.scopes,
      status: "connected",
      accountLabel: tokens.accountLabel,
      connectedAt: new Date(),
      expiresAt: tokens.expiresAt,
      metadata: (tokens.metadata || {}) as object,
    },
  });

  logger.info("social.oauth_connected", {
    storeId: parsed.storeId,
    platform: input.platform,
    connectionId: connection.id,
  });

  return connection;
}

export async function listStoreConnections(storeId: string) {
  return prisma.socialConnection.findMany({
    where: { storeId, provider: { in: ["meta", "tiktok"] } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getConnectionAccessToken(
  storeId: string,
  platform: SocialPlatform,
): Promise<{ token: string; connectionId: string } | null> {
  const connection = await prisma.socialConnection.findFirst({
    where: {
      storeId,
      provider: platform,
      status: { in: ["connected", "needs_approval"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!connection) return null;
  try {
    const payload = JSON.parse(
      decryptCredentials(connection.encryptedCredentials),
    ) as { accessToken?: string };
    if (!payload.accessToken) return null;
    return { token: payload.accessToken, connectionId: connection.id };
  } catch {
    return null;
  }
}

export function listPermissionsUi() {
  return {
    meta: [
      { key: "pages_manage_posts", labelFr: "Publier sur Pages Facebook" },
      { key: "instagram_content_publish", labelFr: "Publier sur Instagram" },
      { key: "instagram_manage_comments", labelFr: "Gérer commentaires IG" },
      { key: "catalog_management", labelFr: "Catalogue produits Meta" },
      { key: "ads_management", labelFr: "Gérer campagnes Ads (spend confirmé)" },
      { key: "business_management", labelFr: "Business Manager" },
    ],
    tiktok: [
      { key: "video.publish", labelFr: "Publier vidéos verticales" },
      { key: "ads.write", labelFr: "TikTok Ads (si éligible)" },
    ],
  };
}
