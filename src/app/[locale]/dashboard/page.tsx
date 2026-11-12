import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { formatMoney, localized } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";
import Link from "next/link";
import { buildStoreAnalytics } from "@/lib/analytics";
import { RevenueBars, ChannelBars } from "@/components/analytics-charts";
import { AnalyticsAssistant } from "@/components/analytics-assistant";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const { storeMembers } = await getUserMemberships(session.user.id);
  const store = storeMembers[0]?.store;
  if (!store) {
    return <p>Aucune boutique — créez un compte marchand.</p>;
  }

  const period =
    sp.period === "day" ||
    sp.period === "week" ||
    sp.period === "month" ||
    sp.period === "custom"
      ? sp.period
      : "month";

  const analytics = await buildStoreAnalytics(store.id, {
    period,
    from: sp.from,
    to: sp.to,
  });

  const currency = store.currency;
  const loc = locale === "en" ? "en" : "fr";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de bord</h1>
          <p className="text-sm text-[var(--muted)]">
            CA · commandes · attribution · ROI pubs · stock · paniers · assistant
            AI
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {(["day", "week", "month"] as const).map((p) => (
            <Link
              key={p}
              href={`/${locale}/dashboard?period=${p}`}
              className={`rounded-md border px-3 py-1 ${
                period === p
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]"
                  : "border-[var(--line)]"
              }`}
            >
              {p === "day" ? "Jour" : p === "week" ? "Semaine" : "Mois"}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs text-[var(--muted)]">CA période</p>
          <p className="text-2xl font-semibold">
            {formatMoney(
              analytics.kpis.revenueMinor,
              currency,
              loc === "en" ? "en-US" : "fr-CD",
            )}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">Commandes / payées</p>
          <p className="text-2xl font-semibold">
            {analytics.kpis.orders} / {analytics.kpis.paidOrders}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">AOV</p>
          <p className="text-2xl font-semibold">
            {formatMoney(analytics.kpis.aov, currency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">Conversion payée</p>
          <p className="text-2xl font-semibold">
            {analytics.kpis.conversionPercent}%
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs text-[var(--muted)]">Spend pubs (budgets)</p>
          <p className="text-xl font-semibold">
            {formatMoney(analytics.kpis.adSpendMinor, currency)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">ROI (CA / spend)</p>
          <p className="text-xl font-semibold">
            {analytics.kpis.roi === null ? "—" : `${analytics.kpis.roi}x`}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">Paniers abandonnés</p>
          <p className="text-xl font-semibold">
            {analytics.kpis.abandonedCarts}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">CA dans le temps</h2>
          <RevenueBars
            series={analytics.revenueSeries}
            currencyLabel={currency}
          />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">
            Attribution canaux (WA / IG-Meta / TikTok)
          </h2>
          <ChannelBars channels={analytics.channelAttribution} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Top produits</h2>
          <ul className="space-y-2 text-sm">
            {analytics.topProducts.length === 0 && (
              <li className="text-[var(--muted)]">Aucune vente sur la période.</li>
            )}
            {analytics.topProducts.map((p) => (
              <li
                key={p.sku}
                className="flex justify-between border-b border-[var(--line)] py-2"
              >
                <span>
                  {p.name} · {p.sku}
                </span>
                <span>
                  ×{p.qty} · {formatMoney(p.revenue, currency)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Stock bas</h2>
          <ul className="space-y-2 text-sm">
            {analytics.lowStock.length === 0 && (
              <li className="text-[var(--muted)]">Aucun stock critique.</li>
            )}
            {analytics.lowStock.map((l) => (
              <li
                key={l.variantId}
                className="flex justify-between border-b border-[var(--line)] py-2"
              >
                <span>
                  {localized(l.productName, loc)} · {l.sku}
                </span>
                <span>
                  {l.onHand} (rés. {l.reserved})
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Paniers abandonnés</h2>
        <ul className="space-y-2 text-sm">
          {analytics.abandonedCarts.length === 0 && (
            <li className="text-[var(--muted)]">Aucun panier abandonné.</li>
          )}
          {analytics.abandonedCarts.map((c) => (
            <li
              key={c.id}
              className="flex justify-between border-b border-[var(--line)] py-2"
            >
              <span>
                {c.customerName || c.customerId || "guest"} · {c.itemCount}{" "}
                art.
              </span>
              <span className="text-xs text-[var(--muted)]">
                {c.consented ? "WA consent ✓" : "sans consent"} · {c.updatedAt}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <AnalyticsAssistant storeId={store.id} period={period} locale={loc} />
    </div>
  );
}
