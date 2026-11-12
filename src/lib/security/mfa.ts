import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { encryptCredentials, decryptCredentials } from "@/lib/crypto/credentials";
import { writeAuditLog } from "./audit";

/** Base32 encode */
function base32Encode(buf: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of cleaned) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const str = String(code % 10 ** digits);
  return str.padStart(digits, "0");
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function verifyTotp(secretBase32: string, token: string, window = 1): boolean {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const normalized = token.replace(/\s/g, "");
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, counter + w);
    const a = Buffer.from(expected);
    const b = Buffer.from(normalized.padStart(6, "0").slice(0, 6));
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function totpOtpauthUrl(input: {
  email: string;
  secret: string;
  issuer?: string;
}) {
  const issuer = encodeURIComponent(input.issuer || "SmartCommerce AI");
  const label = encodeURIComponent(input.email);
  return `otpauth://totp/${issuer}:${label}?secret=${input.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export async function beginMfaSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaSecretEncrypted: encryptCredentials(JSON.stringify({ secret })),
      mfaEnabled: false,
      mfaVerifiedAt: null,
    },
  });
  return {
    secret,
    otpauthUrl: totpOtpauthUrl({ email: user.email, secret }),
  };
}

export async function confirmMfaSetup(userId: string, token: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaSecretEncrypted) throw new Error("MFA non initialisé");
  const { secret } = JSON.parse(decryptCredentials(user.mfaSecretEncrypted)) as {
    secret: string;
  };
  if (!verifyTotp(secret, token)) {
    throw new Error("Code MFA invalide");
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true, mfaVerifiedAt: new Date() },
  });
  await writeAuditLog({
    actorUserId: userId,
    action: "security.mfa_enabled",
    entityType: "User",
    entityId: userId,
  });
  return updated;
}

export async function verifyUserMfa(userId: string, token: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
    throw new Error("MFA non activé");
  }
  const { secret } = JSON.parse(
    decryptCredentials(user.mfaSecretEncrypted),
  ) as { secret: string };
  if (!verifyTotp(secret, token)) {
    await writeAuditLog({
      actorUserId: userId,
      action: "security.mfa_failed",
      entityType: "User",
      entityId: userId,
    });
    throw new Error("Code MFA invalide");
  }
  return true;
}

/** Roles that should enable MFA (soft requirement when MFA_REQUIRED=true) */
export const MFA_SENSITIVE_ROLES = [
  "PLATFORM_ADMIN",
  "ORG_OWNER",
  "STORE_OWNER",
] as const;

export function mfaRequiredByPolicy() {
  return process.env.MFA_REQUIRED === "true";
}
