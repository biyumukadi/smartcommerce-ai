import { MetaSocialProvider } from "./meta-provider";
import { TikTokSocialProvider } from "./tiktok-provider";
import { UnavailableSocialProvider } from "./unavailable";
import type { ProviderAvailability, SocialPlatform, SocialProvider } from "./types";

export function getSocialProvider(platform: SocialPlatform): SocialProvider {
  if (platform === "meta") {
    if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
      return new MetaSocialProvider();
    }
    return new UnavailableSocialProvider(
      "meta",
      "Meta indisponible: META_APP_ID / META_APP_SECRET manquants. Aucune publication/Ads fictive.",
      "Configurer l’app Meta + OAuth. Production: Business Verification, permissions IG/FB, Ads account.",
    );
  }

  if (process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET) {
    return new TikTokSocialProvider();
  }
  return new UnavailableSocialProvider(
    "tiktok",
    "TikTok indisponible: TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET manquants. Aucune publication fictive.",
    "App TikTok for Business + audit souvent requis. Ads seulement si TIKTOK_ADS_ELIGIBLE=true.",
  );
}

export function listSocialCatalog(): ProviderAvailability[] {
  return [getSocialProvider("meta").describe(), getSocialProvider("tiktok").describe()];
}
