import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main>
      <SiteHeader locale={locale} />
      <section className="hero-plane mx-auto min-h-[78vh] w-full max-w-6xl overflow-hidden rounded-3xl px-6 py-16 text-[var(--brand-fg)] shadow-lg md:px-12">
        <div className="fade-up max-w-2xl">
          <p
            className="mb-3 text-4xl font-semibold tracking-tight md:text-6xl"
            style={{ fontFamily: "var(--font-serif), serif" }}
          >
            {t("brand")}
          </p>
          <h1 className="fade-up-delay mb-4 text-xl font-medium md:text-2xl">
            {t("tagline")}
          </h1>
          <p className="mb-8 max-w-xl text-sm text-white/80 md:text-base">
            Multi-boutiques, USD/CDF/EUR, paiements sandbox honnêtes, et Studio
            Pubs AI fail-closed. WhatsApp CTA prêt — Cloud API en stub sans clés.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/${locale}/register`}
              className="pulse-soft rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--ink)]"
            >
              {t("cta.start")}
            </Link>
            <Link
              href={`/${locale}/s/marche-central`}
              className="rounded-md border border-white/30 px-5 py-3 text-sm"
            >
              Voir la démo
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-3 text-2xl font-semibold">Conçu pour Kinshasa d’abord</h2>
        <p className="max-w-2xl text-[var(--muted)]">
          Catalogue, panier, checkout Mobile Money sandbox, dashboard marchand et
          génération de pubs. Aucune intégration Meta/TikTok/WhatsApp Cloud n’est
          affirmée live sans credentials.
        </p>
      </section>
    </main>
  );
}
