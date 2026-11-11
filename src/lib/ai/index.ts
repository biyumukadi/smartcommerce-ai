import {
  NoopImageProvider,
  NoopTextProvider,
  OpenAIImageProvider,
  OpenAITextProvider,
} from "./openai";
import type { ImageGenProvider, TextGenProvider } from "./types";

export * from "./types";

export function getTextProvider(): TextGenProvider {
  if (process.env.OPENAI_API_KEY) return new OpenAITextProvider();
  return new NoopTextProvider();
}

export function getImageProvider(): ImageGenProvider {
  if (process.env.OPENAI_API_KEY) return new OpenAIImageProvider();
  return new NoopImageProvider();
}

export function aiProviderStatus() {
  return {
    text: process.env.OPENAI_API_KEY ? "openai" : "noop (clé manquante)",
    image: process.env.OPENAI_API_KEY ? "openai" : "noop (clé manquante)",
    live: Boolean(process.env.OPENAI_API_KEY),
  };
}
