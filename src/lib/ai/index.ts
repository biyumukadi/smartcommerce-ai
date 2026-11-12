import { getImageProvider, getTextProvider } from "./openai-factory";

export * from "./types";
export { AD_STRATEGIES, AD_FORMATS, CREDIT_COSTS } from "./strategies";
export type { AdStrategyKind, AdFormatId } from "./strategies";
export { CreditsExceededError, getOrCreateUsage } from "./credits";
export { loadProductAdContext } from "./product-context";
export { generateCopyPack } from "./copy-pack";
export {
  buildVideoScriptPack,
  synthesizeVoiceover,
  renderVideoPlaceholder,
} from "./video";
export { getTextProvider, getImageProvider };

export function aiProviderStatus() {
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const tts = Boolean(
    process.env.ELEVENLABS_API_KEY || process.env.OPENAI_API_KEY,
  );
  const video = Boolean(process.env.VIDEO_RENDER_API_KEY);
  return {
    text: openai ? "openai" : "noop (clé manquante)",
    image: openai ? "openai" : "noop (clé manquante)",
    videoScript: "local script engine",
    voiceover: tts
      ? process.env.ELEVENLABS_API_KEY
        ? "elevenlabs (hook)"
        : "openai (hook)"
      : "noop (clé TTS manquante)",
    videoRender: video
      ? "video_render (hook)"
      : "noop (VIDEO_RENDER_API_KEY manquante)",
    live: openai,
    ttsLive: false, // Phase 6: hooks only, no fake audio success
    videoLive: false,
  };
}
