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
import { listSocialCatalog } from "@/lib/social";

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
  const social = listSocialCatalog();

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
      social: {
        providers: social.map((p) => ({
          id: p.id,
          mode: p.mode,
          available: p.available,
          oauthReady: p.oauthReady,
          adsApi: p.adsApi,
          requiresApproval: p.requiresApproval,
        })),
      },
      ai: aiProviderStatus(),
      crm: {
        modules: [
          "customers",
          "segments",
          "loyalty",
          "coupons",
          "complaints",
          "consent_campaigns",
        ],
        analyticsAssistant: process.env.OPENAI_API_KEY
          ? "openai"
          : "heuristic_fallback (no LLM key)",
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
