import type { PrismaClient, RoleScope } from "@prisma/client";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** Race-safe role upsert for parallel vitest suites. */
export async function ensureRole(
  prisma: PrismaClient,
  input: {
    code: string;
    name: string;
    scope: RoleScope | "organization" | "store" | "platform";
    permissions: string[];
  },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.role.upsert({
        where: { code: input.code },
        update: {
          name: input.name,
          permissions: input.permissions,
          scope: input.scope as RoleScope,
        },
        create: {
          code: input.code,
          name: input.name,
          scope: input.scope as RoleScope,
          permissions: input.permissions,
          isSystem: true,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await prisma.role.findUnique({
        where: { code: input.code },
      });
      if (existing) return existing;
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
  }
  return prisma.role.findUniqueOrThrow({ where: { code: input.code } });
}

export async function ensureTrialPlan(prisma: PrismaClient) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.plan.upsert({
        where: { code: "trial" },
        update: {},
        create: {
          code: "trial",
          name: { fr: "Essai", en: "Trial" },
          priceAmount: 0,
          currency: "USD",
          interval: "month",
          limits: {
            stores: 3,
            products: 100,
            staff: 5,
            aiCredits: 50,
            campaigns: 5,
          },
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await prisma.plan.findUnique({ where: { code: "trial" } });
      if (existing) return existing;
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
  }
  return prisma.plan.findUniqueOrThrow({ where: { code: "trial" } });
}

export async function ensureOrgAndStoreRoles(prisma: PrismaClient) {
  const orgOwner = await ensureRole(prisma, {
    code: "ORG_OWNER",
    name: "Organization Owner",
    scope: "organization",
    permissions: [
      "org:manage",
      "stores:write",
      "members:write",
      "billing:read",
      "billing:write",
    ],
  });
  const storeOwner = await ensureRole(prisma, {
    code: "STORE_OWNER",
    name: "Store Owner",
    scope: "store",
    permissions: [
      "products:write",
      "orders:write",
      "ads:write",
      "channels:write",
      "orders:refund",
      "stats:read",
      "members:write",
      "store:manage",
    ],
  });
  const trial = await ensureTrialPlan(prisma);
  return { orgOwner, storeOwner, trial };
}
