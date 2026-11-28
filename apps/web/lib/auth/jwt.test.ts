import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { verifySession } from "./jwt";

const SECRET = "test-secret-that-is-long-enough";
const key = new TextEncoder().encode(SECRET);

const sign = (claims: Record<string, unknown>, opts: { secret?: Uint8Array; exp?: string } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.secret ?? key);

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});

describe("verifySession (API-issued session JWT)", () => {
  it("accepts a valid token and maps the claims, including role and brokerage", async () => {
    const token = await sign({
      sub: "u1",
      name: "Asha",
      email: "asha@example.com",
      role: "CASE_MANAGER",
      org: "o1",
      orgName: "Harbour Home Loans",
    });
    await expect(verifySession(token)).resolves.toEqual({
      id: "u1",
      name: "Asha",
      email: "asha@example.com",
      role: "CASE_MANAGER",
      organisationId: "o1",
      organisationName: "Harbour Home Loans",
    });
  });

  it("treats unknown or missing roles as Adviser (pre-roles sessions; the API re-checks)", async () => {
    const forged = await sign({ sub: "u1", email: "a@b.co", role: "SUPERUSER" });
    expect((await verifySession(forged))?.role).toBe("ADVISER");
  });

  it("rejects missing, tampered, wrongly-signed and expired tokens", async () => {
    const good = await sign({ sub: "u1", name: "A", email: "a@b.co" });
    const [h, , s] = good.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin", email: "x@y.z" })).toString(
      "base64url",
    );
    await expect(verifySession(undefined)).resolves.toBeNull();
    await expect(verifySession("not-a-jwt")).resolves.toBeNull();
    await expect(verifySession(`${h}.${forgedPayload}.${s}`)).resolves.toBeNull();
    await expect(
      verifySession(
        await sign(
          { sub: "u1", email: "a@b.co" },
          { secret: new TextEncoder().encode("other-secret-xxxxxxxx") },
        ),
      ),
    ).resolves.toBeNull();
    await expect(
      verifySession(await sign({ sub: "u1", email: "a@b.co" }, { exp: "-1m" })),
    ).resolves.toBeNull();
  });

  it("requires sub and email claims; falls back to email for the name", async () => {
    await expect(
      verifySession(await sign({ name: "No sub", email: "a@b.co" })),
    ).resolves.toBeNull();
    await expect(verifySession(await sign({ sub: "u1", email: "a@b.co" }))).resolves.toEqual({
      id: "u1",
      name: "a@b.co",
      email: "a@b.co",
      role: "ADVISER",
      organisationId: "",
      organisationName: "",
    });
  });
});
