import { describe, expect, it } from "vitest";
import { NoopImageProvider, NoopTextProvider } from "../src/lib/ai/openai";
import { MissingApiKeyError } from "../src/lib/ai/types";

describe("AI fail-closed providers", () => {
  it("noop text throws MissingApiKeyError", async () => {
    const p = new NoopTextProvider();
    await expect(
      p.generateText({ prompt: "test", locale: "fr" }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("noop image throws MissingApiKeyError", async () => {
    const p = new NoopImageProvider();
    await expect(p.generateImage({ prompt: "test" })).rejects.toBeInstanceOf(
      MissingApiKeyError,
    );
  });
});
