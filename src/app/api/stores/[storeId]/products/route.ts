import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  ApiError,
  jsonError,
  jsonOk,
  requireSession,
  withRequestId,
} from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import { slugify } from "@/lib/utils";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user.id, storeId, "products:read");
    const products = await prisma.product.findMany({
      where: { storeId, deletedAt: null },
      include: {
        variants: { include: { inventory: true } },
        category: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    return jsonOk({ products }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const createSchema = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  descriptionFr: z.string().optional(),
  descriptionEn: z.string().optional(),
  sku: z.string().min(1),
  priceAmount: z.number().int().positive(),
  currency: z.enum(["USD", "CDF", "EUR"]),
  quantityOnHand: z.number().int().min(0).default(0),
  status: z.enum(["draft", "active", "archived"]).default("active"),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user.id, storeId, "products:write");
    const body = createSchema.parse(await req.json());
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });

    let slug = slugify(body.nameFr);
    let i = 1;
    while (
      await prisma.product.findUnique({
        where: { storeId_slug: { storeId, slug } },
      })
    ) {
      slug = `${slugify(body.nameFr)}-${i++}`;
    }

    const product = await prisma.product.create({
      data: {
        storeId,
        name: { fr: body.nameFr, en: body.nameEn || body.nameFr },
        description: {
          fr: body.descriptionFr || "",
          en: body.descriptionEn || body.descriptionFr || "",
        },
        slug,
        status: body.status,
        media: [],
        variants: {
          create: {
            storeId,
            sku: body.sku,
            name: { fr: "Standard", en: "Standard" },
            options: {},
            priceAmount: body.priceAmount,
            currency: body.currency || store.currency,
            status: "active",
            inventory: {
              create: {
                storeId,
                quantityOnHand: body.quantityOnHand,
                quantityReserved: 0,
                lowStockThreshold: 5,
              },
            },
          },
        },
      },
      include: { variants: { include: { inventory: true } } },
    });

    return jsonOk({ product }, { status: 201, requestId: rid });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return jsonError(new ApiError(409, "SKU déjà utilisé"), {
        requestId: rid,
        storeId,
      });
    }
    return jsonError(error, { requestId: rid, storeId });
  }
}
