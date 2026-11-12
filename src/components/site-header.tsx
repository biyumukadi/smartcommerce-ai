import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";

export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations();
  const session = await auth();

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
      <Link href={`/${locale}`} className="text-lg font-semibold tracking-tight">
        {t("brand")}
      </Link>
      <nav className="flex items-center gap-3 text-sm">
        <Link href={`/${locale === "fr" ? "en" : "fr"}`} className="text-[var(--muted)]">
          {locale === "fr" ? "EN" : "FR"}
        </Link>
        {session?.user ? (
          <>
            <Link href={`/${locale}/dashboard`}>{t("nav.dashboard")}</Link>
            <Link href={`/${locale}/logout`} className="text-[var(--muted)]">
              {t("nav.logout")}
            </Link>
          </>
        ) : (
          <>
            <Link href={`/${locale}/login`}>{t("nav.login")}</Link>
            <Link
              href={`/${locale}/register`}
              className="rounded-md bg-[var(--brand)] px-3 py-2 text-[var(--brand-fg)]"
            >
              {t("nav.register")}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
