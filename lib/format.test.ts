import { describe, expect, it } from "vitest";

import { formatDateTime, formatRelative, formatShortDate, initials } from "./format";

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

describe("formatRelative", () => {
  const now = new Date("2026-11-28T10:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  it.each([
    [10, "just now"],
    [5 * 60, "5 minutes ago"],
    [2 * 3600, "2 hours ago"],
    [24 * 3600, "yesterday"],
    [3 * 86400, "3 days ago"],
  ])("%is ago → %s", (seconds, expected) => {
    expect(formatRelative(ago(seconds), now)).toBe(expected);
  });

  it("uses an Australian dd/mm/yyyy date after a week", () => {
    expect(formatRelative(new Date("2026-10-05T01:00:00Z"), now)).toBe("05/10/2026");
  });
});

describe("formatDateTime", () => {
  it("formats in Australian style, Sydney time", () => {
    // 2026-11-28 00:30 UTC = 11:30 am AEDT
    expect(formatDateTime(new Date("2026-11-28T00:30:00Z"))).toMatch(/^28\/11\/2026, 11:30\s?am$/i);
  });
});

describe("formatShortDate", () => {
  const now = new Date("2026-11-28T00:00:00Z");
  it("omits the year for this year and includes it otherwise", () => {
    expect(formatShortDate(new Date("2026-12-02T13:00:00Z"), now)).toBe("3 Dec");
    expect(formatShortDate(new Date("2027-01-04T13:00:00Z"), now)).toBe("5 Jan 2027");
  });
});
