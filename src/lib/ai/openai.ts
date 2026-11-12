import {
  ImageGenInput,
  ImageGenProvider,
  ImageGenResult,
  MissingApiKeyError,
  TextGenInput,
  TextGenProvider,
  TextGenResult,
} from "./types";

export class OpenAITextProvider implements TextGenProvider {
  id = "openai";

  constructor(private apiKey = process.env.OPENAI_API_KEY) {}

  async generateText(input: TextGenInput): Promise<TextGenResult> {
    if (!this.apiKey) throw new MissingApiKeyError("openai", "OPENAI_API_KEY");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              input.system ||
              `Tu es un copywriter pub ecommerce Africa/RDC. Réponds en ${input.locale}.`,
          },
          { role: "user", content: input.prompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI text error: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { total_tokens?: number };
    };

    return {
      text: data.choices[0]?.message?.content?.trim() || "",
      provider: this.id,
      usageTokens: data.usage?.total_tokens ?? 0,
    };
  }
}

export class OpenAIImageProvider implements ImageGenProvider {
  id = "openai";

  constructor(private apiKey = process.env.OPENAI_API_KEY) {}

  async generateImage(input: ImageGenInput): Promise<ImageGenResult> {
    if (!this.apiKey) throw new MissingApiKeyError("openai", "OPENAI_API_KEY");

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: input.prompt,
        size: input.size || "1024x1024",
        response_format: "b64_json",
        n: 1,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI image error: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      data: { b64_json?: string; url?: string }[];
    };

    return {
      imageBase64: data.data[0]?.b64_json,
      imageUrl: data.data[0]?.url,
      provider: this.id,
      usageTokens: 1,
    };
  }
}

/** Fail-closed noop when keys are absent */
export class NoopTextProvider implements TextGenProvider {
  id = "noop";
  async generateText(_input: TextGenInput): Promise<TextGenResult> {
    throw new MissingApiKeyError("openai", "OPENAI_API_KEY");
  }
}

export class NoopImageProvider implements ImageGenProvider {
  id = "noop";
  async generateImage(_input: ImageGenInput): Promise<ImageGenResult> {
    throw new MissingApiKeyError("openai", "OPENAI_API_KEY");
  }
}
