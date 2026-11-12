import { prisma } from "@/lib/db";
import type { LoyaltyTxnType } from "@prisma/client";

export async function adjustLoyalty(input: {
  storeId: string;
  customerId: string;
  type: LoyaltyTxnType;
  points: number;
  reason?: string;
  orderId?: string;
}) {
  if (!Number.isInteger(input.points) || input.points === 0) {
    throw new Error("points doit être un entier non nul");
  }
  const delta =
    input.type === "redeem" || input.type === "expire"
      ? -Math.abs(input.points)
      : input.type === "adjust"
        ? input.points
        : Math.abs(input.points);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, storeId: input.storeId },
    });
    if (!customer) throw new Error("Client introuvable");
    const next = customer.loyaltyPoints + delta;
    if (next < 0) throw new Error("Solde fidélité insuffisant");

    const updated = await tx.customer.update({
      where: { id: customer.id },
      data: { loyaltyPoints: next },
    });

    const ledger = await tx.loyaltyLedger.create({
      data: {
        storeId: input.storeId,
        customerId: customer.id,
        type: input.type,
        points: delta,
        balanceAfter: next,
        reason: input.reason,
        orderId: input.orderId,
      },
    });

    return { customer: updated, ledger };
  });
}
