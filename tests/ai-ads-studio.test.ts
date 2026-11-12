import { afterEach, describe, expect, it } from "vitest";
import {
  AD_FORMATS,
  AD_STRATEGIES,
  CREDIT_COSTS,
} from "../src/lib/ai/strategies";
import { creditCostFor } from "../src/lib/ai/credits";
import {
  buildVideoScriptPack,
  renderVideoPlaceholder,
  synthesizeVoiceover,
} from "../src/lib/ai/video";
import { MissingApiKeyError } from "../src/lib/ai/types";
import { aiProviderStatus } from "../src/lib/ai";
import type { ProductAdContext } from "../src/lib/ai/product-context";

const sampleProduct: ProductAdContext = {
  productId: "p1",
  name: "Écouteurs Pro",
  description: "Son clair, livraison Kinshasa",
  slug: "ecouteurs-pro",
  variantId: "v1",
  sku: "EAR-01",
  priceMinor: 25000,
  compareAtMinor: 35000,
  discountPercent: 29,
  currency: "CDF",
  priceLabel: "25 000 CDF",
  available: 12,
  storeName: "Boutique Demo",
  storeCurrency: "CDF",
};

describe("AI Ads Studio Phase 6", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("exposes three strategies and multi-format visuals", () => {
    expect(AD_STRATEGIES).toEqual(["sales", "acquisition", "brand"]);
    expect(AD_FORMATS.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        "ig_feed_1x1",
        "ig_story_9x16",
        "fb_feed",
        "wa_status",
        "tiktok_9x16",
        "banner_16x9",
      ]),
    );
    expect(CREDIT_COSTS.ad_copy_pack).toBeGreaterThan(0);
    expect(creditCostFor("ad_video_script")).toBe(6);
  });

  it("builds FR/EN video scripts for 15/30/60 and aspect ratios", () => {
    for (const durationSec of [15, 30, 60] as const) {
      for (const aspectRatio of ["9:16", "1:1", "16:9"] as const) {
        const pack = buildVideoScriptPack({
          product: sampleProduct,
          strategy: "sales",
          durationSec,
          aspectRatio,
          locale: "fr",
        });
        expect(pack.durationSec).toBe(durationSec);
        expect(pack.aspectRatio).toBe(aspectRatio);
        expect(pack.hook).toContain("Écouteurs Pro");
        expect(pack.subtitleTrack.length).toBeGreaterThan(0);
        expect(pack.voiceoverScript.length).toBeGreaterThan(10);
        expect(pack.cta).toBeTruthy();
      }
    }
    const en = buildVideoScriptPack({
      product: sampleProduct,
      strategy: "brand",
      durationSec: 30,
      aspectRatio: "1:1",
      locale: "en",
    });
    expect(en.cta).toMatch(/Learn more|Order|Discover/i);
  });

  it("TTS fails closed without keys", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    await expect(
      synthesizeVoiceover({ text: "Bonjour", locale: "fr" }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("TTS with key still does not fake audio success", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const res = await synthesizeVoiceover({ text: "Hello", locale: "en" });
    expect(res.status).toBe("unavailable");
    expect(res.error).toMatch(/pas de faux fichier audio/i);
  });

  it("video render fails closed without VIDEO_RENDER_API_KEY and OPENAI", async () => {
    delete process.env.VIDEO_RENDER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await expect(
      renderVideoPlaceholder({
        script: buildVideoScriptPack({
          product: sampleProduct,
          strategy: "acquisition",
          durationSec: 15,
          aspectRatio: "9:16",
          locale: "fr",
        }),
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("video render with key does not invent mp4 success", async () => {
    process.env.VIDEO_RENDER_API_KEY = "vr-test";
    const res = await renderVideoPlaceholder({
      script: buildVideoScriptPack({
        product: sampleProduct,
        strategy: "sales",
        durationSec: 15,
        aspectRatio: "9:16",
        locale: "fr",
      }),
    });
    expect(res.status).toBe("unavailable");
    expect(res.error).toMatch(/pas de faux mp4/i);
  });

  it("aiProviderStatus reports fail-closed video/tts", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.VIDEO_RENDER_API_KEY;
    const s = aiProviderStatus();
    expect(s.live).toBe(false);
    expect(s.ttsLive).toBe(false);
    expect(s.videoLive).toBe(false);
    expect(s.text).toMatch(/noop/i);
  });
});
