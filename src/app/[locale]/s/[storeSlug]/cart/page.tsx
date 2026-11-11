import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatMoney, localized } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: string; storeSlug: string }>;
}) {
  const { locale, storeSlug } = await params;
  const store = await prisma.store.findFirst({
    where: { slug: storeSlug, status: "live" },
  });
  if (!store) notFound();

  const jar = await cookies();
  const sessionId = jar.get("sc_cart")?.value;
  const cart = sessionId
    ? await prisma.cart.findFirst({
        where: { storeId: store.id, sessionId, status: "open" },
        include: {
          items: {
            include: { variant: { include: { product: true } } },
          },
        },
      })
    : null;

  const total =
    cart?.items.reduce(
      (s, i) => s + Number(i.unitPriceAmount) * i.quantity,
      0,
    ) || 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Panier — {store.name}</h1>
      <Card className="space-y-3">
        {(cart?.items || []).map((item) => (
          <div key={item.id} className="flex justify-between border-b border-[var(--line)] py-2">
            <div>
              <p className="font-medium">
                {localized(item.variant.product.name, locale)}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {item.variant.sku} × {item.quantity}
              </p>
            </div>
            <p>
              {formatMoney(
                Number(item.unitPriceAmount) * item.quantity,
                item.currency,
              )}
            </p>
          </div>
        ))}
        {(!cart || cart.items.length === 0) && (
          <p className="text-[var(--muted)]">Votre panier est vide.</p>
        )}
        <div className="flex items-center justify-between pt-2">
          <p className="font-semibold">Total</p>
          <p className="font-semibold">
            {formatMoney(total, cart?.currency || store.currency)}
          </p>
        </div>
        <Link
          href={`/${locale}/s/${store.slug}/checkout`}
          className="inline-flex rounded-md bg-[var(--brand)] px-4 py-2 text-sm text-[var(--brand-fg)]"
        >
          Checkout
        </Link>
      </Card>
    </main>
  );
}
