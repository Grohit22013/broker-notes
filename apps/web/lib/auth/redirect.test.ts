import { describe, expect, it } from "vitest";

import { DEFAULT_AUTHED_PATH, safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it.each(["/notes", "/notes/abc?tab=ai", "/clients/1#timeline"])("allows %s", (path) => {
    expect(safeRedirect(path)).toBe(path);
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "notes",
    "",
    "/login",
    "/register?x=1",
  ])("blocks %s", (path) => {
    expect(safeRedirect(path)).toBe(DEFAULT_AUTHED_PATH);
  });

  it("falls back for non-string input", () => {
    expect(safeRedirect(null)).toBe(DEFAULT_AUTHED_PATH);
    expect(safeRedirect(undefined, "/x")).toBe("/x");
  });
});
