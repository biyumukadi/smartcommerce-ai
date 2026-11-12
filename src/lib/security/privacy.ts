import { prisma } from "@/lib/db";
import { writeAuditLog } from "./audit";

export async function requestPrivacyExport(input: {
  userId: string;
  organizationId?: string;
}) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      preferredCurrency: true,
      createdAt: true,
      organizationMembers: {
        include: { organization: { select: { id: true, name: true, slug: true } } },
      },
      storeMembers: {
        include: { store: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      preferredCurrency: user.preferredCurrency,
      createdAt: user.createdAt,
    },
    organizations: user.organizationMembers.map((m) => m.organization),
    stores: user.storeMembers.map((m) => m.store),
  };

  const req = await prisma.privacyRequest.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      type: "export",
      status: "completed",
      payload,
      completedAt: new Date(),
    },
  });

  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: "privacy.export",
    entityType: "PrivacyRequest",
    entityId: req.id,
  });

  return { request: req, payload };
}

/**
 * Soft-delete / anonymize user PII. Does not hard-delete orders (legal retention).
 */
export async function requestPrivacyDelete(input: {
  userId: string;
  organizationId?: string;
  confirm: boolean;
}) {
  if (!input.confirm) {
    return {
      status: "needs_confirmation" as const,
      error: "confirm=true requis pour suppression / anonymisation.",
    };
  }

  const pending = await prisma.privacyRequest.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      type: "delete",
      status: "processing",
    },
  });

  const anonEmail = `deleted-${input.userId.slice(0, 8)}@anonymized.local`;
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      email: anonEmail,
      name: "Utilisateur anonymisé",
      passwordHash: null,
      imageUrl: null,
      mfaEnabled: false,
      mfaSecretEncrypted: null,
      status: "disabled",
    },
  });

  const done = await prisma.privacyRequest.update({
    where: { id: pending.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      payload: { anonymizedEmail: anonEmail },
    },
  });

  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: "privacy.delete_anonymize",
    entityType: "PrivacyRequest",
    entityId: done.id,
  });

  return { status: "completed" as const, request: done };
}
