import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pingRedis } from "@/lib/redis";
import { aiProviderStatus } from "@/lib/ai";
import {
  getPaymentProvider,
  listProviderCatalog,
  resolveDefaultAggregator,
} from "@/lib/payments";

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
      ai: aiProviderStatus(),
      social: {
        meta: "stub — needs credentials",
        tiktok: "stub — needs credentials",
        whatsapp: "stub CTA only — Cloud API not live",
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
