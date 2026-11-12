/**
 * SaaS plan catalog — platform subscription fees only.
 * External Ads / WhatsApp / AI / payment transaction costs are tracked separately
 * in CostLedger (never conflated with plan price).
 */

export type PlanLimits = {
  stores: number;
  products: number;
  staff: number;
  aiCredits: number;
  campaigns: number;
  crm: boolean;
  social: boolean;
  analyticsAssistant: boolean;
  features: string[];
};

export type PlanDefinition = {
  code: string;
  name: { fr: string; en: string };
  /** Monthly SaaS fee in USD cents */
  priceAmount: number;
  currency: "USD";
  interval: "month";
  limits: PlanLimits;
};

export const SAAS_PLANS: PlanDefinition[] = [
  {
    code: "starter",
    name: { fr: "Starter", en: "Starter" },
    priceAmount: 1900,
    currency: "USD",
    interval: "month",
    limits: {
      stores: 1,
      products: 200,
      staff: 3,
      aiCredits: 200,
      campaigns: 10,
      crm: true,
      social: false,
      analyticsAssistant: false,
      features: ["catalogue", "orders", "payments_mock", "ai_ads_basic"],
    },
  },
  {
    code: "business",
    name: { fr: "Business", en: "Business" },
    priceAmount: 4900,
    currency: "USD",
    interval: "month",
    limits: {
      stores: 5,
      products: 5000,
      staff: 20,
      aiCredits: 1500,
      campaigns: 100,
      crm: true,
      social: true,
      analyticsAssistant: true,
      features: [
        "catalogue",
        "orders",
        "payments",
        "whatsapp",
        "crm",
        "social",
        "ai_ads",
      ],
    },
  },
  {
    code: "premium",
    name: { fr: "Premium", en: "Premium" },
    priceAmount: 9900,
    currency: "USD",
    interval: "month",
    limits: {
      stores: 25,
      products: 50000,
      staff: 100,
      aiCredits: 10000,
      campaigns: 1000,
      crm: true,
      social: true,
      analyticsAssistant: true,
      features: [
        "catalogue",
        "orders",
        "payments",
        "whatsapp",
        "crm",
        "social",
        "ai_ads",
        "priority_support",
        "super_limits",
      ],
    },
  },
];

export const TRIAL_LIMITS: PlanLimits = {
  stores: 3,
  products: 100,
  staff: 5,
  aiCredits: 50,
  campaigns: 5,
  crm: true,
  social: true,
  analyticsAssistant: true,
  features: ["trial_all"],
};

export function parsePlanLimits(raw: unknown): PlanLimits {
  if (!raw || typeof raw !== "object") return TRIAL_LIMITS;
  const o = raw as Record<string, unknown>;
  return {
    stores: Number(o.stores ?? TRIAL_LIMITS.stores),
    products: Number(o.products ?? TRIAL_LIMITS.products),
    staff: Number(o.staff ?? TRIAL_LIMITS.staff),
    aiCredits: Number(o.aiCredits ?? o.aiJobs ?? TRIAL_LIMITS.aiCredits),
    campaigns: Number(o.campaigns ?? TRIAL_LIMITS.campaigns),
    crm: o.crm !== false,
    social: Boolean(o.social),
    analyticsAssistant: Boolean(o.analyticsAssistant),
    features: Array.isArray(o.features)
      ? o.features.map(String)
      : TRIAL_LIMITS.features,
  };
}

/** Human-readable separation of cost categories */
export const COST_CATEGORIES = {
  saas_fee: "Abonnement plateforme SmartCommerce (SaaS)",
  ads_spend: "Dépenses pubs Meta/TikTok (externe)",
  whatsapp: "Coûts WhatsApp Cloud / templates (externe Meta)",
  ai_usage: "Usage AI providers OpenAI/etc. (externe)",
  payment_fees: "Frais transaction paiement (externe agrégateur)",
  other: "Autre",
} as const;

export type CostCategory = keyof typeof COST_CATEGORIES;
