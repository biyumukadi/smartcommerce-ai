import { describe, expect, it } from "vitest";
import { fromMinor, isSupportedCurrency, toMinor } from "../src/lib/money";
import { formatMoney, slugify } from "../src/lib/utils";

describe("money helpers", () => {
  it("converts major/minor units", () => {
    expect(toMinor(45)).toBe(4500);
    expect(fromMinor(4500)).toBe(45);
  });

  it("validates currencies", () => {
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("CDF")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(true);
    expect(isSupportedCurrency("GBP")).toBe(false);
  });

  it("formats money", () => {
    const out = formatMoney(4500, "USD", "en-US");
    expect(out).toContain("45");
  });

  it("slugifies accents", () => {
    expect(slugify("Écouteurs Kinshasa")).toBe("ecouteurs-kinshasa");
  });
});
