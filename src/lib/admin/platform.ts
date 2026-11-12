import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/security/audit";
import { ensureSaasPlansSeeded } from "@/lib/billing/subscriptions";
import { auditRbacRoles } from "@/lib/security/rbac-audit";
import { webhookAuditSummary } from "@/lib/security/webhooks";
import { resolveSaasBillingProvider } from "@/lib/billing/provider";
import { listSocialCatalog } from "@/lib/social";
import { listWhatsAppCatalog } from "@/lib/whatsapp";
import { listProviderCatalog } from "@/lib/payments";

export async function requirePlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.isPlatformAdmin) {
    throw new Error("Forbidden: platform admin requis");
  }
  return user;
}

export async function platformOverview() {
  await ensureSaasPlansSeeded();
  const [
    orgs,
    stores,
    subscriptions,
    users,
    rbac,
    webhooks,
  ] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        _count: { select: { stores: true, members: true } },
        subscriptions: { include: { plan: true }, take: 1, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.store.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        currency: true,
        organizationId: true,
        createdAt: true,
      },
    }),
    prisma.subscription.findMany({
      include: { plan: true, organization: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.user.count(),
    auditRbacRoles(),
    Promise.resolve(webhookAuditSummary()),
  ]);

  return {
    counts: {
      organizations: orgs.length,
      stores: stores.length,
      subscriptions: subscriptions.length,
      users,
    },
    organizations: orgs,
    stores,
    subscriptions,
    integrations: {
      saasBilling: resolveSaasBillingProvider(),
      payments: listProviderCatalog(),
      whatsapp: listWhatsAppCatalog(),
      social: listSocialCatalog(),
    },
    rbac,
    webhooks,
  };
}

export async function setOrganizationStatus(input: {
  actorUserId: string;
  organizationId: string;
  status: "active" | "suspended";
}) {
  await requirePlatformAdmin(input.actorUserId);
  const org = await prisma.organization.update({
    where: { id: input.organizationId },
    data: { status: input.status },
  });
  await writeAuditLog({
    organizationId: org.id,
    actorUserId: input.actorUserId,
    action: `platform.org_${input.status}`,
    entityType: "Organization",
    entityId: org.id,
  });
  return org;
}

export async function setSubscriptionStatus(input: {
  actorUserId: string;
  subscriptionId: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
}) {
  await requirePlatformAdmin(input.actorUserId);
  const sub = await prisma.subscription.update({
    where: { id: input.subscriptionId },
    data: {
      status: input.status,
      canceledAt: input.status === "cancelled" ? new Date() : null,
    },
    include: { plan: true },
  });
  await writeAuditLog({
    organizationId: sub.organizationId,
    actorUserId: input.actorUserId,
    action: "platform.subscription_status",
    entityType: "Subscription",
    entityId: sub.id,
    diff: { status: input.status },
  });
  return sub;
}
