import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    globalForRedis.redis = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return globalForRedis.redis;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") {
      await redis.connect();
    }
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
