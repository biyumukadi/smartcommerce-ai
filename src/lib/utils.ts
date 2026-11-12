import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export function formatMoney(
  amountMinor: number | string | bigint,
  currency: string,
  locale = "fr-CD",
): string {
  const value = Number(amountMinor) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "CDF" ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function localized(
  value: unknown,
  locale: string,
  fallback = "",
): string {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const map = value as Record<string, string>;
    return map[locale] || map.fr || map.en || Object.values(map)[0] || fallback;
  }
  return fallback;
}

export function requestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
