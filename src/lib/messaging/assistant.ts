import { prisma } from "@/lib/db";
import { getTextProvider } from "@/lib/ai";
import { MissingApiKeyError } from "@/lib/ai/types";
import { formatMoney, localized } from "@/lib/utils";
import { logger } from "@/lib/logger";

export type CatalogFact = {
  productId: string;
  name: string;
  slug: string;
  variantId: string;
  sku: string;
  priceMinor: number;
  currency: string;
  available: number;
};

/**
 * Load REAL catalog/stock facts for a store — never invent products/prices.
 */
export async function loadStoreCatalogFacts(
  storeId: string,
  locale = "fr",
): Promise<CatalogFact[]> {
  const products = await prisma.product.findMany({
    where: { storeId, status: "active", deletedAt: null },
    include: {
      variants: {
        where: { status: "active" },
        include: { inventory: true },
      },
    },
    take: 50,
  });

  const facts: CatalogFact[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      const available =
        (v.inventory?.quantityOnHand || 0) - (v.inventory?.quantityReserved || 0);
      facts.push({
        productId: p.id,
        name: localized(p.name, locale),
        slug: p.slug,
        variantId: v.id,
        sku: v.sku,
        priceMinor: Number(v.priceAmount),
        currency: v.currency,
        available: Math.max(0, available),
      });
    }
  }
  return facts;
}

export async function loadCustomerOrderFacts(
  storeId: string,
  customerId?: string | null,
) {
  if (!customerId) return [];
  const orders = await prisma.order.findMany({
    where: { storeId, customerId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      currency: true,
      createdAt: true,
    },
  });
  return orders.map((o) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: formatMoney(Number(o.totalAmount), o.currency),
    createdAt: o.createdAt.toISOString(),
  }));
}

function buildGroundedSystemPrompt(input: {
  storeName: string;
  facts: CatalogFact[];
  orders: Array<Record<string, string>>;
  locale: string;
}) {
  const catalogLines = input.facts.length
    ? input.facts
        .map(
          (f) =>
            `- ${f.name} (sku ${f.sku}): ${formatMoney(f.priceMinor, f.currency)} · stock ${f.available}`,
        )
        .join("\n")
    : "(aucun produit actif)";

  const orderLines = input.orders.length
    ? input.orders
        .map(
          (o) =>
            `- ${o.orderNumber}: ${o.status}/${o.paymentStatus} ${o.total}`,
        )
        .join("\n")
    : "(aucune commande client)";

  return `Tu es l'assistant commercial WhatsApp de la boutique « ${input.storeName} » (SmartCommerce AI, Africa/RDC).
Réponds en ${input.locale === "en" ? "anglais" : "français"}, ton clair et utile.

RÈGLES STRICTES:
1. Tu ne peux citer QUE les produits/prix/stocks listés ci-dessous — JAMAIS inventer un produit, un prix ou un stock.
2. Si l'info n'est pas dans le catalogue, dis clairement que tu ne l'as pas et propose un transfert humain.
3. Pour les commandes, utilise uniquement l'historique fourni.
4. Si le client demande un humain / conseiller, réponds que tu transfères et termine par [[HANDOFF]].
5. Pas de promesses de livraison ou de paiement non confirmées.

CATALOGUE RÉEL:
${catalogLines}

COMMANDES CLIENT (réelles):
${orderLines}`;
}

export type AssistantReply = {
  text: string;
  handoff: boolean;
  provider: string;
  usageTokens: number;
  groundedProductCount: number;
};

/**
 * AI sales assistant grounded on real DB catalog/orders.
 * Fail-closed without OPENAI_API_KEY — no invented catalog answers.
 */
export async function generateSalesAssistantReply(input: {
  storeId: string;
  conversationId: string;
  userMessage: string;
  locale?: string;
}): Promise<AssistantReply> {
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: input.storeId },
  });
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, storeId: input.storeId },
  });
  if (!conversation) throw new Error("Conversation introuvable");

  if (!conversation.aiEnabled || conversation.status === "human_handoff") {
    return {
      text: "Un conseiller humain s’occupe de cette conversation.",
      handoff: false,
      provider: "none",
      usageTokens: 0,
      groundedProductCount: 0,
    };
  }

  const locale = input.locale || "fr";
  const facts = await loadStoreCatalogFacts(input.storeId, locale);
  const orders = await loadCustomerOrderFacts(
    input.storeId,
    conversation.customerId,
  );

  const textProvider = getTextProvider();
  try {
    const result = await textProvider.generateText({
      prompt: input.userMessage,
      locale: locale === "en" ? "en" : "fr",
      system: buildGroundedSystemPrompt({
        storeName: store.name,
        facts,
        orders,
        locale,
      }),
    });

    const handoff = result.text.includes("[[HANDOFF]]");
    const cleaned = result.text.replace("[[HANDOFF]]", "").trim();

    return {
      text: cleaned,
      handoff,
      provider: result.provider,
      usageTokens: result.usageTokens,
      groundedProductCount: facts.length,
    };
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      logger.warn("assistant.fail_closed", {
        storeId: input.storeId,
        error: err.message,
      });
      return {
        text:
          "L’assistant IA est indisponible (clé OPENAI_API_KEY manquante). Un conseiller vous répondra dès que possible. " +
          (facts[0]
            ? `En attendant, produit en stock: ${facts[0].name} à ${formatMoney(facts[0].priceMinor, facts[0].currency)} (stock ${facts[0].available}).`
            : "Consultez le catalogue sur la boutique en ligne."),
        handoff: true,
        provider: "noop",
        usageTokens: 0,
        groundedProductCount: facts.length,
      };
    }
    throw err;
  }
}
