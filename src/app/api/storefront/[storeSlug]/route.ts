import { prisma } from "@/lib/db";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";

type Params = { params: Promise<{ storeSlug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeSlug } = await params;
  try {
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug, status: "live", deletedAt: null },
      include: {
        categories: { orderBy: { sortOrder: "asc" } },
        products: {
          where: { status: "active", deletedAt: null },
          include: {
            variants: {
              where: { status: "active" },
              include: { inventory: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!store) {
      return jsonError(new Error("Boutique introuvable"), { requestId: rid });
    }
    return jsonOk(
      {
        store: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          description: store.description,
          currency: store.currency,
          locales: store.locales,
          settings: store.settings,
        },
        categories: store.categories,
        products: store.products,
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
