import { prisma } from "@/lib/db";
import type { CustomerLifecycle } from "@prisma/client";

/** Recompute order aggregates + lifecycle + segment keys for one customer. */
export async function refreshCustomerStats(
  storeId: string,
  customerId: string,
) {
  const paid = await prisma.order.findMany({
    where: {
      storeId,
      customerId,
      paymentStatus: "paid",
    },
    select: { totalAmount: true, placedAt: true, createdAt: true },
  });

  const orderCount = paid.length;
  const totalSpentMinor = paid.reduce((s, o) => s + Number(o.totalAmount), 0);
  const lastOrderAt = paid
    .map((o) => o.placedAt || o.createdAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  let lifecycle: CustomerLifecycle = "prospect";
  if (orderCount === 0) lifecycle = "prospect";
  else if (orderCount >= 5 || totalSpentMinor >= 20000) lifecycle = "vip";
  else if (lastOrderAt) {
    const days =
      (Date.now() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24);
    if (days > 90) lifecycle = "inactive";
    else if (days > 45) lifecycle = "churn_risk";
    else lifecycle = "active";
  }

  const abandoned = await prisma.cart.count({
    where: {
      storeId,
      customerId,
      status: { in: ["open", "abandoned"] },
      items: { some: {} },
    },
  });

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
  });
  if (!customer) return null;

  const segmentKeys = new Set<string>(customer.segmentKeys);
  if (orderCount === 0) segmentKeys.add("prospects");
  else segmentKeys.delete("prospects");
  if (lifecycle === "vip") segmentKeys.add("vip");
  else segmentKeys.delete("vip");
  if (customer.marketingConsentWhatsApp) segmentKeys.add("consent_whatsapp");
  else segmentKeys.delete("consent_whatsapp");
  if (abandoned > 0) segmentKeys.add("abandoned");
  else segmentKeys.delete("abandoned");

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      orderCount,
      totalSpentMinor,
      lastOrderAt: lastOrderAt || null,
      lifecycle,
      segmentKeys: [...segmentKeys],
    },
  });
}

export async function refreshStoreCustomerStats(storeId: string) {
  const customers = await prisma.customer.findMany({
    where: { storeId, deletedAt: null },
    select: { id: true },
    take: 500,
  });
  for (const c of customers) {
    await refreshCustomerStats(storeId, c.id);
  }
  return { refreshed: customers.length };
}
