import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);
  const { storeMembers } = await getUserMemberships(session.user.id);
  const store = storeMembers[0]?.store;
  if (!store) return <p>Aucune boutique</p>;

  const orders = await prisma.order.findMany({
    where: { storeId: store.id },
    include: { items: true, payments: true, customer: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Commandes</h1>
      <div className="space-y-3">
        {orders.map((o) => (
          <Card key={o.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{o.orderNumber}</p>
                <p className="text-xs text-[var(--muted)]">
                  {o.customer?.name || o.customer?.phone || "Guest"} ·{" "}
                  {o.createdAt.toISOString()}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">
                  {formatMoney(Number(o.totalAmount), o.currency)}
                </p>
                <p>
                  {o.status} / {o.paymentStatus}
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              {o.items.map((item) => (
                <li key={item.id}>
                  {item.sku} × {item.quantity}
                </li>
              ))}
            </ul>
            {o.payments[0] && (
              <p className="mt-2 text-xs">
                Paiement {o.payments[0].provider}: {o.payments[0].status}
                {o.payments[0].providerRef
                  ? ` (${o.payments[0].providerRef})`
                  : ""}
              </p>
            )}
          </Card>
        ))}
        {orders.length === 0 && (
          <Card className="text-[var(--muted)]">Aucune commande.</Card>
        )}
      </div>
    </div>
  );
}
