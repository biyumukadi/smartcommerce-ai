import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  auditRbacRoles,
  beginMfaSetup,
  confirmMfaSetup,
  generateTotpSecret,
  listFrontendSafeEnv,
  rateLimit,
  requestPrivacyDelete,
  requestPrivacyExport,
  scrubSecrets,
  verifyTotp,
  webhookAuditSummary,
  writeAuditLog,
} from "../src/lib/security";
import { createHmac } from "crypto";

const prisma = new PrismaClient();

function currentTotp(secretBase32: string): string {
  // reuse verify window by generating via same algo as mfa module through trial
  // Import hotp indirectly: try codes for current counter from verifyTotp by brute? 
  // Instead re-implement minimal HOTP matching mfa.ts
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secretBase32.replace(/=+$/, "").toUpperCase();
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
  const secret = Buffer.from(out);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

describe("Security Phase 8", () => {
  const env = { ...process.env };
  let userId = "";

  afterEach(() => {
    process.env = { ...env };
  });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const user = await prisma.user.create({
      data: {
        email: `sec-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash("Test1234!", 10),
        name: "Sec Tester",
      },
    });
    userId = user.id;
  });

  it("TOTP generate/verify roundtrip", () => {
    const secret = generateTotpSecret();
    const token = currentTotp(secret);
    expect(verifyTotp(secret, token)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("enables MFA after confirm", async () => {
    const setup = await beginMfaSetup(userId);
    const token = currentTotp(setup.secret);
    const user = await confirmMfaSetup(userId, token);
    expect(user.mfaEnabled).toBe(true);
  });

  it("rate limits after threshold", async () => {
    const key = `test:${Date.now()}`;
    let blocked = false;
    for (let i = 0; i < 6; i++) {
      const r = await rateLimit({ key, limit: 5, windowSec: 60 });
      if (!r.allowed) blocked = true;
    }
    expect(blocked).toBe(true);
  });

  it("scrubs secrets from payloads and frontend env", () => {
    const scrubbed = scrubSecrets({
      OPENAI_API_KEY: "sk-xxx",
      hello: "world",
    });
    expect(scrubbed.OPENAI_API_KEY).toBeUndefined();
    expect(scrubbed.hello).toBe("world");
    const front = listFrontendSafeEnv();
    expect(JSON.stringify(front)).not.toMatch(/sk-|SECRET|TOKEN/);
  });

  it("audits webhooks as signature-verified", () => {
    const summary = webhookAuditSummary();
    expect(summary.total).toBeGreaterThanOrEqual(4);
    expect(summary.allVerified).toBe(true);
  });

  it("privacy export + delete confirm gate", async () => {
    const exp = await requestPrivacyExport({ userId });
    expect(exp.payload.user.email).toBeTruthy();
    await writeAuditLog({
      actorUserId: userId,
      action: "test.audit",
      entityType: "User",
      entityId: userId,
    });

    const needs = await requestPrivacyDelete({
      userId,
      confirm: false,
    });
    expect(needs.status).toBe("needs_confirmation");

    // separate user for delete so MFA user stays
    const doomed = await prisma.user.create({
      data: {
        email: `doom-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash("x", 10),
      },
    });
    const del = await requestPrivacyDelete({
      userId: doomed.id,
      confirm: true,
    });
    expect(del.status).toBe("completed");
  });

  it("RBAC matrix audit runs", async () => {
    // ensure roles exist from other tests/seed patterns
    await prisma.role.upsert({
      where: { code: "STORE_VIEWER" },
      update: {},
      create: {
        code: "STORE_VIEWER",
        name: "Store Viewer",
        scope: "store",
        permissions: ["orders:read", "products:read", "stats:read"],
      },
    });
    const audit = await auditRbacRoles();
    expect(audit.length).toBeGreaterThan(0);
  });
});
