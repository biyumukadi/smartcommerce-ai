import { MissingApiKeyError } from "./types";
import type { ProductAdContext } from "./product-context";
import { STRATEGY_BRIEF, type AdStrategyKind } from "./strategies";

export type VideoScriptPack = {
  durationSec: 15 | 30 | 60;
  aspectRatio: "9:16" | "1:1" | "16:9";
  strategy: AdStrategyKind;
  locale: "fr" | "en";
  hook: string;
  scenes: Array<{ t: string; line: string; onScreenText: string }>;
  subtitleTrack: string[];
  voiceoverScript: string;
  cta: string;
  hashtags: string[];
};

/**
 * Build structured video scripts from product facts (no media render).
 * Actual TTS/video render is fail-closed without provider keys.
 */
export function buildVideoScriptPack(input: {
  product: ProductAdContext;
  strategy: AdStrategyKind;
  durationSec: 15 | 30 | 60;
  aspectRatio: "9:16" | "1:1" | "16:9";
  locale: "fr" | "en";
}): VideoScriptPack {
  const brief = STRATEGY_BRIEF[input.strategy];
  const cta = input.locale === "en" ? brief.ctaEn : brief.ctaFr;
  const name = input.product.name;
  const price = input.product.priceLabel;
  const discount = input.product.discountPercent
    ? input.locale === "en"
      ? `${input.product.discountPercent}% off`
      : `−${input.product.discountPercent}%`
    : null;

  const hook =
    input.locale === "en"
      ? `${name} at ${price}${discount ? ` (${discount})` : ""} — ${input.product.storeName}`
      : `${name} à ${price}${discount ? ` (${discount})` : ""} — ${input.product.storeName}`;

  const beats =
    input.durationSec === 15
      ? [
          { t: "0-3s", line: hook, onScreenText: name },
          { t: "3-10s", line: `${price}${discount ? ` · ${discount}` : ""}`, onScreenText: price },
          { t: "10-15s", line: cta, onScreenText: cta },
        ]
      : input.durationSec === 30
        ? [
            { t: "0-5s", line: hook, onScreenText: name },
            {
              t: "5-15s",
              line:
                input.locale === "en"
                  ? `In stock: ${input.product.available}. Pay with card or Mobile Money.`
                  : `Stock: ${input.product.available}. Paiement carte ou Mobile Money.`,
              onScreenText: price,
            },
            {
              t: "15-25s",
              line: input.product.description.slice(0, 120) || name,
              onScreenText: discount || name,
            },
            { t: "25-30s", line: cta, onScreenText: cta },
          ]
        : [
            { t: "0-8s", line: hook, onScreenText: name },
            {
              t: "8-25s",
              line:
                input.locale === "en"
                  ? `Why ${input.product.storeName}: quality + local delivery.`
                  : `Pourquoi ${input.product.storeName}: qualité + livraison locale.`,
              onScreenText: input.product.storeName,
            },
            {
              t: "25-45s",
              line: `${price}${discount ? ` · ${discount}` : ""} · SKU ${input.product.sku}`,
              onScreenText: price,
            },
            {
              t: "45-55s",
              line: input.product.description.slice(0, 160) || name,
              onScreenText: name,
            },
            { t: "55-60s", line: cta, onScreenText: cta },
          ];

  const hashtags =
    input.locale === "en"
      ? ["SmartCommerce", "Promo", "ShopLocal", "Africa"]
      : ["SmartCommerce", "Promo", "RDC", "Kinshasa", "MobileMoney"];

  return {
    durationSec: input.durationSec,
    aspectRatio: input.aspectRatio,
    strategy: input.strategy,
    locale: input.locale,
    hook,
    scenes: beats,
    subtitleTrack: beats.map((b) => b.onScreenText),
    voiceoverScript: beats.map((b) => b.line).join(" "),
    cta,
    hashtags,
  };
}

export type VoiceoverResult = {
  status: "unavailable" | "failed";
  error: string;
  provider: string;
};

/** TTS render — fail-closed without keys (no fake audio success). */
export async function synthesizeVoiceover(_input: {
  text: string;
  locale: "fr" | "en";
}): Promise<VoiceoverResult> {
  const key = process.env.OPENAI_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new MissingApiKeyError(
      "tts",
      "OPENAI_API_KEY|ELEVENLABS_API_KEY",
    );
  }
  // Even with a key, we do not silently invent a file URL — Phase 6 hooks only.
  return {
    status: "unavailable",
    provider: process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "openai",
    error:
      "TTS provider key présente mais rendu audio non branché en Phase 6 — script/voiceover textuels disponibles, pas de faux fichier audio.",
  };
}

export async function renderVideoPlaceholder(_input: {
  script: VideoScriptPack;
}): Promise<{ status: "unavailable"; error: string }> {
  if (!process.env.VIDEO_RENDER_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new MissingApiKeyError("video_render", "VIDEO_RENDER_API_KEY");
  }
  return {
    status: "unavailable",
    error:
      "Rendu vidéo 15/30/60s non live sans VIDEO_RENDER_API_KEY opérationnel — scripts + sous-titres générés uniquement (pas de faux mp4).",
  };
}
