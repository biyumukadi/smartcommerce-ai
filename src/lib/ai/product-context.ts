import { prisma } from "@/lib/db";
import { formatMoney, localized } from "@/lib/utils";

export type ProductAdContext = {
  productId: string;
  name: string;
  description: string;
  slug: string;
  variantId: string;
  sku: string;
  priceMinor: number;
  compareAtMinor: number | null;
  discountPercent: number | null;
  currency: string;
  priceLabel: string;
  available: number;
  storeName: string;
  storeCurrency: string;
};

export async function loadProductAdContext(input: {
  storeId: string;
  productId?: string;
  variantId?: string;
  locale?: string;
}): Promise<ProductAdContext | null> {
  const locale = input.locale || "fr";
  const store = await prisma.store.findUnique({ where: { id: input.storeId } });
  if (!store) return null;

  const product = await prisma.product.findFirst({
    where: {
      storeId: input.storeId,
      status: "active",
      deletedAt: null,
      ...(input.productId ? { id: input.productId } : {}),
    },
    include: {
      variants: {
        where: {
          status: "active",
          ...(input.variantId ? { id: input.variantId } : {}),
        },
        include: { inventory: true },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const variant = product?.variants[0];
  if (!product || !variant) return null;

  const priceMinor = Number(variant.priceAmount);
  const compareAt = variant.compareAtAmount
    ? Number(variant.compareAtAmount)
    : null;
  const discountPercent =
    compareAt && compareAt > priceMinor
      ? Math.round(((compareAt - priceMinor) / compareAt) * 100)
      : null;
  const available =
    (variant.inventory?.quantityOnHand || 0) -
    (variant.inventory?.quantityReserved || 0);

  return {
    productId: product.id,
    name: localized(product.name, locale),
    description: localized(product.description, locale),
    slug: product.slug,
    variantId: variant.id,
    sku: variant.sku,
    priceMinor,
    compareAtMinor: compareAt,
    discountPercent,
    currency: variant.currency,
    priceLabel: formatMoney(priceMinor, variant.currency),
    available: Math.max(0, available),
    storeName: store.name,
    storeCurrency: store.currency,
  };
}

export function productFactsBlock(ctx: ProductAdContext): string {
  return [
    `Produit: ${ctx.name} (sku ${ctx.sku})`,
    `Prix: ${ctx.priceLabel}${ctx.discountPercent ? ` (−${ctx.discountPercent}% vs ${formatMoney(ctx.compareAtMinor!, ctx.currency)})` : ""}`,
    `Stock dispo: ${ctx.available}`,
    `Boutique: ${ctx.storeName}`,
    ctx.description ? `Description: ${ctx.description.slice(0, 280)}` : "",
    "RÈGLE: n'invente pas de prix/stock/produit hors de ces faits.",
  ]
    .filter(Boolean)
    .join("\n");
}
