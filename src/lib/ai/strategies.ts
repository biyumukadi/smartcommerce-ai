export type AdStrategyKind = "sales" | "acquisition" | "brand";

export const AD_STRATEGIES: AdStrategyKind[] = ["sales", "acquisition", "brand"];

export const STRATEGY_BRIEF: Record<
  AdStrategyKind,
  { fr: string; en: string; ctaFr: string; ctaEn: string }
> = {
  sales: {
    fr: "Conversion immédiate: urgence, prix, Mobile Money, CTA commande WhatsApp.",
    en: "Immediate conversion: urgency, price, Mobile Money, WhatsApp order CTA.",
    ctaFr: "Commander maintenant",
    ctaEn: "Order now",
  },
  acquisition: {
    fr: "Acquisition: offre découverte, preuve sociale Kinshasa/RDC, premier achat.",
    en: "Acquisition: discovery offer, social proof, first purchase hook.",
    ctaFr: "Découvrir l'offre",
    ctaEn: "Discover the offer",
  },
  brand: {
    fr: "Image de marque: confiance, qualité, storytelling local Africa-first.",
    en: "Brand: trust, quality, local Africa-first storytelling.",
    ctaFr: "Nous connaître",
    ctaEn: "Learn more",
  },
};

export const AD_FORMATS = [
  { id: "ig_feed_1x1", label: "Instagram Feed 1:1", size: "1024x1024" as const, channel: "meta" },
  { id: "ig_story_9x16", label: "IG/FB Story 9:16", size: "1024x1792" as const, channel: "meta" },
  { id: "fb_feed", label: "Facebook Feed", size: "1024x1024" as const, channel: "meta" },
  { id: "wa_status", label: "WhatsApp Status 9:16", size: "1024x1792" as const, channel: "whatsapp" },
  { id: "tiktok_9x16", label: "TikTok 9:16", size: "1024x1792" as const, channel: "tiktok" },
  { id: "banner_16x9", label: "Banner 16:9", size: "1792x1024" as const, channel: "meta" },
] as const;

export type AdFormatId = (typeof AD_FORMATS)[number]["id"];

export const VIDEO_DURATIONS = [15, 30, 60] as const;
export const VIDEO_ASPECTS = ["9:16", "1:1", "16:9"] as const;

/** Credit costs per job type */
export const CREDIT_COSTS: Record<string, number> = {
  ad_copy: 2,
  product_description: 2,
  ad_copy_pack: 8,
  ad_image: 5,
  ad_visual: 12,
  ad_ab_variants: 15,
  ad_video_script: 6,
};
