import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { formatMoney, localized } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { ProductForm } from "@/components/product-form";

export default async function ProductsPage({
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

  const products = await prisma.product.findMany({
    where: { storeId: store.id, deletedAt: null },
    include: { variants: { include: { inventory: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Produits</h1>
        <p className="text-sm text-[var(--muted)]">CRUD catalogue + stock</p>
      </div>
      <ProductForm storeId={store.id} defaultCurrency={store.currency} />
      <div className="grid gap-3">
        {products.map((p) => {
          const v = p.variants[0];
          return (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{localized(p.name, locale)}</p>
                <p className="text-xs text-[var(--muted)]">
                  {p.status} · {v?.sku} · stock{" "}
                  {v?.inventory
                    ? v.inventory.quantityOnHand - v.inventory.quantityReserved
                    : 0}
                </p>
              </div>
              <p className="font-semibold">
                {v
                  ? formatMoney(Number(v.priceAmount), v.currency, locale === "en" ? "en-US" : "fr-CD")
                  : "—"}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
