import { describe, expect, it } from "vitest";

import { VERSION_WINDOW_MS, jsonEqual, shouldSnapshot } from "./versioning";

const now = new Date("2026-11-28T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("shouldSnapshot", () => {
  it("never snapshots when nothing changed", () => {
    expect(shouldSnapshot({ lastVersionAt: null, now, changed: false })).toBe(false);
    expect(
      shouldSnapshot({ lastVersionAt: ago(VERSION_WINDOW_MS * 10), now, changed: false }),
    ).toBe(false);
  });

  it("snapshots the first change when there is no version yet", () => {
    expect(shouldSnapshot({ lastVersionAt: null, now, changed: true })).toBe(true);
  });

  it("throttles to one snapshot per window while autosaving", () => {
    expect(shouldSnapshot({ lastVersionAt: ago(30_000), now, changed: true })).toBe(false);
    expect(shouldSnapshot({ lastVersionAt: ago(VERSION_WINDOW_MS - 1), now, changed: true })).toBe(
      false,
    );
    expect(shouldSnapshot({ lastVersionAt: ago(VERSION_WINDOW_MS), now, changed: true })).toBe(
      true,
    );
  });
});

describe("jsonEqual", () => {
  it("ignores object key order and undefined values", () => {
    expect(jsonEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1, x: undefined }, { a: 1 })).toBe(true);
  });

  it("detects real differences, including array order", () => {
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: null }, { a: 0 })).toBe(false);
  });
});
