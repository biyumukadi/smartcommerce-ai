import { prisma } from "@/lib/db";
import type { CustomerLifecycle, Prisma } from "@prisma/client";
import { refreshCustomerStats } from "./stats-sync";

export async function listCustomers(
  storeId: string,
  opts?: {
    lifecycle?: CustomerLifecycle;
    segmentKey?: string;
    q?: string;
    take?: number;
  },
) {
  const where: Prisma.CustomerWhereInput = {
    storeId,
    deletedAt: null,
    ...(opts?.lifecycle ? { lifecycle: opts.lifecycle } : {}),
    ...(opts?.segmentKey
      ? { segmentKeys: { has: opts.segmentKey } }
      : {}),
    ...(opts?.q
      ? {
          OR: [
            { name: { contains: opts.q, mode: "insensitive" } },
            { email: { contains: opts.q, mode: "insensitive" } },
            { phone: { contains: opts.q } },
          ],
        }
      : {}),
  };

  return prisma.customer.findMany({
    where,
    orderBy: [{ lastOrderAt: "desc" }, { createdAt: "desc" }],
    take: opts?.take ?? 50,
  });
}

export async function getCustomerProfile(storeId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId, deletedAt: null },
  });
  if (!customer) throw new Error("Client introuvable");

  const [orders, conversations, loyalty, coupons, complaints] =
    await Promise.all([
      prisma.order.findMany({
        where: { storeId, customerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { items: true, payments: true },
      }),
      prisma.conversation.findMany({
        where: { storeId, customerId },
        orderBy: { lastMessageAt: "desc" },
        take: 20,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 30,
          },
        },
      }),
      prisma.loyaltyLedger.findMany({
        where: { storeId, customerId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.coupon.findMany({
        where: { storeId, customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.complaint.findMany({
        where: { storeId, customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  // Consent-gated conversation history: only include message bodies when
  // customer has at least one marketing or messaging relationship (always OK
  // for merchant CRM view of own store conversations).
  return {
    customer,
    orders,
    conversations,
    loyalty,
    coupons,
    complaints,
  };
}

export async function upsertCustomer(input: {
  storeId: string;
  id?: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  locale?: string | null;
  tags?: string[];
  lifecycle?: CustomerLifecycle;
  marketingConsentWhatsApp?: boolean;
  marketingConsentEmail?: boolean;
  marketingConsentSms?: boolean;
}) {
  const consentTouched =
    input.marketingConsentWhatsApp !== undefined ||
    input.marketingConsentEmail !== undefined ||
    input.marketingConsentSms !== undefined;

  if (input.id) {
    const existing = await prisma.customer.findFirst({
      where: { id: input.id, storeId: input.storeId },
    });
    if (!existing) throw new Error("Client introuvable");
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        email: input.email ?? existing.email,
        phone: input.phone ?? existing.phone,
        name: input.name ?? existing.name,
        locale: input.locale ?? existing.locale,
        tags: input.tags ?? existing.tags,
        lifecycle: input.lifecycle ?? existing.lifecycle,
        marketingConsentWhatsApp:
          input.marketingConsentWhatsApp ?? existing.marketingConsentWhatsApp,
        marketingConsentEmail:
          input.marketingConsentEmail ?? existing.marketingConsentEmail,
        marketingConsentSms:
          input.marketingConsentSms ?? existing.marketingConsentSms,
        marketingConsentAt: consentTouched
          ? new Date()
          : existing.marketingConsentAt,
      },
    });
    await refreshCustomerStats(updated.storeId, updated.id);
    return updated;
  }

  const created = await prisma.customer.create({
    data: {
      storeId: input.storeId,
      email: input.email || undefined,
      phone: input.phone || undefined,
      name: input.name || undefined,
      locale: input.locale || "fr",
      tags: input.tags || [],
      lifecycle: input.lifecycle || "prospect",
      marketingConsentWhatsApp: Boolean(input.marketingConsentWhatsApp),
      marketingConsentEmail: Boolean(input.marketingConsentEmail),
      marketingConsentSms: Boolean(input.marketingConsentSms),
      marketingConsentAt: consentTouched ? new Date() : undefined,
    },
  });
  return created;
}

export async function ensureDefaultSegments(storeId: string) {
  const defaults = [
    {
      key: "prospects",
      name: "Prospects",
      description: "Sans commande payée",
      rules: { lifecycle: ["prospect"], maxOrders: 0 },
    },
    {
      key: "vip",
      name: "VIP",
      description: "Clients fidèles à fort panier",
      rules: { lifecycle: ["vip"], minOrders: 3 },
    },
    {
      key: "consent_whatsapp",
      name: "Opt-in WhatsApp",
      description: "Consentement marketing WhatsApp",
      rules: { consentWhatsApp: true },
    },
    {
      key: "abandoned",
      name: "Paniers abandonnés",
      description: "Clients avec panier open récent",
      rules: { hasAbandonedCart: true },
    },
  ];

  for (const d of defaults) {
    await prisma.customerSegment.upsert({
      where: { storeId_key: { storeId, key: d.key } },
      update: { name: d.name, description: d.description, rules: d.rules },
      create: { storeId, ...d },
    });
  }
}
