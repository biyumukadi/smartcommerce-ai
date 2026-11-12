import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pingRedis } from "@/lib/redis";
import { aiProviderStatus } from "@/lib/ai";
import {
  getPaymentProvider,
  listProviderCatalog,
  resolveDefaultAggregator,
} from "@/lib/payments";
import { getWhatsAppProvider, listWhatsAppCatalog } from "@/lib/whatsapp";

export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  const redis = await pingRedis();
  const healthy = db && redis;
  const active = getPaymentProvider();
  const catalog = listProviderCatalog();
  const wa = getWhatsAppProvider().describe();

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      db,
      redis,
      payments: {
        default: resolveDefaultAggregator(),
        active: {
          id: active.id,
          mode: active.mode,
          available: active.mode !== "unavailable",
          currencies: active.supportedCurrencies,
          operators: active.supportedOperators,
          refundsSupported: active.refundsSupported,
        },
        catalog: catalog.map((p) => ({
          id: p.id,
          mode: p.mode,
          available: p.available,
          requiresContract: p.requiresContract,
        })),
      },
      whatsapp: {
        active: wa,
        catalog: listWhatsAppCatalog().map((p) => ({
          id: p.id,
          mode: p.mode,
          available: p.available,
          requiresMetaApproval: p.requiresMetaApproval,
        })),
      },
      ai: aiProviderStatus(),
      social: {
        meta: "stub — needs credentials (Phase 5 ads)",
        tiktok: "stub — needs credentials (Phase 5)",
        whatsapp: wa.available
          ? `${wa.id}/${wa.mode}`
          : "Cloud API unavailable without token — mock/dev or configure keys",
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
