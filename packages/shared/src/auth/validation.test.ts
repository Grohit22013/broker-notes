import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema, toFieldErrors } from "./validation";

const validRegister = {
  name: "Priya Sharma",
  email: "Priya@Example.com ",
  password: "secure123",
  confirmPassword: "secure123",
};

describe("registerSchema", () => {
  it("accepts a valid registration and normalises the email", () => {
    const r = registerSchema.parse(validRegister);
    expect(r.email).toBe("priya@example.com");
    expect(r.name).toBe("Priya Sharma");
  });

  it.each([
    ["short", "short1", "at least 8"],
    ["no number", "abcdefgh", "number"],
    ["no letter", "12345678", "letter"],
    ["too long (bcrypt 72 limit)", "a1".repeat(37), "72"],
  ])("rejects a password that is %s", (_label, password, message) => {
    const r = registerSchema.safeParse({ ...validRegister, password, confirmPassword: password });
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error).password).toContain(message);
  });

  it("rejects mismatched passwords on the confirm field", () => {
    const r = registerSchema.safeParse({ ...validRegister, confirmPassword: "different1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error).confirmPassword).toBe("Passwords don't match");
  });

  it("rejects invalid email and too-short name", () => {
    const r = registerSchema.safeParse({ ...validRegister, email: "not-an-email", name: "A" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errors = toFieldErrors(r.error);
      expect(errors.email).toBe("Enter a valid email address");
      expect(errors.name).toContain("at least 2");
    }
  });
});

describe("loginSchema", () => {
  it("normalises email and requires a password", () => {
    expect(loginSchema.parse({ email: " A@B.CO ", password: "x" }).email).toBe("a@b.co");
    const r = loginSchema.safeParse({ email: "a@b.co", password: "" });
    expect(r.success).toBe(false);
  });
});

describe("toFieldErrors", () => {
  it("keeps only the first message per field", () => {
    const r = registerSchema.safeParse({ ...validRegister, password: "x", confirmPassword: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(toFieldErrors(r.error).password).toContain("at least 8");
  });
});
