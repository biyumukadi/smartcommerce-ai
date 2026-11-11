import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pingRedis } from "@/lib/redis";
import { aiProviderStatus } from "@/lib/ai";

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

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      db,
      redis,
      payments: {
        provider: process.env.PAYMENT_PROVIDER || "mock",
        mode: process.env.PAYMENT_PROVIDER === "stripe" ? "sandbox-if-keyed" : "mock",
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
