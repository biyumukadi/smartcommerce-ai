import { auth } from "@/lib/auth";
import { getUserMemberships } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { aiProviderStatus } from "@/lib/ai";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { AdsStudio } from "@/components/ads-studio";

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

  const [jobs, usage, providers] = await Promise.all([
    prisma.aIJob.findMany({
      where: { storeId: store.id },
      include: { creatives: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.aIUsage.findFirst({
      where: { organizationId: store.organizationId },
      orderBy: { periodStart: "desc" },
    }),
    Promise.resolve(aiProviderStatus()),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Studio Pubs AI</h1>
        <p className="text-sm text-[var(--muted)]">
          Interfaces provider réelles · fail-closed sans clé · pas de publication Meta/TikTok
        </p>
      </div>
      <Card>
        <p className="text-sm">
          Providers: texte <strong>{providers.text}</strong> · image{" "}
          <strong>{providers.image}</strong>
        </p>
        {!providers.live && (
          <p className="mt-2 text-sm text-amber-800">
            OPENAI_API_KEY absente — les jobs échoueront avec un message explicite
            (aucun succès fictif).
          </p>
        )}
        {usage && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Usage période: {usage.tokensUsed} tokens · {usage.imageCount} images
          </p>
        )}
      </Card>
      <AdsStudio storeId={store.id} locale={locale === "en" ? "en" : "fr"} />
      <div className="space-y-3">
        {jobs.map((job) => (
          <Card key={job.id}>
            <div className="flex justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold">
                  {job.type} · {job.status}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {job.provider} · {job.createdAt.toISOString()}
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
