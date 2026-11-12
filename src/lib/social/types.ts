export type SocialPlatform = "meta" | "tiktok";

export type SocialMode = "sandbox" | "mock" | "unavailable" | "production";

export type SocialPermission =
  | "pages_show_list"
  | "pages_manage_posts"
  | "pages_read_engagement"
  | "instagram_basic"
  | "instagram_content_publish"
  | "instagram_manage_comments"
  | "catalog_management"
  | "ads_management"
  | "business_management"
  | "tiktok_video.publish"
  | "tiktok_ads.write";

export type ProviderAvailability = {
  id: SocialPlatform;
  mode: SocialMode;
  available: boolean;
  oauthReady: boolean;
  catalogApi: boolean;
  publishOrganic: boolean;
  adsApi: boolean;
  commentsApi: boolean;
  requiresApproval: boolean;
  permissions: readonly SocialPermission[];
  reason?: string;
  notesFr: string;
};

export type OAuthStartResult = {
  status: "redirect" | "unavailable";
  url?: string;
  error?: string;
  state?: string;
};

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
  externalAccountId: string;
  accountLabel?: string;
  metadata?: Record<string, unknown>;
};

export type PublishPostInput = {
  storeId: string;
  caption: string;
  mediaUrls?: string[];
  hashtags?: string[];
  script?: string;
  scheduledAt?: Date;
  /** Must be true to attempt live publish — drafts allowed without */
  confirmPublish: boolean;
};

export type PublishResult = {
  status: "draft" | "scheduled" | "published" | "failed" | "unavailable" | "needs_approval";
  externalPostId?: string;
  error?: string;
  raw?: unknown;
};

export type CatalogSyncResult = {
  status: "synced" | "exported" | "unavailable" | "failed";
  itemCount: number;
  externalRef?: string;
  exportPayload?: unknown;
  error?: string;
};

export type AdsCampaignDraft = {
  name: string;
  budgetMinor: number;
  currency: string;
  objective?: string;
};

export type AdsLaunchResult = {
  status: "draft" | "needs_confirmation" | "submitted" | "failed" | "unavailable";
  externalCampaignId?: string;
  error?: string;
  raw?: unknown;
};

export interface SocialProvider {
  id: SocialPlatform;
  mode: SocialMode;
  describe(): ProviderAvailability;
  getOAuthUrl(input: {
    storeId: string;
    redirectUri: string;
    state: string;
  }): OAuthStartResult;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenSet>;
  syncCatalog(input: {
    storeId: string;
    accessToken: string;
    items: Array<Record<string, unknown>>;
  }): Promise<CatalogSyncResult>;
  publishPost(input: PublishPostInput & { accessToken: string }): Promise<PublishResult>;
  fetchEngagement?(input: {
    accessToken: string;
    externalPostId: string;
  }): Promise<{ comments: unknown[]; messages?: unknown[]; error?: string }>;
  launchAdsCampaign(input: {
    accessToken: string;
    draft: AdsCampaignDraft;
    /** Hard gate — never spend without this */
    confirmSpend: boolean;
  }): Promise<AdsLaunchResult>;
}
