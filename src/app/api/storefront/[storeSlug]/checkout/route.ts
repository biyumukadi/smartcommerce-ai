import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { createOrderFromCart } from "@/lib/commerce/orders";
import { createPaymentForOrder } from "@/lib/commerce/payments";

type Params = { params: Promise<{ storeSlug: string }> };

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  city: z.string().min(2),
  address: z.string().min(3),
  notes: z.string().optional(),
  method: z.enum(["card", "mobile_money", "bank", "other"]).default("mobile_money"),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeSlug } = await params;
  try {
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug, status: "live", deletedAt: null },
    });
    if (!store) throw new Error("Boutique introuvable");

    const jar = await cookies();
    const sessionId = jar.get("sc_cart")?.value;
    if (!sessionId) throw new Error("Panier introuvable");

    const cart = await prisma.cart.findFirst({
      where: { storeId: store.id, sessionId, status: "open" },
    });
    if (!cart) throw new Error("Panier introuvable");

    const body = schema.parse(await req.json());
    const order = await createOrderFromCart({
      storeId: store.id,
      cartId: cart.id,
      shippingAddress: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        city: body.city,
        address: body.address,
        country: "CD",
      },
      customer: {
        name: body.name,
        email: body.email,
        phone: body.phone,
      },
      notes: body.notes,
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const returnUrl = `${appUrl}/fr/s/${store.slug}/checkout/result?orderId=${order.id}`;

    const { payment, intent } = await createPaymentForOrder({
      storeId: store.id,
      orderId: order.id,
      returnUrl,
      method: body.method,
    });

    return jsonOk(
      {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          currency: order.currency,
          status: order.status,
          paymentStatus: order.paymentStatus,
        },
        payment: {
          id: payment.id,
          provider: payment.provider,
          status: payment.status,
          mode: process.env.PAYMENT_PROVIDER || "mock",
        },
        intent,
        notice:
          payment.provider === "mock"
            ? "Paiement sandbox/mock — la commande ne passe en paid qu'après confirmation webhook."
            : "Paiement sandbox — confirmation provider requise.",
      },
      { status: 201, requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
