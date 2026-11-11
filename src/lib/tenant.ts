import { prisma } from "@/lib/db";

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}

export async function getUserMemberships(userId: string) {
  const [orgMembers, storeMembers] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: true,
        role: true,
      },
    }),
    prisma.storeMember.findMany({
      where: { userId, status: "active" },
      include: {
        store: true,
        role: true,
      },
    }),
  ]);
  return { orgMembers, storeMembers };
}

export async function requireStoreAccess(
  userId: string,
  storeId: string,
  permission?: string,
) {
  const membership = await prisma.storeMember.findUnique({
    where: { storeId_userId: { storeId, userId } },
    include: {
      role: true,
      store: true,
    },
  });

  if (!membership || membership.status !== "active") {
    // Org owner/admin of the store's org also has access
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new TenantError("Store not found");
    const orgMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: store.organizationId,
          userId,
        },
      },
      include: { role: true },
    });
    if (!orgMember) throw new TenantError("Forbidden: no store access");
    if (
      permission &&
      !orgMember.role.permissions.includes("*") &&
      !orgMember.role.permissions.includes(permission) &&
      !["ORG_OWNER", "ORG_ADMIN"].includes(orgMember.role.code)
    ) {
      throw new TenantError(`Forbidden: missing ${permission}`);
    }
    return {
      store,
      role: orgMember.role,
      via: "organization" as const,
    };
  }

  if (
    permission &&
    !membership.role.permissions.includes("*") &&
    !membership.role.permissions.includes(permission)
  ) {
    throw new TenantError(`Forbidden: missing ${permission}`);
  }

  return {
    store: membership.store,
    role: membership.role,
    via: "store" as const,
  };
}

export async function assertStoreOwnedResource(
  storeId: string,
  resourceStoreId: string,
) {
  if (storeId !== resourceStoreId) {
    throw new TenantError("Cross-tenant access denied");
  }
}
