import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces a bcrypt hash that is not the plain password", async () => {
    const hash = await hashPassword("secure123");
    expect(hash).not.toContain("secure123");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("secure123");
    await expect(verifyPassword("secure123", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong1234", hash)).resolves.toBe(false);
  });

  it("returns false (without throwing) when there is no user hash", async () => {
    await expect(verifyPassword("anything1", null)).resolves.toBe(false);
  });
}, 20_000);
