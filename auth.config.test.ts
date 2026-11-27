import { describe, expect, it } from "vitest";

import { authConfig } from "./auth.config";

type AuthorizedArgs = Parameters<NonNullable<typeof authConfig.callbacks.authorized>>[0];

const run = (pathname: string, signedIn: boolean) =>
  authConfig.callbacks.authorized({
    auth: signedIn ? { user: { id: "u1", email: "a@b.co" }, expires: "" } : null,
    request: { nextUrl: new URL(`http://localhost${pathname}`) },
  } as unknown as AuthorizedArgs);

describe("authorized (middleware guard)", () => {
  it.each(["/notes", "/notes/123", "/clients", "/clients/9?tab=notes"])(
    "redirects signed-out access to %s → /login with a relative callbackUrl",
    (path) => {
      const res = run(path, false);
      expect(res).toBeInstanceOf(Response);
      const location = new URL((res as Response).headers.get("location") ?? "");
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("callbackUrl")).toBe(path);
    },
  );

  it("lets signed-in brokers into protected routes", () => {
    expect(run("/notes", true)).toBe(true);
  });

  it("leaves public routes open", () => {
    expect(run("/", false)).toBe(true);
    expect(run("/login", false)).toBe(true);
    expect(run("/notesy", false)).toBe(true); // not a protected prefix
  });

  it("redirects signed-in users away from login/register", () => {
    const res = run("/login", true);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).headers.get("location")).toBe("http://localhost/notes");
  });
});
