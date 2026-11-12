import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const { storeMembers } = await getUserMemberships(session.user.id);
  const store = storeMembers[0]?.store;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <Link href={`/${locale}`} className="font-semibold">
              SmartCommerce AI
            </Link>
            {store && (
              <p className="text-xs text-[var(--muted)]">
                {store.name} · {store.currency}
              </p>
            )}
          </div>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link href={`/${locale}/dashboard`}>Stats</Link>
            <Link href={`/${locale}/dashboard/crm`}>CRM</Link>
            <Link href={`/${locale}/dashboard/products`}>Produits</Link>
            <Link href={`/${locale}/dashboard/orders`}>Commandes</Link>
            <Link href={`/${locale}/dashboard/payments`}>Paiements</Link>
            <Link href={`/${locale}/dashboard/inbox`}>Inbox WA</Link>
            <Link href={`/${locale}/dashboard/social`}>Social</Link>
            <Link href={`/${locale}/dashboard/ads`}>Studio AI</Link>
            <Link href={`/${locale}/dashboard/billing`}>Abonnement</Link>
            <Link href={`/${locale}/dashboard/security`}>Sécurité</Link>
            <Link href={`/${locale}/dashboard/admin`}>Admin</Link>
            {store && (
              <Link href={`/${locale}/s/${store.slug}`} className="text-[var(--brand)]">
                Vitrine
              </Link>
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
