import { describe, expect, it } from "vitest";

import { isActivePath } from "./site";

describe("isActivePath", () => {
  it("marks Notes active on the list and on a note detail page", () => {
    expect(isActivePath("/notes", "/notes")).toBe(true);
    expect(isActivePath("/notes/abc123", "/notes")).toBe(true);
  });

  it("does not mark Notes active on /notes/new (that belongs to New)", () => {
    expect(isActivePath("/notes/new", "/notes")).toBe(false);
    expect(isActivePath("/notes/new", "/notes/new")).toBe(true);
  });

  it("matches nested client routes", () => {
    expect(isActivePath("/clients", "/clients")).toBe(true);
    expect(isActivePath("/clients/xyz", "/clients")).toBe(true);
    expect(isActivePath("/clientsx", "/clients")).toBe(false);
  });

  it("returns false for unrelated sections", () => {
    expect(isActivePath("/", "/notes")).toBe(false);
    expect(isActivePath("/clients", "/notes")).toBe(false);
  });
});
