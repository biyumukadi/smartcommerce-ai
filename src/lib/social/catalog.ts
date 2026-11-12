import { prisma } from "@/lib/db";
import { localized } from "@/lib/utils";
import { getSocialProvider } from "./registry";
import { getConnectionAccessToken } from "./connections";
import type { SocialPlatform } from "./types";

export async function buildCatalogItems(storeId: string, locale = "fr") {
  const products = await prisma.product.findMany({
    where: { storeId, status: "active", deletedAt: null },
    include: {
      variants: {
        where: { status: "active" },
        include: { inventory: true },
      },
    },
  });

  const items: Array<Record<string, unknown>> = [];
  for (const p of products) {
    for (const v of p.variants) {
      const available =
        (v.inventory?.quantityOnHand || 0) - (v.inventory?.quantityReserved || 0);
      items.push({
        id: v.id,
        title: localized(p.name, locale),
        description: localized(p.description, locale),
        availability: available > 0 ? "in stock" : "out of stock",
        condition: "new",
        price: `${(Number(v.priceAmount) / 100).toFixed(2)} ${v.currency}`,
        brand: "SmartCommerce",
        retailer_id: v.sku,
        quantity_to_sell_on_facebook: Math.max(0, available),
      });
    }
  }
  return items;
}

export async function syncOrExportCatalog(input: {
  storeId: string;
  platform: SocialPlatform;
}) {
  const provider = getSocialProvider(input.platform);
  const items = await buildCatalogItems(input.storeId);
  const auth = await getConnectionAccessToken(input.storeId, input.platform);

  const result = await provider.syncCatalog({
    storeId: input.storeId,
    accessToken: auth?.token || "",
    items,
  });

  const row = await prisma.catalogExport.create({
    data: {
      storeId: input.storeId,
      provider: input.platform,
      status:
        result.status === "synced"
          ? "synced"
          : result.status === "exported"
            ? "exported"
            : result.status === "unavailable"
              ? "unavailable"
              : "failed",
      itemCount: result.itemCount,
      exportPayload: (result.exportPayload || {}) as object,
      externalRef: result.externalRef,
      error: result.error,
    },
  });

  return { export: row, result, provider: provider.describe() };
}
