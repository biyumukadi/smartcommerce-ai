import { afterEach, describe, expect, it } from "vitest";
import {
  getSocialProvider,
  prepareTikTokPromo,
  UnavailableSocialProvider,
} from "../src/lib/social";
import { mapUtmSource } from "../src/lib/social/attribution";
import {
  createOAuthState,
  parseOAuthState,
} from "../src/lib/social/connections";

describe("social providers fail-closed", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("meta without keys is unavailable", async () => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    const p = getSocialProvider("meta");
    expect(p.mode).toBe("unavailable");
    const oauth = p.getOAuthUrl({
      storeId: "s1",
      redirectUri: "http://localhost/cb",
      state: "x",
    });
    expect(oauth.status).toBe("unavailable");
    const pub = await p.publishPost({
      storeId: "s1",
      caption: "hi",
      confirmPublish: true,
      accessToken: "",
    });
    expect(pub.status).toBe("unavailable");
    expect(pub.status).not.toBe("published");
  });

  it("tiktok without keys is unavailable", async () => {
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
    const p = getSocialProvider("tiktok");
    expect(p).toBeInstanceOf(UnavailableSocialProvider);
    const ads = await p.launchAdsCampaign({
      accessToken: "",
      draft: { name: "t", budgetMinor: 1000, currency: "USD" },
      confirmSpend: true,
    });
    expect(ads.status).toBe("unavailable");
  });

  it("ads require confirmSpend", async () => {
    delete process.env.META_APP_ID;
    const p = getSocialProvider("meta");
    const res = await p.launchAdsCampaign({
      accessToken: "",
      draft: { name: "c", budgetMinor: 5000, currency: "USD" },
      confirmSpend: false,
    });
    expect(res.status).toBe("needs_confirmation");
  });

  it("meta oauth url when keys present", () => {
    process.env.META_APP_ID = "app123";
    process.env.META_APP_SECRET = "sec123";
    const p = getSocialProvider("meta");
    expect(p.mode).toBe("sandbox");
    const oauth = p.getOAuthUrl({
      storeId: "s1",
      redirectUri: "http://localhost/cb",
      state: "st",
    });
    expect(oauth.status).toBe("redirect");
    expect(oauth.url).toContain("facebook.com");
    expect(oauth.url).toContain("client_id=app123");
  });

  it("prepares tiktok vertical promo without publishing", () => {
    const prep = prepareTikTokPromo({
      productName: "Pagne",
      priceLabel: "25 USD",
      storeName: "Marché",
    });
    expect(prep.aspectRatio).toBe("9:16");
    expect(prep.hashtags.length).toBeGreaterThan(0);
    expect(prep.script).toContain("Pagne");
  });

  it("maps utm sources for attribution", () => {
    expect(mapUtmSource("instagram")).toBe("meta");
    expect(mapUtmSource("tiktok")).toBe("tiktok");
    expect(mapUtmSource(null)).toBe("direct");
  });

  it("round-trips oauth state", () => {
    const state = createOAuthState("store_1", "meta");
    const parsed = parseOAuthState(state);
    expect(parsed.storeId).toBe("store_1");
    expect(parsed.platform).toBe("meta");
  });
});
