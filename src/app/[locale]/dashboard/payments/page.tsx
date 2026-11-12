import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { listProviderCatalog } from "@/lib/payments";
import Link from "next/link";
import { PaymentActions } from "@/components/payment-actions";

export default async function PaymentsPage({
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

  const payments = await prisma.payment.findMany({
    where: { storeId: store.id },
    include: {
      order: { select: { id: true, orderNumber: true, status: true } },
      refunds: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const catalog = listProviderCatalog();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Historique paiements</h1>
          <p className="text-sm text-[var(--muted)]">
            Webhooks signés + idempotence. Aucun faux succès sans confirmation
            provider.
          </p>
        </div>
        <Link
          href={`/${locale}/dashboard/orders`}
          className="text-sm underline"
        >
          Voir commandes
        </Link>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Providers (catalogue)</h2>
        <ul className="space-y-2 text-sm">
          {catalog.map((p) => (
            <li key={p.id} className="border-b border-[var(--line)] pb-2">
              <span className="font-medium">{p.id}</span> · {p.mode} ·{" "}
              {p.available ? "disponible" : "indisponible"}
              <p className="text-xs text-[var(--muted)]">{p.notesFr}</p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-3">
        {payments.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {p.order.orderNumber} · {p.provider}
                  {p.operator ? ` / ${p.operator}` : ""}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {p.method} · {p.status} · {p.createdAt.toISOString()}
                  {p.providerRef ? ` · ${p.providerRef}` : ""}
                </p>
                {p.refunds.length > 0 && (
                  <p className="mt-1 text-xs text-amber-800">
                    Remboursements:{" "}
                    {p.refunds
                      .map(
                        (r) =>
                          `${r.status} ${formatMoney(Number(r.amount), r.currency)}`,
                      )
                      .join(", ")}
                  </p>
                )}
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">
                  {formatMoney(Number(p.amount), p.currency)}
                </p>
                <PaymentActions
                  storeId={store.id}
                  paymentId={p.id}
                  orderId={p.order.id}
                  canRefund={p.status === "succeeded"}
                  isCod={
                    p.method === "cash_on_delivery" ||
                    p.provider === "cash_on_delivery"
                  }
                  orderStatus={p.order.status}
                />
              </div>
            </div>
          </Card>
        ))}
        {payments.length === 0 && (
          <Card className="text-[var(--muted)]">Aucun paiement.</Card>
        )}
      </div>
    </div>
  );
}
