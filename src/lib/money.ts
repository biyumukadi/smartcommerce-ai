export const SUPPORTED_CURRENCIES = ["USD", "CDF", "EUR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function toMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

export function fromMinor(amountMinor: number | string | bigint): number {
  return Number(amountMinor) / 100;
}
