import { prisma } from "@/lib/db";
import { ensureDefaultSegments } from "./customers";
import type { CustomerLifecycle } from "@prisma/client";

export type SegmentRules = {
  lifecycle?: CustomerLifecycle[];
  minOrders?: number;
  maxOrders?: number;
  consentWhatsApp?: boolean;
  consentEmail?: boolean;
  hasAbandonedCart?: boolean;
  minLoyalty?: number;
};

export async function listSegments(storeId: string) {
  await ensureDefaultSegments(storeId);
  return prisma.customerSegment.findMany({
    where: { storeId },
    orderBy: { key: "asc" },
  });
}

export async function evaluateSegment(
  storeId: string,
  segmentKey: string,
) {
  await ensureDefaultSegments(storeId);
  const segment = await prisma.customerSegment.findUnique({
    where: { storeId_key: { storeId, key: segmentKey } },
  });
  if (!segment) throw new Error(`Segment inconnu: ${segmentKey}`);

  const rules = segment.rules as SegmentRules;
  const customers = await prisma.customer.findMany({
    where: {
      storeId,
      deletedAt: null,
      ...(rules.lifecycle?.length
        ? { lifecycle: { in: rules.lifecycle } }
        : {}),
      ...(typeof rules.minOrders === "number"
        ? { orderCount: { gte: rules.minOrders } }
        : {}),
      ...(typeof rules.maxOrders === "number"
        ? { orderCount: { lte: rules.maxOrders } }
        : {}),
      ...(rules.consentWhatsApp === true
        ? { marketingConsentWhatsApp: true }
        : {}),
      ...(rules.consentEmail === true ? { marketingConsentEmail: true } : {}),
      ...(typeof rules.minLoyalty === "number"
        ? { loyaltyPoints: { gte: rules.minLoyalty } }
        : {}),
    },
    take: 500,
  });

  if (!rules.hasAbandonedCart) {
    return { segment, customers, count: customers.length };
  }

  const withCart = [];
  for (const c of customers) {
    const abandoned = await prisma.cart.count({
      where: {
        storeId,
        customerId: c.id,
        status: { in: ["open", "abandoned"] },
        items: { some: {} },
      },
    });
    if (abandoned > 0) withCart.push(c);
  }
  return { segment, customers: withCart, count: withCart.length };
}
