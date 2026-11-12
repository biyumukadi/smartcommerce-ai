import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { createOrderFromCart } from "@/lib/commerce/orders";
import { createPaymentForOrder } from "@/lib/commerce/payments";
import { getPaymentProviderForMethod } from "@/lib/payments";

type Params = { params: Promise<{ storeSlug: string }> };

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8).optional().or(z.literal("")),
  city: z.string().min(2),
  address: z.string().min(3),
  notes: z.string().optional(),
  method: z
    .enum(["card", "mobile_money", "bank", "cash_on_delivery", "other"])
    .default("mobile_money"),
  operator: z.enum(["mpesa", "airtel_money", "orange_money"]).optional(),
  currency: z.enum(["USD", "CDF", "EUR"]).optional(),
  whatsappConsent: z.boolean().optional(),
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

    // Optional checkout currency override (USD/CDF/EUR) when cart allows
    if (body.currency && body.currency !== cart.currency) {
      if (!store.supportedCurrencies.includes(body.currency)) {
        throw new Error(`Devise ${body.currency} non supportée par la boutique`);
      }
      await prisma.cart.update({
        where: { id: cart.id },
        data: { currency: body.currency },
      });
    }

    if (body.whatsappConsent && (body.phone || body.email)) {
      const { setMarketingConsent } = await import(
        "@/lib/messaging/cart-nudges"
      );
      await setMarketingConsent({
        storeId: store.id,
        consent: true,
        phone: body.phone || undefined,
        email: body.email || undefined,
        name: body.name,
      });
    }

    const order = await createOrderFromCart({
      storeId: store.id,
      cartId: cart.id,
      shippingAddress: {
        name: body.name,
        email: body.email || undefined,
        phone: body.phone || undefined,
        city: body.city,
        address: body.address,
        country: "CD",
      },
      customer: {
        name: body.name,
        email: body.email || undefined,
        phone: body.phone || undefined,
      },
      notes: body.notes,
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const returnUrl = `${appUrl}/fr/s/${store.slug}/checkout/result?orderId=${order.id}`;

    const providerPreview = getPaymentProviderForMethod(body.method);
    if (
      providerPreview.mode === "unavailable" &&
      body.method !== "cash_on_delivery"
    ) {
      // Still create payment record in failed/unavailable state — no fake success
    }

    const { payment, intent, mode } = await createPaymentForOrder({
      storeId: store.id,
      orderId: order.id,
      returnUrl,
      method: body.method,
      operator: body.operator,
      customerEmail: body.email || undefined,
      customerPhone: body.phone || undefined,
      customerName: body.name,
    });

    const refreshed = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });

    return jsonOk(
      {
        order: {
          id: refreshed.id,
          orderNumber: refreshed.orderNumber,
          totalAmount: refreshed.totalAmount,
          currency: refreshed.currency,
          status: refreshed.status,
          paymentStatus: refreshed.paymentStatus,
        },
        payment: {
          id: payment.id,
          provider: payment.provider,
          status: payment.status,
          method: payment.method,
          operator: payment.operator,
          mode,
        },
        intent,
        notice:
          body.method === "cash_on_delivery"
            ? "Paiement à la livraison — commande cod_pending. Aucun débit carte/MM. Le marchand confirmera la réception des espèces."
            : payment.status === "failed"
              ? "Provider indisponible ou intent échoué — aucun débit. Commande non payée."
              : payment.provider === "mock"
                ? "Paiement sandbox/mock — la commande ne passe en paid qu'après confirmation webhook."
                : "Paiement sandbox — confirmation provider (webhook signé) requise.",
      },
      { status: 201, requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
