import { describe, expect, it } from "vitest";

import {
  followUpState,
  parseIsoDate,
  startOfNextZonedDay,
  startOfZonedDay,
  toIsoDate,
  zonedMidnight,
  zonedYmd,
} from "./dates";

describe("zonedMidnight (Australia/Sydney)", () => {
  it("handles daylight saving time (AEDT, UTC+11)", () => {
    expect(zonedMidnight({ year: 2026, month: 12, day: 3 }).toISOString()).toBe(
      "2026-12-02T13:00:00.000Z",
    );
  });

  it("handles standard time (AEST, UTC+10)", () => {
    expect(zonedMidnight({ year: 2026, month: 7, day: 1 }).toISOString()).toBe(
      "2026-06-30T14:00:00.000Z",
    );
  });

  it("is correct on DST transition days", () => {
    // DST starts 4 Oct 2026 at 2am (midnight is still AEST); ends 5 Apr 2026 at 3am (midnight is AEDT).
    expect(zonedMidnight({ year: 2026, month: 10, day: 4 }).toISOString()).toBe(
      "2026-10-03T14:00:00.000Z",
    );
    expect(zonedMidnight({ year: 2026, month: 4, day: 5 }).toISOString()).toBe(
      "2026-04-04T13:00:00.000Z",
    );
  });
});

describe("day boundaries", () => {
  // 11pm UTC on 2 Dec is already 10am on 3 Dec in Sydney.
  const now = new Date("2026-12-02T23:00:00Z");

  it("uses the broker's calendar day, not UTC", () => {
    expect(zonedYmd(now)).toEqual({ year: 2026, month: 12, day: 3 });
    expect(startOfZonedDay(now).toISOString()).toBe("2026-12-02T13:00:00.000Z");
    expect(startOfNextZonedDay(now).toISOString()).toBe("2026-12-03T13:00:00.000Z");
  });

  it("rolls over months and years", () => {
    expect(startOfNextZonedDay(new Date("2026-12-31T02:00:00Z")).toISOString()).toBe(
      "2026-12-31T13:00:00.000Z", // midnight 1 Jan 2027 AEDT
    );
  });
});

describe("parseIsoDate / toIsoDate", () => {
  it("round-trips a calendar date through the stored instant", () => {
    const ymd = parseIsoDate("2026-12-03");
    expect(ymd).toEqual({ year: 2026, month: 12, day: 3 });
    expect(toIsoDate(zonedMidnight(ymd!))).toBe("2026-12-03");
  });

  it.each(["2026-02-30", "2026-13-01", "03/12/2026", "2026-1-5", ""])("rejects %s", (v) => {
    expect(parseIsoDate(v)).toBeNull();
  });
});

describe("followUpState", () => {
  const now = new Date("2026-12-03T01:00:00Z"); // 12pm 3 Dec in Sydney
  const day = (d: number) => zonedMidnight({ year: 2026, month: 12, day: d });

  it("classifies overdue, today and upcoming by the Sydney calendar", () => {
    expect(followUpState(day(2), now)).toBe("overdue");
    expect(followUpState(day(3), now)).toBe("today");
    expect(followUpState(day(4), now)).toBe("upcoming");
  });
});
