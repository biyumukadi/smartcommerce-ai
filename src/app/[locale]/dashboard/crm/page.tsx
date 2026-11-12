import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { redirect } from "next/navigation";
import {
  ensureDefaultSegments,
  listComplaints,
  listCustomers,
  listMarketingAutomations,
  listSegments,
  refreshStoreCustomerStats,
} from "@/lib/crm";
import { CrmPanel } from "@/components/crm-panel";

export default async function CrmPage({
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

  await ensureDefaultSegments(store.id);
  await refreshStoreCustomerStats(store.id);

  const [customers, segments, campaigns, complaints] = await Promise.all([
    listCustomers(store.id, { take: 100 }),
    listSegments(store.id),
    listMarketingAutomations(store.id),
    listComplaints(store.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CRM</h1>
        <p className="text-sm text-[var(--muted)]">
          Profils · historique commandes/conversations · segments · fidélité ·
          coupons · réclamations · campagnes consenties
        </p>
      </div>
      <CrmPanel
        storeId={store.id}
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          lifecycle: c.lifecycle,
          loyaltyPoints: c.loyaltyPoints,
          orderCount: c.orderCount,
          marketingConsentWhatsApp: c.marketingConsentWhatsApp,
          segmentKeys: c.segmentKeys,
        }))}
        segments={segments.map((s) => ({
          key: s.key,
          name: s.name,
          description: s.description,
        }))}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          channel: c.channel,
          sentCount: c.sentCount,
          skippedNoConsent: c.skippedNoConsent,
        }))}
        complaints={complaints.map((c) => ({
          id: c.id,
          subject: c.subject,
          status: c.status,
          customerId: c.customerId,
        }))}
      />
    </div>
  );
}
