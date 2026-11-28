import { describe, expect, it } from "vitest";

import { analysisSchema, buildUserPrompt, parseAnalysis } from "./ai/analysis";
import { gridRange, monthGrid, parseYearMonth, shiftMonth } from "./calendar";
import { parseLocalDateTime, toLocalDateTime, toLocalTime } from "./dates";
import { lockedFieldIn } from "./notes/finalise";
import { updateNoteMetaSchema } from "./notes/validation";

describe("meeting date-times (Australia/Sydney)", () => {
  it("round-trips a wall-clock time in summer (AEDT, UTC+11)", () => {
    const d = parseLocalDateTime("2026-12-03T14:30")!;
    expect(d.toISOString()).toBe("2026-12-03T03:30:00.000Z");
    expect(toLocalDateTime(d)).toBe("2026-12-03T14:30");
    expect(toLocalTime(d)).toBe("14:30");
  });

  it("uses standard time in winter (AEST, UTC+10) and on the DST change day", () => {
    expect(parseLocalDateTime("2026-07-01T09:00")!.toISOString()).toBe("2026-06-30T23:00:00.000Z");
    // 4 Oct 2026: clocks go forward at 2am; 10am is AEDT.
    expect(parseLocalDateTime("2026-10-04T10:00")!.toISOString()).toBe("2026-10-03T23:00:00.000Z");
  });

  it("rejects malformed values", () => {
    for (const bad of ["2026-02-30T10:00", "2026-12-03 14:30", "2026-12-03T24:00", "nope"]) {
      expect(parseLocalDateTime(bad)).toBeNull();
    }
  });

  it("is validated on note details and locked once finalised", () => {
    expect(
      updateNoteMetaSchema.safeParse({
        id: "cmwzdoxp20000e9249ao6x6jh",
        meetingAt: "2026-12-03T14:30",
      }).success,
    ).toBe(true);
    expect(
      updateNoteMetaSchema.safeParse({ id: "cmwzdoxp20000e9249ao6x6jh", meetingAt: "3 Dec" })
        .success,
    ).toBe(false);
    expect(lockedFieldIn("FINALISED", ["meetingAt"])).toBe("meetingAt");
  });
});

describe("month grid", () => {
  it("has six Monday-first weeks covering the month", () => {
    const g = monthGrid(2026, 12); // 1 Dec 2026 is a Tuesday
    expect(g).toHaveLength(6);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0]![0]).toEqual({ date: "2026-11-30", day: 30, inMonth: false });
    expect(g[0]![1]).toEqual({ date: "2026-12-01", day: 1, inMonth: true });
    expect(g.flat().filter((d) => d.inMonth)).toHaveLength(31);
    expect(gridRange(2026, 12)).toEqual({ from: "2026-11-30", to: "2027-01-10" });
  });

  it("moves between months and parses ?month=", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(parseYearMonth("2026-12")).toEqual({ year: 2026, month: 12 });
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(parseYearMonth(undefined)).toBeNull();
  });
});

describe("AI date spotting", () => {
  const base = {
    summary: "Call with the Patels.",
    actionItems: [],
    keyFigures: {},
    bestInterests: {},
  };

  it("keeps real dates with normalised times and drops invented or broken ones", () => {
    const a = analysisSchema.parse({
      ...base,
      dates: [
        { kind: "meeting", date: "2026-12-02", time: "9:30", label: "Meet ANZ BDM" },
        { kind: "follow_up", date: "2026-12-05", time: null, label: "Call re payslips" },
        { kind: "deadline", date: "2026-02-30", label: "Not a real date" },
        { kind: "party", date: "2026-12-09", time: "25:00", label: "Valuation due" },
        "garbage",
      ],
    });
    expect(a.dates).toEqual([
      { kind: "meeting", date: "2026-12-02", time: "09:30", label: "Meet ANZ BDM" },
      { kind: "follow_up", date: "2026-12-05", time: null, label: "Call re payslips" },
      { kind: "deadline", date: "2026-12-09", time: null, label: "Valuation due" },
    ]);
  });

  it("parses analyses saved before dates existed, and bad 'dates' values, as no dates", () => {
    expect(analysisSchema.parse(base).dates).toEqual([]);
    const r = parseAnalysis(JSON.stringify({ ...base, dates: "none" }));
    expect(r.ok && r.analysis.dates).toEqual([]);
  });

  it("tells the model today's date so it can resolve relative dates", () => {
    const prompt = buildUserPrompt({
      title: "t",
      text: "Call back next Tuesday",
      noteType: "GENERAL",
      loanStage: null,
      today: "Saturday 2026-11-28",
    });
    expect(prompt.split("\n")[0]).toBe("Today: Saturday 2026-11-28 (Australia/Sydney)");
  });
});
