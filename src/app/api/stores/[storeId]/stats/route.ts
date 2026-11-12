import { prisma } from "@/lib/db";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user.id, storeId, "stats:read");

    const [productCount, orderCount, paidOrders, lowStock] = await Promise.all([
      prisma.product.count({ where: { storeId, deletedAt: null } }),
      prisma.order.count({ where: { storeId } }),
      prisma.order.findMany({
        where: { storeId, paymentStatus: "paid" },
        select: { totalAmount: true, currency: true },
      }),
      prisma.inventory.count({
        where: {
          storeId,
          quantityOnHand: { lte: 5 },
        },
      }),
    ]);

    const revenueByCurrency: Record<string, number> = {};
    for (const o of paidOrders) {
      revenueByCurrency[o.currency] =
        (revenueByCurrency[o.currency] || 0) + Number(o.totalAmount);
    }

    return jsonOk(
      {
        productCount,
        orderCount,
        paidOrderCount: paidOrders.length,
        revenueByCurrency,
        lowStockCount: lowStock,
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
