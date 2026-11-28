import { describe, expect, it } from "vitest";

import { nextSaveDelay } from "./autosave";

const base = { delay: 1500, maxWait: 5000 };

describe("nextSaveDelay", () => {
  it("uses the normal debounce delay for a fresh change", () => {
    expect(nextSaveDelay({ ...base, firstPendingAt: 1000, now: 1000 })).toBe(1500);
  });

  it("shortens the wait as changes approach maxWait (continuous typing)", () => {
    expect(nextSaveDelay({ ...base, firstPendingAt: 0, now: 4000 })).toBe(1000);
  });

  it("saves immediately once maxWait has passed", () => {
    expect(nextSaveDelay({ ...base, firstPendingAt: 0, now: 5000 })).toBe(0);
    expect(nextSaveDelay({ ...base, firstPendingAt: 0, now: 9000 })).toBe(0);
  });
});
