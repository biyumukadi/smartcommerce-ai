import { getTextProvider } from "./openai-factory";
import {
  AD_STRATEGIES,
  STRATEGY_BRIEF,
  type AdStrategyKind,
} from "./strategies";
import {
  loadProductAdContext,
  productFactsBlock,
  type ProductAdContext,
} from "./product-context";

export type StrategyCopy = {
  strategy: AdStrategyKind;
  title: string;
  description: string;
  cta: string;
  hashtags: string[];
  whatsappPromo: string;
};

function parseJsonLoose(text: string): Partial<StrategyCopy> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Partial<StrategyCopy>;
  } catch {
    return null;
  }
}

export async function generateCopyPack(input: {
  storeId: string;
  productId?: string;
  locale: "fr" | "en";
  prompt?: string;
  strategies?: AdStrategyKind[];
}): Promise<{
  product: ProductAdContext;
  packs: StrategyCopy[];
  usageTokens: number;
  provider: string;
}> {
  const product = await loadProductAdContext({
    storeId: input.storeId,
    productId: input.productId,
    locale: input.locale,
  });
  if (!product) {
    throw new Error(
      "Produit introuvable — la génération product-aware exige un produit réel du catalogue.",
    );
  }

  const provider = getTextProvider();
  const strategies = input.strategies?.length
    ? input.strategies
    : AD_STRATEGIES;
  const packs: StrategyCopy[] = [];
  let usageTokens = 0;
  let providerId = provider.id;

  for (const strategy of strategies) {
    const brief = STRATEGY_BRIEF[strategy];
    const system = `Tu es copywriter ecommerce Africa/RDC. Réponds UNIQUEMENT en JSON valide.
Champs: title, description, cta, hashtags (array string), whatsappPromo.
Langue: ${input.locale}. Stratégie: ${strategy} — ${input.locale === "en" ? brief.en : brief.fr}.
N'invente pas de prix hors des faits produit.`;

    const userPrompt = [
      productFactsBlock(product),
      input.prompt ? `Brief marchand: ${input.prompt}` : "",
      "Génère le JSON maintenant.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await provider.generateText({
      prompt: userPrompt,
      locale: input.locale,
      system,
    });
    usageTokens += result.usageTokens;
    providerId = result.provider;

    const parsed = parseJsonLoose(result.text);
    packs.push({
      strategy,
      title:
        parsed?.title ||
        `${product.name} — ${product.priceLabel}`.slice(0, 80),
      description:
        parsed?.description ||
        result.text.slice(0, 500) ||
        product.description ||
        product.name,
      cta:
        parsed?.cta ||
        (input.locale === "en" ? brief.ctaEn : brief.ctaFr),
      hashtags:
        Array.isArray(parsed?.hashtags) && parsed.hashtags.length
          ? parsed.hashtags.map(String)
          : input.locale === "en"
            ? ["SmartCommerce", "Promo", "Shop"]
            : ["SmartCommerce", "Promo", "RDC"],
      whatsappPromo:
        parsed?.whatsappPromo ||
        (input.locale === "en"
          ? `Hi! Interested in ${product.name} at ${product.priceLabel}? Order via WhatsApp.`
          : `Bonjour ! ${product.name} à ${product.priceLabel}. Commandez via WhatsApp.`),
    });
  }

  return { product, packs, usageTokens, provider: providerId };
}
