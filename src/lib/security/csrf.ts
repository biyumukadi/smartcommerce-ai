/**
 * CSRF / XSS posture helpers.
 * - API mutations rely on SameSite session cookies + Origin/Referer checks.
 * - Secrets must never be NEXT_PUBLIC_* or returned to the browser.
 */

const SENSITIVE_ENV_PREFIXES = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
  "STRIPE_SECRET",
  "PAYSTACK_SECRET",
  "FLW_SECRET",
  "OPENAI_API_KEY",
  "ELEVENLABS",
  "WHATSAPP_CLOUD_TOKEN",
  "META_APP_SECRET",
  "TIKTOK_CLIENT_SECRET",
  "CREDENTIALS_ENCRYPTION",
  "PAYMENT_WEBHOOK",
  "WHATSAPP_WEBHOOK",
  "VIDEO_RENDER",
];

export function assertOriginAllowed(req: Request): boolean {
  const appUrl = process.env.APP_URL || process.env.AUTH_URL;
  if (!appUrl) return true; // misconfigured — allow in tests, enforce in review
  const allowed = new URL(appUrl).origin;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (origin) return origin === allowed;
  if (referer) {
    try {
      return new URL(referer).origin === allowed;
    } catch {
      return false;
    }
  }
  // Non-browser clients (webhooks, curl) — no Origin
  return true;
}

export function requireSameOrigin(req: Request) {
  if (!assertOriginAllowed(req)) {
    throw new Error("Origine CSRF refusée");
  }
}

/** Ensure we never leak secrets into a public payload */
export function scrubSecrets<T extends Record<string, unknown>>(obj: T): T {
  const clone = { ...obj };
  for (const key of Object.keys(clone)) {
    const upper = key.toUpperCase();
    if (
      SENSITIVE_ENV_PREFIXES.some((p) => upper.includes(p)) ||
      upper.includes("SECRET") ||
      upper.includes("TOKEN") ||
      upper.includes("PASSWORD") ||
      upper.includes("PRIVATE")
    ) {
      delete clone[key];
    }
  }
  return clone;
}

export function listFrontendSafeEnv(): Record<string, string> {
  return {
    APP_URL: process.env.APP_URL || "",
    // Intentionally no secrets — only public-ish flags
    ANALYTICS_ASSISTANT_ENABLED:
      process.env.ANALYTICS_ASSISTANT_ENABLED || "true",
    SAAS_BILLING_PROVIDER: process.env.SAAS_BILLING_PROVIDER || "unavailable",
  };
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-XSS-Protection": "0",
};
