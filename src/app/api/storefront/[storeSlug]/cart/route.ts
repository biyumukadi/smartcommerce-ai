import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { nanoid } from "nanoid";

type Params = { params: Promise<{ storeSlug: string }> };

async function getStore(storeSlug: string) {
  return prisma.store.findFirst({
    where: { slug: storeSlug, status: "live", deletedAt: null },
  });
}

async function getOrCreateCart(storeId: string, currency: string) {
  const jar = await cookies();
  let sessionId = jar.get("sc_cart")?.value;
  if (!sessionId) {
    sessionId = nanoid(24);
    jar.set("sc_cart", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  }

  let cart = await prisma.cart.findFirst({
    where: { storeId, sessionId, status: "open" },
    include: {
      items: {
        include: {
          variant: { include: { product: true, inventory: true } },
        },
      },
    },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: {
        storeId,
        sessionId,
        currency,
        status: "open",
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      include: {
        items: {
          include: {
            variant: { include: { product: true, inventory: true } },
          },
        },
      },
    });
  }

  return cart;
}

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeSlug } = await params;
  try {
    const store = await getStore(storeSlug);
    if (!store) throw new Error("Boutique introuvable");
    const cart = await getOrCreateCart(store.id, store.currency);
    return jsonOk({ cart }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}

const addSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().max(99).default(1),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeSlug } = await params;
  try {
    const store = await getStore(storeSlug);
    if (!store) throw new Error("Boutique introuvable");
    const body = addSchema.parse(await req.json());

    const variant = await prisma.productVariant.findFirst({
      where: {
        id: body.variantId,
        storeId: store.id,
        status: "active",
      },
      include: { inventory: true },
    });
    if (!variant) throw new Error("Variante introuvable");

    const available =
      (variant.inventory?.quantityOnHand || 0) -
      (variant.inventory?.quantityReserved || 0);
    if (available < body.quantity) {
      throw new Error("Stock insuffisant");
    }

    const cart = await getOrCreateCart(store.id, store.currency);
    const existing = cart.items.find((i) => i.variantId === body.variantId);
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + body.quantity },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: variant.id,
          quantity: body.quantity,
          unitPriceAmount: variant.priceAmount,
          currency: variant.currency,
        },
      });
    }

    const updated = await prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            variant: { include: { product: true, inventory: true } },
          },
        },
      },
    });

    return jsonOk({ cart: updated }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
