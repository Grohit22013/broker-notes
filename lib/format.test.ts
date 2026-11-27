import { describe, expect, it } from "vitest";

import { initials } from "./format";

describe("initials", () => {
  it.each([
    ["Jane van der Berg", "JB"],
    ["jane", "J"],
    ["  Rohit   Kumar  ", "RK"],
    ["", "?"],
  ])("%s → %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
