import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatMoney, localized } from "@/lib/utils";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { WhatsAppProductButton } from "@/components/whatsapp-product-button";
import { buildProductWhatsAppLink } from "@/lib/messaging/product-cta";
import { getWhatsAppProvider } from "@/lib/whatsapp";

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ locale: string; storeSlug: string }>;
}) {
  const { locale, storeSlug } = await params;
  const store = await prisma.store.findFirst({
    where: { slug: storeSlug, status: "live", deletedAt: null },
    include: {
      products: {
        where: { status: "active", deletedAt: null },
        include: {
          variants: {
            where: { status: "active" },
            include: { inventory: true },
          },
        },
      },
    },
  });
  if (!store) notFound();

  const settings = (store.settings || {}) as { whatsappCta?: string | null };
  const wa = settings.whatsappCta;
  const waProvider = getWhatsAppProvider().describe();
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  return (
    <main>
      <section className="hero-plane px-4 py-16 text-[var(--brand-fg)]">
        <div className="mx-auto max-w-6xl">
          <p
            className="fade-up text-4xl font-semibold md:text-5xl"
            style={{ fontFamily: "var(--font-serif), serif" }}
          >
            {store.name}
          </p>
          <p className="fade-up-delay mt-3 max-w-xl text-white/85">
            {store.description ||
              "Boutique SmartCommerce — catalogue live, checkout sandbox, WhatsApp."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/s/${store.slug}/cart`}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink)]"
            >
              Voir le panier
            </Link>
            {wa ? (
              <a
                href={`https://wa.me/${wa.replace(/\D/g, "")}`}
                className="rounded-md border border-white/40 px-4 py-2 text-sm"
              >
                Commander via WhatsApp
              </a>
            ) : (
              <span className="rounded-md border border-white/20 px-4 py-2 text-sm text-white/70">
                WhatsApp CTA (configurez le numéro boutique)
              </span>
            )}
          </div>
          <p className="mt-3 text-xs text-white/70">
            Cloud API: {waProvider.mode}
            {waProvider.available ? "" : " — envois serveur indisponibles sans clés"}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-2xl font-semibold">Catalogue</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {store.products.map((product) => {
            const variant = product.variants[0];
            if (!variant) return null;
            const available =
              (variant.inventory?.quantityOnHand || 0) -
              (variant.inventory?.quantityReserved || 0);
            const name = localized(product.name, locale);
            const priceLabel = formatMoney(
              Number(variant.priceAmount),
              variant.currency,
              locale === "en" ? "en-US" : "fr-CD",
            );
            const productWa = wa
              ? buildProductWhatsAppLink({
                  phoneE164: wa,
                  storeName: store.name,
                  productName: name,
                  sku: variant.sku,
                  priceLabel,
                  storeUrl: `${appUrl}/${locale}/s/${store.slug}`,
                })
              : null;
            return (
              <article
                key={product.id}
                className="border-b border-[var(--line)] pb-6"
              >
                <div className="mb-3 aspect-[4/3] rounded-lg bg-[var(--surface-2)]" />
                <h3 className="text-lg font-semibold">{name}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {localized(product.description, locale)}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="font-semibold">{priceLabel}</p>
                  <AddToCartButton
                    storeSlug={store.slug}
                    variantId={variant.id}
                    disabled={available <= 0}
                  />
                </div>
                <div className="mt-2">
                  <WhatsAppProductButton href={productWa} />
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Stock dispo: {available}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
