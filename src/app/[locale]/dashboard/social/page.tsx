import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { SocialConsole } from "@/components/social-console";
import { listStoreConnections, listPermissionsUi } from "@/lib/social/connections";
import { listSocialCatalog } from "@/lib/social";
import { listSocialPosts } from "@/lib/social/posts";
import { listCampaigns } from "@/lib/social/ads";
import { summarizeAttribution } from "@/lib/social/attribution";

export default async function SocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { locale } = await params;
  const qs = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);
  const { storeMembers } = await getUserMemberships(session.user.id);
  const store = storeMembers[0]?.store;
  if (!store) return <p>Aucune boutique</p>;

  const [connections, posts, campaigns, providers, attribution] =
    await Promise.all([
      listStoreConnections(store.id),
      listSocialPosts(store.id),
      listCampaigns(store.id),
      Promise.resolve(listSocialCatalog()),
      summarizeAttribution(store.id),
    ]);
  const permissions = listPermissionsUi();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Social — Meta & TikTok</h1>
        <p className="text-sm text-[var(--muted)]">
          OAuth, catalogue, posts, Ads scaffolding. Aucun publish/spend faux.
        </p>
        {qs.connected && (
          <p className="mt-1 text-sm text-[var(--brand)]">
            Connecté: {qs.connected}
          </p>
        )}
        {qs.error && (
          <p className="mt-1 text-sm text-red-700">Erreur OAuth: {qs.error}</p>
        )}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Providers</h2>
        <ul className="space-y-2 text-sm">
          {providers.map((p) => (
            <li key={p.id}>
              <span className="font-medium">{p.id}</span> · {p.mode} ·{" "}
              {p.available ? "disponible" : "indisponible"}
              <p className="text-xs text-[var(--muted)]">{p.notesFr}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Permissions (UI)</h2>
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div>
            <p className="font-medium">Meta</p>
            <ul className="text-xs text-[var(--muted)]">
              {permissions.meta.map((p) => (
                <li key={p.key}>• {p.labelFr}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">TikTok</p>
            <ul className="text-xs text-[var(--muted)]">
              {permissions.tiktok.map((p) => (
                <li key={p.key}>• {p.labelFr}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <SocialConsole storeId={store.id} />

      <Card>
        <h2 className="mb-2 font-semibold">Connexions</h2>
        {connections.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Aucune connexion.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {connections.map((c) => (
              <li key={c.id}>
                {c.provider} · {c.status} · {c.accountLabel || c.externalAccountId}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Posts récents</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Aucun post.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {posts.slice(0, 10).map((p) => (
              <li key={p.id}>
                {p.provider} · {p.status} · {p.caption?.slice(0, 60)}
                {p.error ? ` — ${p.error}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Campagnes Ads</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Aucune campagne.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {campaigns.slice(0, 10).map((c) => (
              <li key={c.id}>
                {c.channel} · {c.status} · {c.name}
                {c.spendConfirmedAt ? " · spend confirmé" : " · sans spend"}
                {c.error ? ` — ${c.error}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Attribution trafic</h2>
        {attribution.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Aucun événement. Les UTM storefront / checkout alimentent cette vue.
          </p>
        ) : (
          <ul className="text-sm">
            {attribution.map((a) => (
              <li key={a.source}>
                {a.source}: {a.count}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
