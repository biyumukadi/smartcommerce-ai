import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ApiError, jsonError, jsonOk, withRequestId } from "@/lib/api";
import { createOrganizationWithStore } from "@/lib/commerce/org";

const schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  organizationName: z.string().min(2).max(120),
  storeName: z.string().min(2).max(120),
  currency: z.enum(["USD", "CDF", "EUR"]).default("USD"),
  locale: z.enum(["fr", "en"]).default("fr"),
});

export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return jsonError(new ApiError(409, "Email déjà utilisé"), {
        requestId: rid,
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash,
        locale: body.locale,
        preferredCurrency: body.currency,
      },
    });

    const { organization, store } = await createOrganizationWithStore({
      userId: user.id,
      organizationName: body.organizationName,
      storeName: body.storeName,
      currency: body.currency,
      locale: body.locale,
    });

    return jsonOk(
      {
        userId: user.id,
        organizationId: organization.id,
        storeId: store.id,
        storeSlug: store.slug,
      },
      { status: 201, requestId: rid },
    );
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
