import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { platformOverview } from "@/lib/admin/platform";
import { AdminPanel } from "@/components/admin-panel";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user?.isPlatformAdmin) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Super-admin</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Accès refusé. Définissez `isPlatformAdmin` via seed (
          PLATFORM_ADMIN_EMAIL) pour ce compte.
        </p>
      </Card>
    );
  }

  const overview = await platformOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Super-admin plateforme</h1>
        <p className="text-sm text-[var(--muted)]">
          Organisations · boutiques · abonnements · intégrations · RBAC ·
          webhooks
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs text-[var(--muted)]">Orgs</p>
          <p className="text-3xl font-semibold">
            {overview.counts.organizations}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">Stores</p>
          <p className="text-3xl font-semibold">{overview.counts.stores}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">Subscriptions</p>
          <p className="text-3xl font-semibold">
            {overview.counts.subscriptions}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--muted)]">Users</p>
          <p className="text-3xl font-semibold">{overview.counts.users}</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Intégrations</h2>
        <p className="text-sm">
          SaaS billing: <strong>{overview.integrations.saasBilling}</strong>
        </p>
        <p className="text-xs text-[var(--muted)]">
          Paiements: {overview.integrations.payments.length} · WhatsApp:{" "}
          {overview.integrations.whatsapp.length} · Social:{" "}
          {overview.integrations.social.length}
        </p>
        <p className="mt-2 text-xs">
          Webhooks signés: {overview.webhooks.allVerified ? "OK" : "à revoir"} ·
          secrets manquants:{" "}
          {overview.webhooks.missingSecrets.join(", ") || "aucun"}
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Audit RBAC</h2>
        <ul className="space-y-1 text-xs">
          {overview.rbac.map((r) => (
            <li key={r.code}>
              {r.code}: {r.ok ? "✓" : `manque ${r.missing.join(",")}`}
            </li>
          ))}
        </ul>
      </Card>

      <AdminPanel
        organizations={overview.organizations.map((o) => ({
          id: o.id,
          name: o.name,
          status: o.status,
          plan: o.subscriptions[0]?.plan.code || "—",
        }))}
        subscriptions={overview.subscriptions.map((s) => ({
          id: s.id,
          org: s.organization.name,
          plan: s.plan.code,
          status: s.status,
        }))}
      />
    </div>
  );
}
