import {
  NoopImageProvider,
  NoopTextProvider,
  OpenAIImageProvider,
  OpenAITextProvider,
} from "./openai";
import type { ImageGenProvider, TextGenProvider } from "./types";

export function getTextProvider(): TextGenProvider {
  if (process.env.OPENAI_API_KEY) return new OpenAITextProvider();
  return new NoopTextProvider();
}

export function getImageProvider(): ImageGenProvider {
  if (process.env.OPENAI_API_KEY) return new OpenAIImageProvider();
  return new NoopImageProvider();
}
