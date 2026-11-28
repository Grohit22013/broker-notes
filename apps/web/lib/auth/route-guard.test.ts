import { describe, expect, it } from "vitest";

import { routeDecision } from "./route-guard";

describe("routeDecision (middleware guard)", () => {
  it.each([
    ["/notes", ""],
    ["/notes/123", ""],
    ["/clients", ""],
    ["/clients/9", "?tab=notes"],
    ["/settings/team", ""],
    ["/settings/audit", "?category=note"],
  ])("redirects signed-out access to %s%s → /login with a relative callbackUrl", (path, search) => {
    const d = routeDecision(path, search, false);
    expect(d.action).toBe("redirect");
    const to = new URL(d.action === "redirect" ? d.to : "", "http://x");
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("callbackUrl")).toBe(`${path}${search}`);
  });

  it("lets signed-in brokers into protected routes", () => {
    expect(routeDecision("/notes", "", true)).toEqual({ action: "next" });
  });

  it("leaves public routes open", () => {
    expect(routeDecision("/", "", false)).toEqual({ action: "next" });
    expect(routeDecision("/login", "", false)).toEqual({ action: "next" });
    expect(routeDecision("/notesy", "", false)).toEqual({ action: "next" }); // not a protected prefix
  });

  it("redirects signed-in users away from login/register", () => {
    expect(routeDecision("/login", "", true)).toEqual({ action: "redirect", to: "/notes" });
    expect(routeDecision("/register", "?x=1", true)).toEqual({ action: "redirect", to: "/notes" });
  });
});
