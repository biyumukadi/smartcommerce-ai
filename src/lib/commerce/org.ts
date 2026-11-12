import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

export async function createOrganizationWithStore(input: {
  userId: string;
  organizationName: string;
  storeName: string;
  currency?: string;
  locale?: string;
}) {
  const orgSlugBase = slugify(input.organizationName) || "org";
  const storeSlugBase = slugify(input.storeName) || "store";

  let orgSlug = orgSlugBase;
  let i = 1;
  while (await prisma.organization.findUnique({ where: { slug: orgSlug } })) {
    orgSlug = `${orgSlugBase}-${i++}`;
  }

  const orgOwner = await prisma.role.findUniqueOrThrow({
    where: { code: "ORG_OWNER" },
  });
  const storeOwner = await prisma.role.findUniqueOrThrow({
    where: { code: "STORE_OWNER" },
  });
  const trial = await prisma.plan.findUniqueOrThrow({ where: { code: "trial" } });

  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug: orgSlug,
        country: "CD",
        defaultCurrency: input.currency || "USD",
        defaultLocale: input.locale || "fr",
      },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: input.userId,
        roleId: orgOwner.id,
      },
    });

    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        planId: trial.id,
        status: "trialing",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    });

    let storeSlug = storeSlugBase;
    let j = 1;
    while (
      await tx.store.findUnique({
        where: {
          organizationId_slug: {
            organizationId: organization.id,
            slug: storeSlug,
          },
        },
      })
    ) {
      storeSlug = `${storeSlugBase}-${j++}`;
    }

    const store = await tx.store.create({
      data: {
        organizationId: organization.id,
        name: input.storeName,
        slug: storeSlug,
        currency: input.currency || "USD",
        supportedCurrencies: ["USD", "CDF", "EUR"],
        locales: ["fr", "en"],
        status: "live",
        timezone: "Africa/Kinshasa",
        settings: {
          whatsappCta: null,
          paymentMode: process.env.PAYMENT_PROVIDER || "mock",
        },
      },
    });

    await tx.storeMember.create({
      data: {
        storeId: store.id,
        userId: input.userId,
        roleId: storeOwner.id,
        status: "active",
      },
    });

    return { organization, store };
  });
}
