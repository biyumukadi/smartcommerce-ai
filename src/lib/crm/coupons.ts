import { prisma } from "@/lib/db";
import type { CouponType } from "@prisma/client";
import { randomBytes } from "crypto";

export async function createPersonalCoupon(input: {
  storeId: string;
  customerId: string;
  type?: CouponType;
  valueMinor: number;
  currency?: string;
  minOrderMinor?: number;
  code?: string;
  endsAt?: Date;
  segmentKey?: string;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, storeId: input.storeId },
  });
  if (!customer) throw new Error("Client introuvable");
  if (input.valueMinor <= 0) throw new Error("valueMinor invalide");

  const code =
    input.code?.toUpperCase() ||
    `PERS-${randomBytes(3).toString("hex").toUpperCase()}`;

  return prisma.coupon.create({
    data: {
      storeId: input.storeId,
      customerId: input.customerId,
      code,
      type: input.type || "percent",
      valueMinor: input.valueMinor,
      currency: input.currency,
      minOrderMinor: input.minOrderMinor,
      endsAt: input.endsAt,
      segmentKey: input.segmentKey,
      maxRedemptions: 1,
      status: "active",
    },
  });
}

export async function listCoupons(storeId: string, customerId?: string) {
  return prisma.coupon.findMany({
    where: {
      storeId,
      ...(customerId ? { customerId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
