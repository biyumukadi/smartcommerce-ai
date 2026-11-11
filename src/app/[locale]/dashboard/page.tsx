import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const { storeMembers } = await getUserMemberships(session.user.id);
  const store = storeMembers[0]?.store;
  if (!store) {
    return <p>Aucune boutique — créez un compte marchand.</p>;
  }

  const [productCount, orderCount, paidOrders, recentOrders] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id, deletedAt: null } }),
    prisma.order.count({ where: { storeId: store.id } }),
    prisma.order.findMany({
      where: { storeId: store.id, paymentStatus: "paid" },
      select: { totalAmount: true, currency: true },
    }),
    prisma.order.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const revenue = paidOrders.reduce((s, o) => s + Number(o.totalAmount), 0);
  const currency = paidOrders[0]?.currency || store.currency;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <p className="text-sm text-[var(--muted)]">
          Isolation storeId stricte · paiements sandbox · AI fail-closed
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs text-[var(--muted)]">Produits</p>
          <p className="text-3xl font-semibold">{productCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">Commandes</p>
          <p className="text-3xl font-semibold">{orderCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">Payées</p>
          <p className="text-3xl font-semibold">{paidOrders.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">CA (minor→display)</p>
          <p className="text-2xl font-semibold">
            {formatMoney(revenue, currency, locale === "en" ? "en-US" : "fr-CD")}
          </p>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Commandes récentes</h2>
        <ul className="space-y-2 text-sm">
          {recentOrders.map((o) => (
            <li key={o.id} className="flex justify-between border-b border-[var(--line)] py-2">
              <span>{o.orderNumber}</span>
              <span>
                {formatMoney(Number(o.totalAmount), o.currency)} · {o.paymentStatus}
              </span>
            </li>
          ))}
          {recentOrders.length === 0 && (
            <li className="text-[var(--muted)]">Aucune commande pour l’instant.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
