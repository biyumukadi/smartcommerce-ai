import { PrismaClient, RoleScope } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROLES = [
  {
    code: "PLATFORM_ADMIN",
    name: "Platform Admin",
    scope: RoleScope.platform,
    permissions: ["*"],
  },
  {
    code: "ORG_OWNER",
    name: "Organization Owner",
    scope: RoleScope.organization,
    permissions: [
      "org:manage",
      "stores:write",
      "members:write",
      "billing:read",
      "billing:write",
    ],
  },
  {
    code: "ORG_ADMIN",
    name: "Organization Admin",
    scope: RoleScope.organization,
    permissions: ["org:manage", "stores:write", "members:write"],
  },
  {
    code: "STORE_OWNER",
    name: "Store Owner",
    scope: RoleScope.store,
    permissions: [
      "store:manage",
      "products:write",
      "orders:write",
      "orders:refund",
      "ads:write",
      "channels:write",
      "stats:read",
      "members:write",
    ],
  },
  {
    code: "STORE_MANAGER",
    name: "Store Manager",
    scope: RoleScope.store,
    permissions: [
      "products:write",
      "orders:write",
      "ads:write",
      "stats:read",
      "crm:write",
    ],
  },
  {
    code: "STORE_STAFF",
    name: "Store Staff",
    scope: RoleScope.store,
    permissions: ["orders:write", "products:read", "inventory:write"],
  },
  {
    code: "STORE_VIEWER",
    name: "Store Viewer",
    scope: RoleScope.store,
    permissions: ["orders:read", "products:read", "stats:read"],
  },
] as const;

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        permissions: [...role.permissions],
        scope: role.scope,
      },
      create: {
        code: role.code,
        name: role.name,
        scope: role.scope,
        permissions: [...role.permissions],
        isSystem: true,
      },
    });
  }

  const plans = [
    {
      code: "trial",
      name: { fr: "Essai", en: "Trial" },
      priceAmount: 0,
      limits: {
        stores: 3,
        products: 100,
        staff: 5,
        aiCredits: 50,
        campaigns: 5,
        crm: true,
        social: true,
        analyticsAssistant: true,
        features: ["trial_all"],
      },
    },
    {
      code: "starter",
      name: { fr: "Starter", en: "Starter" },
      priceAmount: 1900,
      limits: {
        stores: 1,
        products: 200,
        staff: 3,
        aiCredits: 200,
        campaigns: 10,
        crm: true,
        social: false,
        analyticsAssistant: false,
        features: ["catalogue", "orders", "payments_mock", "ai_ads_basic"],
      },
    },
    {
      code: "business",
      name: { fr: "Business", en: "Business" },
      priceAmount: 4900,
      limits: {
        stores: 5,
        products: 5000,
        staff: 20,
        aiCredits: 1500,
        campaigns: 100,
        crm: true,
        social: true,
        analyticsAssistant: true,
        features: [
          "catalogue",
          "orders",
          "payments",
          "whatsapp",
          "crm",
          "social",
          "ai_ads",
        ],
      },
    },
    {
      code: "premium",
      name: { fr: "Premium", en: "Premium" },
      priceAmount: 9900,
      limits: {
        stores: 25,
        products: 50000,
        staff: 100,
        aiCredits: 10000,
        campaigns: 1000,
        crm: true,
        social: true,
        analyticsAssistant: true,
        features: [
          "catalogue",
          "orders",
          "payments",
          "whatsapp",
          "crm",
          "social",
          "ai_ads",
          "priority_support",
          "super_limits",
        ],
      },
    },
  ] as const;

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceAmount: plan.priceAmount,
        limits: plan.limits,
        isActive: true,
      },
      create: {
        code: plan.code,
        name: plan.name,
        priceAmount: plan.priceAmount,
        currency: "USD",
        interval: "month",
        limits: plan.limits,
        isActive: true,
      },
    });
  }

  const demoEmail = process.env.SEED_DEMO_EMAIL ?? "demo@smartcommerce.ai";
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  const platformAdminEmail =
    process.env.PLATFORM_ADMIN_EMAIL || demoEmail;

  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      passwordHash,
      name: "Demo Merchant",
      isPlatformAdmin: demoEmail === platformAdminEmail,
    },
    create: {
      email: demoEmail,
      passwordHash,
      name: "Demo Merchant",
      locale: "fr",
      preferredCurrency: "USD",
      isPlatformAdmin: demoEmail === platformAdminEmail,
    },
  });

  if (platformAdminEmail !== demoEmail) {
    const adminHash = await bcrypt.hash(
      process.env.PLATFORM_ADMIN_PASSWORD || demoPassword,
      12,
    );
    await prisma.user.upsert({
      where: { email: platformAdminEmail },
      update: { passwordHash: adminHash, isPlatformAdmin: true },
      create: {
        email: platformAdminEmail,
        passwordHash: adminHash,
        name: "Platform Admin",
        locale: "fr",
        isPlatformAdmin: true,
      },
    });
  }

  const orgOwner = await prisma.role.findUniqueOrThrow({
    where: { code: "ORG_OWNER" },
  });
  const storeOwner = await prisma.role.findUniqueOrThrow({
    where: { code: "STORE_OWNER" },
  });
  const trial = await prisma.plan.findUniqueOrThrow({ where: { code: "trial" } });

  const org = await prisma.organization.upsert({
    where: { slug: "demo-kinshasa" },
    update: {},
    create: {
      name: "Boutique Démo Kinshasa",
      slug: "demo-kinshasa",
      country: "CD",
      defaultCurrency: "USD",
      defaultLocale: "fr",
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: user.id },
    },
    update: { roleId: orgOwner.id },
    create: {
      organizationId: org.id,
      userId: user.id,
      roleId: orgOwner.id,
    },
  });

  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  const existingSub = await prisma.subscription.findFirst({
    where: { organizationId: org.id },
  });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: trial.id,
        status: "trialing",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });
  }

  const store = await prisma.store.upsert({
    where: {
      organizationId_slug: { organizationId: org.id, slug: "marche-central" },
    },
    update: { status: "live" },
    create: {
      organizationId: org.id,
      name: "Marché Central",
      slug: "marche-central",
      description: "Boutique démo RDC — mode, électronique et maison.",
      currency: "USD",
      supportedCurrencies: ["USD", "CDF", "EUR"],
      locales: ["fr", "en"],
      status: "live",
      timezone: "Africa/Kinshasa",
      settings: {
        whatsappCta: "+243900000000",
        paymentMode: "mock",
      },
    },
  });

  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: user.id } },
    update: { roleId: storeOwner.id, status: "active" },
    create: {
      storeId: store.id,
      userId: user.id,
      roleId: storeOwner.id,
      status: "active",
    },
  });

  const category = await prisma.category.upsert({
    where: { storeId_slug: { storeId: store.id, slug: "electronique" } },
    update: {},
    create: {
      storeId: store.id,
      name: { fr: "Électronique", en: "Electronics" },
      slug: "electronique",
      sortOrder: 1,
    },
  });

  const product = await prisma.product.upsert({
    where: { storeId_slug: { storeId: store.id, slug: "ecouteurs-sans-fil" } },
    update: { status: "active" },
    create: {
      storeId: store.id,
      categoryId: category.id,
      name: { fr: "Écouteurs sans fil", en: "Wireless earbuds" },
      description: {
        fr: "Son clair, autonomie 24h — parfait pour Kinshasa.",
        en: "Clear sound, 24h battery — built for Kinshasa life.",
      },
      slug: "ecouteurs-sans-fil",
      status: "active",
      media: [],
    },
  });

  const variant = await prisma.productVariant.upsert({
    where: { storeId_sku: { storeId: store.id, sku: "EAR-BLK-01" } },
    update: {},
    create: {
      productId: product.id,
      storeId: store.id,
      sku: "EAR-BLK-01",
      name: { fr: "Noir", en: "Black" },
      options: { color: "noir" },
      priceAmount: 4500,
      currency: "USD",
      compareAtAmount: 5500,
      status: "active",
    },
  });

  await prisma.inventory.upsert({
    where: { variantId: variant.id },
    update: { quantityOnHand: 50, quantityReserved: 0 },
    create: {
      storeId: store.id,
      variantId: variant.id,
      quantityOnHand: 50,
      quantityReserved: 0,
      lowStockThreshold: 5,
    },
  });

  console.log("Seed OK");
  console.log(`Demo login: ${demoEmail} / ${demoPassword}`);
  console.log(`Storefront slug: ${store.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
