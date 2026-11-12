import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { SecurityPanel } from "@/components/security-panel";
import { webhookAuditSummary } from "@/lib/security/webhooks";
import { mfaRequiredByPolicy } from "@/lib/security/mfa";

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      email: true,
      mfaEnabled: true,
      mfaVerifiedAt: true,
      isPlatformAdmin: true,
    },
  });
  const webhooks = webhookAuditSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sécurité & confidentialité</h1>
        <p className="text-sm text-[var(--muted)]">
          MFA · rate limit · CSRF/XSS posture · webhooks signés · export/suppression
        </p>
      </div>
      <Card>
        <p className="text-sm">
          Compte: {user.email} · MFA{" "}
          {user.mfaEnabled ? "activé" : "désactivé"}
          {mfaRequiredByPolicy() && !user.mfaEnabled && (
            <span className="text-amber-800">
              {" "}
              — MFA_REQUIRED=true : activez MFA pour les rôles sensibles.
            </span>
          )}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Webhooks: {webhooks.total} canaux audités · secrets manquants:{" "}
          {webhooks.missingSecrets.join(", ") || "aucun"}
        </p>
      </Card>
      <SecurityPanel mfaEnabled={user.mfaEnabled} />
    </div>
  );
}
