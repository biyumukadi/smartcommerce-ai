import { prisma } from "@/lib/db";

export type AnalyticsPeriod = "day" | "week" | "month" | "custom";

export function periodRange(
  period: AnalyticsPeriod,
  from?: string,
  to?: string,
  now = new Date(),
) {
  if (period === "custom" && from && to) {
    return { start: new Date(from), end: new Date(to) };
  }
  const end = now;
  const start = new Date(now);
  if (period === "day") start.setUTCHours(0, 0, 0, 0);
  else if (period === "week") {
    start.setUTCDate(start.getUTCDate() - 7);
  } else {
    // month default
    start.setUTCDate(start.getUTCDate() - 30);
  }
  return { start, end };
}

function bucketKey(d: Date, period: AnalyticsPeriod) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (period === "day") return `${y}-${m}-${day}`;
  if (period === "week") {
    // ISO-ish week bucket by week start (UTC Monday)
    const tmp = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 1 - dayNum);
    return `W${tmp.toISOString().slice(0, 10)}`;
  }
  return `${y}-${m}`;
}

export async function buildStoreAnalytics(
  storeId: string,
  opts: {
    period?: AnalyticsPeriod;
    from?: string;
    to?: string;
  } = {},
) {
  const period = opts.period || "month";
  const { start, end } = periodRange(period, opts.from, opts.to);

  const [
    paidOrders,
    allOrdersInPeriod,
    products,
    attribution,
    campaigns,
    abandonedCarts,
    lowStock,
    customers,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        paymentStatus: "paid",
        createdAt: { gte: start, lte: end },
      },
      include: { items: true },
    }),
    prisma.order.count({
      where: { storeId, createdAt: { gte: start, lte: end } },
    }),
    prisma.product.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.attributionEvent.groupBy({
      by: ["source"],
      where: { storeId, createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    prisma.marketingCampaign.findMany({
      where: { storeId, createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        name: true,
        channel: true,
        status: true,
        budgetAmount: true,
        currency: true,
        performance: true,
      },
    }),
    prisma.cart.findMany({
      where: {
        storeId,
        status: { in: ["open", "abandoned"] },
        updatedAt: { gte: start, lte: end },
        items: { some: {} },
      },
      include: { items: true, customer: true },
      take: 50,
    }),
    prisma.inventory.findMany({
      where: {
        storeId,
        quantityOnHand: { lte: 5 },
      },
      include: {
        variant: { include: { product: true } },
      },
      take: 30,
    }),
    prisma.customer.count({ where: { storeId, deletedAt: null } }),
  ]);

  const revenueMinor = paidOrders.reduce(
    (s, o) => s + Number(o.totalAmount),
    0,
  );
  const paidCount = paidOrders.length;
  const aov = paidCount ? Math.round(revenueMinor / paidCount) : 0;
  const conversion =
    allOrdersInPeriod > 0
      ? Math.round((paidCount / allOrdersInPeriod) * 1000) / 10
      : 0;

  // Top products by qty sold
  const productQty = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const order of paidOrders) {
    for (const item of order.items) {
      const key = item.sku;
      const prev = productQty.get(key) || {
        name:
          typeof item.productName === "object" && item.productName
            ? String(
                (item.productName as { fr?: string; en?: string }).fr ||
                  (item.productName as { en?: string }).en ||
                  item.sku,
              )
            : item.sku,
        qty: 0,
        revenue: 0,
      };
      prev.qty += item.quantity;
      prev.revenue += Number(item.totalAmount);
      productQty.set(key, prev);
    }
  }
  const topProducts = [...productQty.entries()]
    .map(([sku, v]) => ({ sku, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // Revenue series
  const seriesMap = new Map<string, number>();
  for (const o of paidOrders) {
    const key = bucketKey(o.createdAt, period === "custom" ? "day" : period);
    seriesMap.set(key, (seriesMap.get(key) || 0) + Number(o.totalAmount));
  }
  const revenueSeries = [...seriesMap.entries()]
    .map(([bucket, amountMinor]) => ({ bucket, amountMinor }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  const adSpendMinor = campaigns.reduce(
    (s, c) => s + Number(c.budgetAmount || 0),
    0,
  );
  const roi =
    adSpendMinor > 0
      ? Math.round((revenueMinor / adSpendMinor) * 100) / 100
      : null;

  const channelAttribution = attribution.map((a) => ({
    source: a.source,
    events: a._count._all,
  }));

  // Ensure WhatsApp/IG/TikTok keys appear even at 0 for dashboard
  for (const src of ["whatsapp", "meta", "tiktok"] as const) {
    if (!channelAttribution.find((c) => c.source === src)) {
      channelAttribution.push({ source: src, events: 0 });
    }
  }

  return {
    period,
    range: { start: start.toISOString(), end: end.toISOString() },
    kpis: {
      revenueMinor,
      orders: allOrdersInPeriod,
      paidOrders: paidCount,
      aov,
      conversionPercent: conversion,
      customers,
      productCount: products.length,
      abandonedCarts: abandonedCarts.length,
      adSpendMinor,
      roi,
    },
    revenueSeries,
    topProducts,
    channelAttribution,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      status: c.status,
      budgetMinor: Number(c.budgetAmount || 0),
      currency: c.currency,
    })),
    lowStock: lowStock.map((inv) => ({
      variantId: inv.variantId,
      sku: inv.variant.sku,
      productName: inv.variant.product.name,
      onHand: inv.quantityOnHand,
      reserved: inv.quantityReserved,
    })),
    abandonedCarts: abandonedCarts.map((c) => ({
      id: c.id,
      customerId: c.customerId,
      customerName: c.customer?.name || null,
      itemCount: c.items.reduce((s, i) => s + i.quantity, 0),
      updatedAt: c.updatedAt.toISOString(),
      consented: Boolean(c.customer?.marketingConsentWhatsApp),
    })),
  };
}

export type StoreAnalytics = Awaited<ReturnType<typeof buildStoreAnalytics>>;
