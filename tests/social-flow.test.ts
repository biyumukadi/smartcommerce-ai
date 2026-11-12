import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { syncOrExportCatalog } from "../src/lib/social/catalog";
import { createSocialPostDraft } from "../src/lib/social/posts";
import {
  createAdsCampaignDraft,
  launchAdsCampaign,
} from "../src/lib/social/ads";
import {
  recordAttributionEvent,
  summarizeAttribution,
} from "../src/lib/social/attribution";
import {
  encryptCredentials,
  decryptCredentials,
} from "../src/lib/crypto/credentials";
import { ensureOrgAndStoreRoles } from "./helpers/ensure-basics";

const prisma = new PrismaClient();

describe("social flow (DB)", () => {
  let storeId = "";

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_ADS_ELIGIBLE;

    await ensureOrgAndStoreRoles(prisma);

    const user = await prisma.user.create({
      data: {
        email: `social-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash("Test1234!", 10),
        name: "Social Tester",
      },
    });
    const org = await prisma.organization.create({
      data: {
        name: "Social Org",
        slug: `social-org-${Date.now()}`,
        members: {
          create: {
            userId: user.id,
            roleId: (
              await prisma.role.findUniqueOrThrow({ where: { code: "ORG_OWNER" } })
            ).id,
          },
        },
      },
    });
    const store = await prisma.store.create({
      data: {
        organizationId: org.id,
        name: "Social Store",
        slug: `social-store-${Date.now()}`,
        currency: "USD",
        status: "live",
        members: {
          create: {
            userId: user.id,
            roleId: (
              await prisma.role.findUniqueOrThrow({
                where: { code: "STORE_OWNER" },
              })
            ).id,
            status: "active",
          },
        },
      },
    });
    storeId = store.id;

    await prisma.product.create({
      data: {
        storeId,
        name: { fr: "Crème", en: "Cream" },
        slug: `creme-${Date.now()}`,
        status: "active",
        variants: {
          create: {
            storeId,
            sku: `SOC-${Date.now()}`,
            priceAmount: 1200,
            currency: "USD",
            status: "active",
            inventory: {
              create: {
                storeId,
                quantityOnHand: 4,
                quantityReserved: 0,
              },
            },
          },
        },
      },
    });
  });

  it("encrypts social credentials", () => {
    const blob = encryptCredentials(JSON.stringify({ accessToken: "tok" }));
    expect(blob.startsWith("v1.")).toBe(true);
    expect(JSON.parse(decryptCredentials(blob)).accessToken).toBe("tok");
  });

  it("exports catalog when Meta API unavailable", async () => {
    const { result, export: row } = await syncOrExportCatalog({
      storeId,
      platform: "meta",
    });
    expect(["exported", "unavailable", "failed"]).toContain(result.status);
    expect(result.status).not.toBe("synced");
    expect(row.storeId).toBe(storeId);
  });

  it("keeps posts as draft without confirmPublish", async () => {
    const { post, publish } = await createSocialPostDraft({
      storeId,
      platform: "meta",
      caption: "Promo test",
      confirmPublish: false,
    });
    expect(publish.status).toBe("draft");
    expect(post.status).toBe("draft");
  });

  it("publish without connection is unavailable (no fake success)", async () => {
    const { post, publish } = await createSocialPostDraft({
      storeId,
      platform: "tiktok",
      caption: "Video promo",
      productName: "Crème",
      priceLabel: "12 USD",
      confirmPublish: true,
    });
    expect(publish.status).toBe("unavailable");
    expect(post.status).toBe("unavailable");
    expect(publish.status).not.toBe("published");
  });

  it("ads launch without confirmSpend stays gated", async () => {
    const campaign = await createAdsCampaignDraft({
      storeId,
      platform: "meta",
      name: "Test Ads",
      budgetMinor: 5000,
      currency: "USD",
    });
    const { launch } = await launchAdsCampaign({
      storeId,
      campaignId: campaign.id,
      platform: "meta",
      confirmSpend: false,
    });
    expect(launch.status).toBe("needs_confirmation");
  });

  it("records attribution events for the store", async () => {
    await recordAttributionEvent({
      storeId,
      source: "instagram",
      medium: "cpc",
      campaign: "spring",
      path: "/fr/s/demo",
    });
    const summary = await summarizeAttribution(storeId);
    expect(summary.some((s) => s.source === "meta" && s.count >= 1)).toBe(true);
  });
});
