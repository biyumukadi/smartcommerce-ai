import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { setMarketingConsent } from "@/lib/messaging/cart-nudges";

type Params = { params: Promise<{ storeSlug: string }> };

const schema = z.object({
  consent: z.boolean(),
  phone: z.string().min(8).optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeSlug } = await params;
  try {
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug, status: "live", deletedAt: null },
    });
    if (!store) throw new Error("Boutique introuvable");

    const body = schema.parse(await req.json());
    const jar = await cookies();
    const sessionId = jar.get("sc_cart")?.value;
    let customerId: string | undefined;

    if (sessionId) {
      const cart = await prisma.cart.findFirst({
        where: { storeId: store.id, sessionId, status: "open" },
      });
      if (cart?.customerId) customerId = cart.customerId;
    }

    const customer = await setMarketingConsent({
      storeId: store.id,
      consent: body.consent,
      phone: body.phone,
      email: body.email,
      name: body.name,
      customerId,
    });

    if (sessionId && customer) {
      await prisma.cart.updateMany({
        where: { storeId: store.id, sessionId, status: "open" },
        data: { customerId: customer.id },
      });
    }

    return jsonOk(
      {
        customerId: customer.id,
        marketingConsentWhatsApp: customer.marketingConsentWhatsApp,
        notice: body.consent
          ? "Consentement WhatsApp enregistré (nudges panier abandonné autorisés)."
          : "Consentement WhatsApp retiré — aucun nudge marketing.",
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
