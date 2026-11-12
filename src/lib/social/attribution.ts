import { prisma } from "@/lib/db";
import type { AttributionSource } from "@prisma/client";

const UTM_SOURCE_MAP: Record<string, AttributionSource> = {
  facebook: "meta",
  fb: "meta",
  ig: "meta",
  instagram: "meta",
  meta: "meta",
  tiktok: "tiktok",
  tt: "tiktok",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  organic: "organic",
};

export function mapUtmSource(raw?: string | null): AttributionSource {
  if (!raw) return "direct";
  return UTM_SOURCE_MAP[raw.toLowerCase()] || "other";
}

export async function recordAttributionEvent(input: {
  storeId: string;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  clickId?: string | null;
  sessionId?: string | null;
  orderId?: string | null;
  path?: string | null;
  metadata?: object;
}) {
  return prisma.attributionEvent.create({
    data: {
      storeId: input.storeId,
      source: mapUtmSource(input.source),
      medium: input.medium || undefined,
      campaign: input.campaign || undefined,
      content: input.content || undefined,
      term: input.term || undefined,
      clickId: input.clickId || undefined,
      sessionId: input.sessionId || undefined,
      orderId: input.orderId || undefined,
      path: input.path || undefined,
      metadata: input.metadata || undefined,
    },
  });
}

export async function summarizeAttribution(storeId: string) {
  const events = await prisma.attributionEvent.groupBy({
    by: ["source"],
    where: { storeId },
    _count: { _all: true },
  });
  return events.map((e) => ({ source: e.source, count: e._count._all }));
}

/** Attach attribution from checkout cookies/UTM to an order */
export async function attachOrderAttribution(input: {
  storeId: string;
  orderId: string;
  sessionId?: string | null;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
    clickId?: string;
  };
}) {
  if (!input.utm?.source && !input.sessionId) return null;
  return recordAttributionEvent({
    storeId: input.storeId,
    orderId: input.orderId,
    sessionId: input.sessionId,
    source: input.utm?.source,
    medium: input.utm?.medium,
    campaign: input.utm?.campaign,
    content: input.utm?.content,
    term: input.utm?.term,
    clickId: input.utm?.clickId,
    path: "checkout",
  });
}
