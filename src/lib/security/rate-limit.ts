import { getRedis } from "@/lib/redis";

type Bucket = { count: number; resetAt: number };
const memory = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Sliding fixed-window rate limit. Uses Redis when available, else memory.
 */
export async function rateLimit(input: {
  key: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = input.windowSec * 1000;

  try {
    const redis = getRedis();
    const redisKey = `rl:${input.key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.pexpire(redisKey, windowMs);
    const ttl = await redis.pttl(redisKey);
    const resetAt = now + (ttl > 0 ? ttl : windowMs);
    return {
      allowed: count <= input.limit,
      remaining: Math.max(0, input.limit - count),
      resetAt,
    };
  } catch {
    const bucket = memory.get(input.key);
    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + windowMs;
      memory.set(input.key, { count: 1, resetAt });
      return { allowed: true, remaining: input.limit - 1, resetAt };
    }
    bucket.count += 1;
    memory.set(input.key, bucket);
    return {
      allowed: bucket.count <= input.limit,
      remaining: Math.max(0, input.limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }
}

export async function assertRateLimit(input: {
  key: string;
  limit: number;
  windowSec: number;
}) {
  const result = await rateLimit(input);
  if (!result.allowed) {
    const err = new Error("Trop de requêtes — réessayez plus tard");
    (err as Error & { status: number }).status = 429;
    throw err;
  }
  return result;
}
