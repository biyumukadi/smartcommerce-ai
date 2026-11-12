import { describe, expect, it } from "vitest";
import { assertStoreOwnedResource, TenantError } from "../src/lib/tenant";

describe("tenant isolation helpers", () => {
  it("allows matching store ids", async () => {
    await expect(
      assertStoreOwnedResource("store_a", "store_a"),
    ).resolves.toBeUndefined();
  });

  it("blocks cross-store access", async () => {
    await expect(assertStoreOwnedResource("store_a", "store_b")).rejects.toBeInstanceOf(
      TenantError,
    );
  });
});
