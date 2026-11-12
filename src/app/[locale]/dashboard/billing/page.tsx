import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  COST_CATEGORIES,
  getOrganizationSubscription,
  listPublicPlans,
  resolveSaasBillingProvider,
  summarizeCosts,
} from "@/lib/billing";
import { formatMoney, localized } from "@/lib/utils";
import { BillingPanel } from "@/components/billing-panel";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);
  const { orgMembers } = await getUserMemberships(session.user.id);
  const org = orgMembers[0]?.organization;
  if (!org) return <p>Aucune organisation</p>;

  const [plans, subscription, costs] = await Promise.all([
    listPublicPlans(),
    getOrganizationSubscription(org.id),
    summarizeCosts(org.id),
  ]);
  const provider = resolveSaasBillingProvider();
  const loc = locale === "en" ? "en" : "fr";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Abonnement SaaS</h1>
        <p className="text-sm text-[var(--muted)]">
          Frais plateforme Starter $19 / Business $49 / Premium $99 — séparés des
          coûts externes Ads, WhatsApp, AI et transactions.
        </p>
      </div>

      <Card>
        <p className="text-sm">
          Provider billing: <strong>{provider}</strong>
          {provider === "unavailable" && (
            <span className="text-amber-800">
              {" "}
              — sans STRIPE_SECRET_KEY ni SAAS_BILLING_PROVIDER=mock, aucun
              abonnement payant ne sera marqué actif.
            </span>
          )}
        </p>
        {subscription && (
          <p className="mt-2 text-sm">
            Plan actuel: <strong>{subscription.plan.code}</strong> ·{" "}
            {subscription.status} · fin période{" "}
            {subscription.currentPeriodEnd.toISOString().slice(0, 10)}
          </p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {plans
          .filter((p) => p.code !== "trial")
          .map((p) => (
            <Card key={p.id}>
              <h2 className="font-semibold">{localized(p.name, loc)}</h2>
              <p className="mt-1 text-2xl font-semibold">
                {formatMoney(Number(p.priceAmount), p.currency)}
                <span className="text-sm font-normal text-[var(--muted)]">
                  /mois
                </span>
              </p>
              <pre className="mt-3 overflow-auto text-xs text-[var(--muted)]">
                {JSON.stringify(p.limits, null, 2)}
              </pre>
            </Card>
          ))}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Catégories de coûts</h2>
        <ul className="space-y-1 text-sm">
          {Object.entries(COST_CATEGORIES).map(([k, label]) => {
            const amount =
              costs.find((c) => c.category === k)?.amountMinor || 0;
            return (
              <li key={k} className="flex justify-between gap-2">
                <span>{label}</span>
                <span>{formatMoney(amount, "USD")}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <BillingPanel
        currentPlan={subscription?.plan.code || "trial"}
        billingProvider={provider}
      />
    </div>
  );
}
