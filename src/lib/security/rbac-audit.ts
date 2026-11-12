import { prisma } from "@/lib/db";

/** Expected permission matrix for seeded roles — used in tests + admin view */
export const RBAC_MATRIX: Record<string, string[]> = {
  PLATFORM_ADMIN: ["*"],
  ORG_OWNER: [
    "org:manage",
    "stores:write",
    "members:write",
    "billing:read",
    "billing:write",
  ],
  ORG_ADMIN: ["org:manage", "stores:write", "members:write"],
  STORE_OWNER: [
    "store:manage",
    "products:write",
    "orders:write",
    "orders:refund",
    "ads:write",
    "channels:write",
    "stats:read",
    "members:write",
  ],
  STORE_MANAGER: [
    "products:write",
    "orders:write",
    "ads:write",
    "stats:read",
    "crm:write",
  ],
  STORE_STAFF: ["orders:write", "products:read", "inventory:write"],
  STORE_VIEWER: ["orders:read", "products:read", "stats:read"],
};

export async function auditRbacRoles() {
  const roles = await prisma.role.findMany({ orderBy: { code: "asc" } });
  return roles.map((role) => {
    const expected = RBAC_MATRIX[role.code] || [];
    const actual = role.permissions;
    const missing = expected.filter(
      (p) => p !== "*" && !actual.includes(p) && !actual.includes("*"),
    );
    const extra = actual.filter(
      (p) => p !== "*" && expected.length && !expected.includes(p) && !expected.includes("*"),
    );
    return {
      code: role.code,
      scope: role.scope,
      permissions: actual,
      expected,
      missing,
      extra,
      ok: missing.length === 0,
    };
  });
}
