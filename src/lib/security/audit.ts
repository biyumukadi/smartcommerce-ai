import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function writeAuditLog(input: {
  organizationId?: string | null;
  storeId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  diff?: object | null;
}) {
  try {
    const row = await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId || undefined,
        storeId: input.storeId || undefined,
        actorUserId: input.actorUserId || undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || undefined,
        ip: input.ip || undefined,
        userAgent: input.userAgent || undefined,
        diff: input.diff || undefined,
      },
    });
    logger.info("audit.write", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actorUserId,
    });
    return row;
  } catch (err) {
    logger.error("audit.write_failed", {
      action: input.action,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function listAuditLogs(input: {
  organizationId?: string;
  storeId?: string;
  take?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      ...(input.organizationId
        ? { organizationId: input.organizationId }
        : {}),
      ...(input.storeId ? { storeId: input.storeId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: input.take ?? 100,
  });
}
