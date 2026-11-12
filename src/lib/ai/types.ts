export type TextGenInput = {
  prompt: string;
  locale: "fr" | "en";
  system?: string;
};

export type TextGenResult = {
  text: string;
  provider: string;
  usageTokens: number;
};

export type ImageGenInput = {
  prompt: string;
  size?: "1024x1024" | "1792x1024" | "1024x1792" | "512x512";
  /** Optional overlay hints — provider may ignore; we store separately */
  overlays?: {
    priceLabel?: string;
    discountPercent?: number | null;
    productName?: string;
  };
};

export type ImageGenResult = {
  /** base64 PNG without data URL prefix, or remote URL */
  imageBase64?: string;
  imageUrl?: string;
  provider: string;
  usageTokens: number;
};

export interface TextGenProvider {
  id: string;
  generateText(input: TextGenInput): Promise<TextGenResult>;
}

export interface ImageGenProvider {
  id: string;
  generateImage(input: ImageGenInput): Promise<ImageGenResult>;
}

export class MissingApiKeyError extends Error {
  constructor(provider: string, envVar: string) {
    super(
      `Clé API manquante pour ${provider} (${envVar}). La génération AI est désactivée — aucun succès fictif.`,
    );
    this.name = "MissingApiKeyError";
  }
}
