import { prisma } from "@/lib/db";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user.id, storeId, "orders:read");
    const orders = await prisma.order.findMany({
      where: { storeId },
      include: {
        items: true,
        payments: true,
        customer: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return jsonOk({ orders }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
