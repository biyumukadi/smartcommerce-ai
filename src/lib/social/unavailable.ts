import type {
  AdsCampaignDraft,
  AdsLaunchResult,
  CatalogSyncResult,
  OAuthStartResult,
  OAuthTokenSet,
  ProviderAvailability,
  PublishPostInput,
  PublishResult,
  SocialPlatform,
  SocialProvider,
} from "./types";

export class UnavailableSocialProvider implements SocialProvider {
  mode = "unavailable" as const;

  constructor(
    public id: SocialPlatform,
    private reasonFr: string,
    private notesFr: string,
  ) {}

  describe(): ProviderAvailability {
    return {
      id: this.id,
      mode: this.mode,
      available: false,
      oauthReady: false,
      catalogApi: false,
      publishOrganic: false,
      adsApi: false,
      commentsApi: false,
      requiresApproval: true,
      permissions: [],
      reason: this.reasonFr,
      notesFr: this.notesFr,
    };
  }

  getOAuthUrl(): OAuthStartResult {
    return { status: "unavailable", error: this.reasonFr };
  }

  async exchangeCode(): Promise<OAuthTokenSet> {
    throw new Error(this.reasonFr);
  }

  async syncCatalog(): Promise<CatalogSyncResult> {
    return {
      status: "unavailable",
      itemCount: 0,
      error: this.reasonFr,
    };
  }

  async publishPost(_input: PublishPostInput): Promise<PublishResult> {
    return { status: "unavailable", error: this.reasonFr };
  }

  async fetchEngagement() {
    return { comments: [], error: this.reasonFr };
  }

  async launchAdsCampaign(input: {
    draft: AdsCampaignDraft;
    confirmSpend: boolean;
  }): Promise<AdsLaunchResult> {
    if (!input.confirmSpend) {
      return {
        status: "needs_confirmation",
        error: "Confirmation de dépense requise — aucun spend effectué.",
      };
    }
    return { status: "unavailable", error: this.reasonFr };
  }
}
