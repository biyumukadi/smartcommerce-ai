import type {
  AdsLaunchResult,
  CatalogSyncResult,
  OAuthStartResult,
  OAuthTokenSet,
  ProviderAvailability,
  PublishPostInput,
  PublishResult,
  SocialPermission,
  SocialProvider,
} from "./types";

const TIKTOK_SCOPES: SocialPermission[] = [
  "tiktok_video.publish",
  "tiktok_ads.write",
];

/**
 * TikTok for Business / Content Posting adapter.
 * Publish & Ads only when authorized; otherwise manual export / unavailable.
 */
export class TikTokSocialProvider implements SocialProvider {
  id = "tiktok" as const;
  mode = "sandbox" as const;

  constructor(
    private clientKey = process.env.TIKTOK_CLIENT_KEY || "",
    private clientSecret = process.env.TIKTOK_CLIENT_SECRET || "",
  ) {}

  describe(): ProviderAvailability {
    const oauthReady = Boolean(this.clientKey && this.clientSecret);
    const adsEligible = process.env.TIKTOK_ADS_ELIGIBLE === "true";
    return {
      id: this.id,
      mode: this.mode,
      available: oauthReady,
      oauthReady,
      catalogApi: false,
      publishOrganic: oauthReady,
      adsApi: oauthReady && adsEligible,
      commentsApi: false,
      requiresApproval: true,
      permissions: TIKTOK_SCOPES,
      notesFr:
        "TikTok Business OAuth. Publication vidéo uniquement si autorisée; Ads si TIKTOK_ADS_ELIGIBLE=true sinon export manuel. Audit TikTok souvent requis en prod.",
    };
  }

  getOAuthUrl(input: {
    storeId: string;
    redirectUri: string;
    state: string;
  }): OAuthStartResult {
    if (!this.clientKey || !this.clientSecret) {
      return {
        status: "unavailable",
        error:
          "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET manquants — OAuth TikTok indisponible.",
      };
    }
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", this.clientKey);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("state", input.state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "user.info.basic,video.publish");
    return { status: "redirect", url: url.toString(), state: input.state };
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenSet> {
    if (!this.clientKey || !this.clientSecret) {
      throw new Error("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET manquants");
    }
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      throw new Error(
        data.error_description || data.error || "Échange code TikTok échoué",
      );
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      scopes: (data.scope || "").split(",").filter(Boolean),
      externalAccountId: data.open_id || `tiktok_${Date.now()}`,
      accountLabel: "TikTok Business",
      metadata: { platform: "tiktok" },
    };
  }

  async syncCatalog(input: {
    items: Array<Record<string, unknown>>;
  }): Promise<CatalogSyncResult> {
    // TikTok product catalog often via separate commerce APIs — export manual
    return {
      status: "exported",
      itemCount: input.items.length,
      exportPayload: {
        format: "tiktok_catalog_manual",
        notice: "Pas de Catalog API TikTok générique ici — export manuel.",
        items: input.items,
      },
      error: "TikTok catalog API not wired — manual export only",
    };
  }

  async publishPost(
    input: PublishPostInput & { accessToken: string },
  ): Promise<PublishResult> {
    if (!input.confirmPublish) {
      return {
        status: "draft",
        error: "Publication non confirmée — vidéo/script en préparation locale.",
      };
    }
    if (!input.mediaUrls?.length) {
      return {
        status: "needs_approval",
        error:
          "Vidéo verticale requise pour publier. Préparez le média puis confirmez.",
      };
    }

    // Content Posting API — honest failure if not authorized
    const res = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_info: {
            title: input.caption?.slice(0, 150) || "SmartCommerce promo",
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: input.mediaUrls[0],
          },
        }),
      },
    );
    const data = (await res.json()) as {
      data?: { publish_id?: string };
      error?: { message?: string; code?: string };
    };
    if (!res.ok || !data.data?.publish_id) {
      return {
        status: "failed",
        error:
          data.error?.message ||
          "Publication TikTok refusée (scope/audit). Aucun succès fictif.",
        raw: data,
      };
    }
    return {
      status: "published",
      externalPostId: data.data.publish_id,
      raw: data,
    };
  }

  async launchAdsCampaign(input: {
    accessToken: string;
    draft: {
      name: string;
      budgetMinor: number;
      currency: string;
      objective?: string;
    };
    confirmSpend: boolean;
  }): Promise<AdsLaunchResult> {
    if (!input.confirmSpend) {
      return {
        status: "needs_confirmation",
        error: "Confirmation de dépense TikTok Ads requise — aucun spend.",
      };
    }
    if (process.env.TIKTOK_ADS_ELIGIBLE !== "true") {
      return {
        status: "unavailable",
        error:
          "Compte non éligible Ads (TIKTOK_ADS_ELIGIBLE≠true) — utilisez export manuel créatifs.",
        raw: {
          manualExport: {
            name: input.draft.name,
            budgetMinor: input.draft.budgetMinor,
            currency: input.draft.currency,
          },
        },
      };
    }
    // Minimal Ads API scaffolding — paused / honest failure path
    return {
      status: "failed",
      error:
        "TikTok Ads API write non configuré pour ce sandbox — export manuel fourni, pas de faux publish.",
      raw: {
        manualExport: input.draft,
        accessTokenPresent: Boolean(input.accessToken),
      },
    };
  }
}

/** Helper: prepare vertical promo script + hashtags without publishing */
export function prepareTikTokPromo(input: {
  productName: string;
  priceLabel: string;
  storeName: string;
  locale?: string;
}) {
  const fr = input.locale !== "en";
  const script = fr
    ? `Hook 3s: « ${input.productName} à ${input.priceLabel} »\nDémo produit 10s\nCTA: commande sur ${input.storeName} / WhatsApp`
    : `3s hook: "${input.productName} at ${input.priceLabel}"\n10s demo\nCTA: shop ${input.storeName}`;
  const hashtags = fr
    ? ["RDC", "Kinshasa", "Promo", "SmartCommerce", "MobileMoney"]
    : ["Promo", "SmartCommerce", "ShopLocal", "TikTokShop"];
  return { script, hashtags, aspectRatio: "9:16" as const };
}
