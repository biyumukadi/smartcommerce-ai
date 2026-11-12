import { getTextProvider } from "@/lib/ai/openai-factory";
import { MissingApiKeyError } from "@/lib/ai/types";
import type { StoreAnalytics } from "./stats";

/**
 * Analytical AI assistant — recommendations grounded ONLY in provided stats.
 * Fail-closed without LLM keys (no invented insights pretending to be live).
 */
export async function runAnalyticsAssistant(input: {
  analytics: StoreAnalytics;
  question?: string;
  locale?: "fr" | "en";
}) {
  const locale = input.locale || "fr";
  const facts = {
    period: input.analytics.period,
    range: input.analytics.range,
    kpis: input.analytics.kpis,
    topProducts: input.analytics.topProducts.slice(0, 5),
    channelAttribution: input.analytics.channelAttribution,
    lowStockSkus: input.analytics.lowStock.slice(0, 5).map((l) => l.sku),
    abandonedCarts: input.analytics.abandonedCarts.length,
    campaigns: input.analytics.campaigns.slice(0, 5),
  };

  const provider = getTextProvider();
  try {
    const system =
      locale === "en"
        ? `You are a commerce analyst. Use ONLY the JSON facts provided. Do not invent revenue, orders, products, or spend. If data is missing, say so. Reply with short actionable recommendations (max 6 bullets).`
        : `Tu es un analyste ecommerce. Utilise UNIQUEMENT les faits JSON fournis. N'invente ni CA, ni commandes, ni produits, ni dépenses. Si une donnée manque, dis-le. Réponds avec des recommandations actionnables (max 6 puces).`;

    const prompt = [
      `FAITS (JSON):\n${JSON.stringify(facts, null, 2)}`,
      input.question
        ? `Question marchand: ${input.question}`
        : locale === "en"
          ? "Give recommendations to improve revenue and reduce risk."
          : "Donne des recommandations pour améliorer le CA et réduire les risques.",
    ].join("\n\n");

    const result = await provider.generateText({
      prompt,
      locale,
      system,
    });

    return {
      status: "ok" as const,
      provider: result.provider,
      recommendations: result.text,
      groundedFacts: facts,
      usageTokens: result.usageTokens,
    };
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return {
        status: "unavailable" as const,
        provider: "noop",
        error: err.message,
        groundedFacts: facts,
        // Deterministic non-LLM fallback from real data only
        recommendations: buildHeuristicRecommendations(facts, locale),
        notice:
          locale === "en"
            ? "LLM key missing — heuristic tips from real KPIs only (not generative AI)."
            : "Clé LLM absente — conseils heuristiques basés uniquement sur les KPI réels (pas d’IA générative).",
      };
    }
    throw err;
  }
}

function buildHeuristicRecommendations(
  facts: {
    kpis: StoreAnalytics["kpis"];
    topProducts: StoreAnalytics["topProducts"];
    lowStockSkus: string[];
    abandonedCarts: number;
    channelAttribution: StoreAnalytics["channelAttribution"];
  },
  locale: "fr" | "en",
): string {
  const lines: string[] = [];
  const { kpis } = facts;
  if (locale === "en") {
    if (kpis.paidOrders === 0)
      lines.push("- No paid orders in period — check checkout and payment providers.");
    if (kpis.abandonedCarts > 0)
      lines.push(
        `- ${kpis.abandonedCarts} abandoned cart(s) — run consent-gated WhatsApp nudges only.`,
      );
    if (facts.lowStockSkus.length)
      lines.push(
        `- Low stock: ${facts.lowStockSkus.join(", ")} — restock before ads spend.`,
      );
    if (kpis.roi !== null && kpis.roi < 1)
      lines.push(
        `- Ad ROI ${kpis.roi}x (<1) — pause weak campaigns before increasing budget.`,
      );
    if (facts.topProducts[0])
      lines.push(
        `- Top SKU ${facts.topProducts[0].sku} (${facts.topProducts[0].qty} sold) — prioritize in creatives.`,
      );
    const wa = facts.channelAttribution.find((c) => c.source === "whatsapp");
    if (wa && wa.events === 0)
      lines.push("- No WhatsApp attribution events — verify UTM/consent tracking.");
    if (!lines.length)
      lines.push("- KPIs look stable — keep measuring AOV and conversion weekly.");
  } else {
    if (kpis.paidOrders === 0)
      lines.push(
        "- Aucune commande payée sur la période — vérifier checkout et providers paiement.",
      );
    if (kpis.abandonedCarts > 0)
      lines.push(
        `- ${kpis.abandonedCarts} panier(s) abandonné(s) — relances WhatsApp uniquement avec consentement.`,
      );
    if (facts.lowStockSkus.length)
      lines.push(
        `- Stock bas: ${facts.lowStockSkus.join(", ")} — réapprovisionner avant spend pubs.`,
      );
    if (kpis.roi !== null && kpis.roi < 1)
      lines.push(
        `- ROI pubs ${kpis.roi}x (<1) — pauser les campagnes faibles avant d’augmenter le budget.`,
      );
    if (facts.topProducts[0])
      lines.push(
        `- Top SKU ${facts.topProducts[0].sku} (${facts.topProducts[0].qty} vendus) — prioriser dans les créatifs.`,
      );
    const wa = facts.channelAttribution.find((c) => c.source === "whatsapp");
    if (wa && wa.events === 0)
      lines.push(
        "- Aucun événement d’attribution WhatsApp — vérifier UTM/consentement.",
      );
    if (!lines.length)
      lines.push(
        "- KPI stables — continuer à suivre AOV et conversion chaque semaine.",
      );
  }
  return lines.join("\n");
}
