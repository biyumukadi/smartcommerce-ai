import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { aiProviderStatus, getOrCreateUsage } from "@/lib/ai";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { AdsStudio } from "@/components/ads-studio";
import { localized } from "@/lib/utils";

export default async function AdsPage({
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

  const loc = locale === "en" ? "en" : "fr";

  const [jobs, usage, providers, products, creatives, connections] =
    await Promise.all([
      prisma.aIJob.findMany({
        where: { storeId: store.id },
        include: { creatives: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      getOrCreateUsage(store.organizationId),
      Promise.resolve(aiProviderStatus()),
      prisma.product.findMany({
        where: { storeId: store.id, status: "active", deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.adCreative.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.socialConnection.findMany({
        where: {
          storeId: store.id,
          provider: { in: ["meta", "tiktok"] },
          status: "connected",
        },
      }),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Studio Pubs AI</h1>
        <p className="text-sm text-[var(--muted)]">
          Packs copy · visuels multi-formats · scripts vidéo · crédits ·
          publication canaux Phase 5 (confirmations explicites)
        </p>
      </div>
      <Card>
        <p className="text-sm">
          Providers: texte <strong>{providers.text}</strong> · image{" "}
          <strong>{providers.image}</strong> · VO{" "}
          <strong>{providers.voiceover}</strong> · rendu vidéo{" "}
          <strong>{providers.videoRender}</strong>
        </p>
        {!providers.live && (
          <p className="mt-2 text-sm text-amber-800">
            OPENAI_API_KEY absente — jobs texte/image échouent explicitement
            (aucun succès fictif). Scripts vidéo locaux restent disponibles.
          </p>
        )}
        {!providers.ttsLive && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            TTS / rendu vidéo: hooks fail-closed — pas de faux fichier audio/mp4.
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--muted)]">
          Crédits: {usage.creditsUsed}/{usage.creditsLimit} · tokens{" "}
          {usage.tokensUsed} · images {usage.imageCount} · vidéos{" "}
          {usage.videoCount}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Canaux connectés:{" "}
          {connections.length
            ? connections.map((c) => c.provider).join(", ")
            : "aucun (publication restera unavailable)"}
        </p>
      </Card>
      <AdsStudio
        storeId={store.id}
        locale={loc}
        products={products.map((p) => ({
          id: p.id,
          name: localized(p.name, loc),
        }))}
        creatives={creatives.map((c) => ({
          id: c.id,
          type: c.type,
          status: c.status,
          headline: c.headline,
          body: c.body,
          cta: c.cta,
          strategy: c.strategy,
          format: c.format,
          variantLabel: c.variantLabel,
          hashtags: c.hashtags,
        }))}
      />
      <div className="space-y-3">
        <h2 className="font-semibold">Jobs récents</h2>
        {jobs.map((job) => (
          <Card key={job.id}>
            <div className="flex justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold">
                  {job.type} · {job.status}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {job.provider} · {job.createdAt.toISOString()} ·{" "}
                  {job.creatives.length} créatif(s)
                </p>
              </div>
              <p className="text-xs">{job.usageTokens ?? 0} tok</p>
            </div>
            {job.error && (
              <p className="mt-2 text-sm text-red-700">{job.error}</p>
            )}
            {job.output && (
              <pre className="mt-2 overflow-auto rounded bg-[var(--surface-2)] p-2 text-xs">
                {JSON.stringify(job.output, null, 2)}
              </pre>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
