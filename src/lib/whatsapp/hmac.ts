import { createHmac, timingSafeEqual } from "crypto";

export function signHmacSha256(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyMetaAppSecretSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = signHmacSha256(rawBody, appSecret);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
