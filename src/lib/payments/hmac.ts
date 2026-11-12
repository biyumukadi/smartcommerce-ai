import { createHmac, timingSafeEqual } from "crypto";

export function signHmacSha256(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyHmacSha256(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const provided = signature.replace(/^sha256=/i, "").trim();
  const expected = signHmacSha256(payload, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
