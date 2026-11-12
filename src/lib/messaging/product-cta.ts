/**
 * Build wa.me deep links for product WhatsApp buttons.
 * Uses store CTA number (settings.whatsappCta) — Cloud API not required for click-to-chat.
 */
export function buildProductWhatsAppLink(input: {
  phoneE164: string;
  storeName: string;
  productName: string;
  sku: string;
  priceLabel: string;
  storeUrl?: string;
}): string {
  const digits = input.phoneE164.replace(/\D/g, "");
  const text = [
    `Bonjour ${input.storeName},`,
    `Je suis intéressé(e) par: ${input.productName} (${input.sku}) — ${input.priceLabel}.`,
    input.storeUrl ? `Lien boutique: ${input.storeUrl}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
