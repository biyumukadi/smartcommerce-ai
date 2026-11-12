import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { getUserMemberships } from "@/lib/tenant";
import { createOrganizationWithStore } from "@/lib/commerce/org";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

export async function GET() {
  const rid = withRequestId();
  try {
    const session = await requireSession();
    const { storeMembers, orgMembers } = await getUserMemberships(
      session.user.id,
    );
    return jsonOk(
      {
        stores: storeMembers.map((m) => ({
          id: m.store.id,
          name: m.store.name,
          slug: m.store.slug,
          currency: m.store.currency,
          status: m.store.status,
          organizationId: m.store.organizationId,
          role: m.role.code,
        })),
        organizations: orgMembers.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          role: m.role.code,
        })),
      },
      { requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}

const createSchema = z.object({
  organizationId: z.string().optional(),
  organizationName: z.string().min(2).optional(),
  storeName: z.string().min(2),
  currency: z.enum(["USD", "CDF", "EUR"]).default("USD"),
});

export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    const session = await requireSession();
    const body = createSchema.parse(await req.json());

    if (!body.organizationId) {
      const result = await createOrganizationWithStore({
        userId: session.user.id,
        organizationName: body.organizationName || body.storeName,
        storeName: body.storeName,
        currency: body.currency,
      });
      return jsonOk(result, { status: 201, requestId: rid });
    }

    const orgMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: body.organizationId,
          userId: session.user.id,
        },
      },
      include: { role: true },
    });
    if (!orgMember) {
      throw new Error("Organisation inaccessible");
    }

    const storeOwner = await prisma.role.findUniqueOrThrow({
      where: { code: "STORE_OWNER" },
    });
    let slug = slugify(body.storeName) || "store";
    let i = 1;
    while (
      await prisma.store.findUnique({
        where: {
          organizationId_slug: {
            organizationId: body.organizationId,
            slug,
          },
        },
      })
    ) {
      slug = `${slugify(body.storeName)}-${i++}`;
    }

    const store = await prisma.store.create({
      data: {
        organizationId: body.organizationId,
        name: body.storeName,
        slug,
        currency: body.currency,
        status: "live",
        supportedCurrencies: ["USD", "CDF", "EUR"],
        locales: ["fr", "en"],
      },
    });

    await prisma.storeMember.create({
      data: {
        storeId: store.id,
        userId: session.user.id,
        roleId: storeOwner.id,
        status: "active",
      },
    });

    return jsonOk({ store }, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
