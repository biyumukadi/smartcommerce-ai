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

const GRAPH = "https://graph.facebook.com/v21.0";

const META_SCOPES: SocialPermission[] = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "catalog_management",
  "ads_management",
  "business_management",
];

/**
 * Meta (Facebook / Instagram) Marketing + Graph adapter.
 * Live only with META_APP_ID + META_APP_SECRET (+ user token after OAuth).
 */
export class MetaSocialProvider implements SocialProvider {
  id = "meta" as const;
  mode = "sandbox" as const;

  constructor(
    private appId = process.env.META_APP_ID || "",
    private appSecret = process.env.META_APP_SECRET || "",
  ) {}

  describe(): ProviderAvailability {
    const oauthReady = Boolean(this.appId && this.appSecret);
    return {
      id: this.id,
      mode: this.mode,
      available: oauthReady,
      oauthReady,
      catalogApi: oauthReady,
      publishOrganic: oauthReady,
      adsApi: oauthReady,
      commentsApi: oauthReady,
      requiresApproval: true,
      permissions: META_SCOPES,
      notesFr:
        "Meta OAuth pour pages FB / comptes IG pro. Catalogue, posts, commentaires et Ads nécessitent permissions + Business Verification. Spend Ads uniquement après confirmation explicite marchand.",
    };
  }

  getOAuthUrl(input: {
    storeId: string;
    redirectUri: string;
    state: string;
  }): OAuthStartResult {
    if (!this.appId || !this.appSecret) {
      return {
        status: "unavailable",
        error:
          "META_APP_ID / META_APP_SECRET manquants — OAuth Meta indisponible.",
      };
    }
    const scope = META_SCOPES.join(",");
    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", this.appId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("state", input.state);
    url.searchParams.set("scope", scope);
    url.searchParams.set("response_type", "code");
    return { status: "redirect", url: url.toString(), state: input.state };
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenSet> {
    if (!this.appId || !this.appSecret) {
      throw new Error("META_APP_ID / META_APP_SECRET manquants");
    }
    const url = new URL(`${GRAPH}/oauth/access_token`);
    url.searchParams.set("client_id", this.appId);
    url.searchParams.set("client_secret", this.appSecret);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("code", input.code);

    const res = await fetch(url);
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!res.ok || !data.access_token) {
      throw new Error(data.error?.message || "Échange code Meta échoué");
    }

    const meRes = await fetch(
      `${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(data.access_token)}`,
    );
    const me = (await meRes.json()) as { id?: string; name?: string };

    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      scopes: [...META_SCOPES],
      externalAccountId: me.id || `meta_${Date.now()}`,
      accountLabel: me.name || "Meta account",
      metadata: { platform: "meta" },
    };
  }

  async syncCatalog(input: {
    storeId: string;
    accessToken: string;
    items: Array<Record<string, unknown>>;
  }): Promise<CatalogSyncResult> {
    // Attempt Catalog API batch; on failure return manual export payload (honest)
    const catalogId = process.env.META_CATALOG_ID;
    if (!catalogId) {
      return {
        status: "exported",
        itemCount: input.items.length,
        exportPayload: {
          format: "meta_catalog_manual_csv_json",
          notice:
            "META_CATALOG_ID absent — export manuel prêt (pas de sync API).",
          items: input.items,
        },
        error: "META_CATALOG_ID missing — manual export only",
      };
    }

    const res = await fetch(`${GRAPH}/${catalogId}/items_batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item_type: "PRODUCT_ITEM",
        requests: input.items.slice(0, 100).map((item) => ({
          method: "CREATE",
          data: item,
        })),
      }),
    });
    const data = (await res.json()) as {
      handles?: string[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        status: "exported",
        itemCount: input.items.length,
        exportPayload: { items: input.items },
        error:
          data.error?.message ||
          "Catalog API indisponible — export manuel fourni (pas de faux sync).",
      };
    }
    return {
      status: "synced",
      itemCount: input.items.length,
      externalRef: data.handles?.[0],
      exportPayload: data,
    };
  }

  async publishPost(
    input: PublishPostInput & { accessToken: string },
  ): Promise<PublishResult> {
    if (!input.confirmPublish) {
      return {
        status: "draft",
        error: "Publication non confirmée — brouillon uniquement.",
      };
    }
    if (input.scheduledAt && input.scheduledAt.getTime() > Date.now()) {
      // Graph supports scheduled posts on Pages when permitted; without page id → needs_approval
      if (!process.env.META_PAGE_ID) {
        return {
          status: "needs_approval",
          error:
            "Planification: META_PAGE_ID requis. Post conservé en scheduled localement.",
        };
      }
    }

    const pageId = process.env.META_PAGE_ID;
    if (!pageId) {
      return {
        status: "needs_approval",
        error:
          "META_PAGE_ID manquant — impossible de publier. Aucun succès fictif.",
      };
    }

    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: [input.caption, ...(input.hashtags || []).map((h) => `#${h.replace(/^#/, "")}`)].join(" "),
        published: !input.scheduledAt,
        scheduled_publish_time: input.scheduledAt
          ? Math.floor(input.scheduledAt.getTime() / 1000)
          : undefined,
      }),
    });
    const data = (await res.json()) as {
      id?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.id) {
      return {
        status: "failed",
        error: data.error?.message || "Publication Meta échouée",
        raw: data,
      };
    }
    return {
      status: input.scheduledAt ? "scheduled" : "published",
      externalPostId: data.id,
      raw: data,
    };
  }

  async fetchEngagement(input: {
    accessToken: string;
    externalPostId: string;
  }) {
    const res = await fetch(
      `${GRAPH}/${input.externalPostId}/comments?access_token=${encodeURIComponent(input.accessToken)}`,
    );
    const data = (await res.json()) as {
      data?: unknown[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        comments: [],
        error:
          data.error?.message ||
          "Lecture commentaires refusée (permissions pages_read_engagement / IG).",
      };
    }
    return { comments: data.data || [] };
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
        error:
          "Aucune dépense Ads sans confirmation explicite (confirmSpend=true).",
      };
    }
    const adAccountId = process.env.META_AD_ACCOUNT_ID;
    if (!adAccountId) {
      return {
        status: "unavailable",
        error:
          "META_AD_ACCOUNT_ID manquant — campagne Ads non soumise (scaffolding only).",
      };
    }

    const res = await fetch(`${GRAPH}/act_${adAccountId.replace(/^act_/, "")}/campaigns`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.draft.name,
        objective: input.draft.objective || "OUTCOME_TRAFFIC",
        status: "PAUSED", // never auto-activate spend
        special_ad_categories: [],
      }),
    });
    const data = (await res.json()) as {
      id?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.id) {
      return {
        status: "failed",
        error: data.error?.message || "Création campagne Meta échouée",
        raw: data,
      };
    }
    return {
      status: "submitted",
      externalCampaignId: data.id,
      raw: {
        ...data,
        notice: "Campagne créée en PAUSED — activation budget manuelle requise.",
        budgetMinor: input.draft.budgetMinor,
        currency: input.draft.currency,
      },
    };
  }
}
