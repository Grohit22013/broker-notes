import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  buildNoteOrderBy,
  buildNoteWhere,
  filtersToSearchParams,
  hasAnyFilter,
  parseNoteFilters,
} from "./filters";

describe("parseNoteFilters", () => {
  it("defaults to no filters, sorted by last edited", () => {
    expect(parseNoteFilters({})).toEqual({
      q: "",
      stage: undefined,
      type: undefined,
      tag: undefined,
      due: false,
      sort: "updated",
    });
  });

  it("reads valid params", () => {
    const f = parseNoteFilters({
      q: "  parramatta ",
      stage: "CONDITIONAL",
      type: "FACT_FIND",
      tag: "refinance",
      due: "1",
      sort: "followup",
    });
    expect(f).toEqual({
      q: "parramatta",
      stage: "CONDITIONAL",
      type: "FACT_FIND",
      tag: "refinance",
      due: true,
      sort: "followup",
    });
  });

  it("ignores invalid or hand-edited values instead of failing", () => {
    const f = parseNoteFilters({ stage: "DROP TABLE", type: "nope", sort: "random", due: "yes" });
    expect(f.stage).toBeUndefined();
    expect(f.type).toBeUndefined();
    expect(f.sort).toBe("updated");
    expect(f.due).toBe(false);
  });

  it("takes the first value of repeated params and caps search length", () => {
    expect(parseNoteFilters({ stage: ["LEAD", "SETTLED"] }).stage).toBe("LEAD");
    expect(parseNoteFilters({ q: "x".repeat(500) }).q).toBe("");
  });
});

describe("filtersToSearchParams", () => {
  it("round-trips and omits defaults", () => {
    const f = parseNoteFilters({ q: "anz", stage: "LEAD", due: "1", sort: "updated" });
    const p = filtersToSearchParams(f);
    expect(p.toString()).toBe("q=anz&stage=LEAD&due=1");
    expect(parseNoteFilters(Object.fromEntries(p))).toEqual(f);
  });
});

describe("activeFilterCount / hasAnyFilter", () => {
  it("counts stage, type, tag and due (not search or sort)", () => {
    const f = parseNoteFilters({ q: "x", stage: "LEAD", tag: "a", due: "1", sort: "title" });
    expect(activeFilterCount(f)).toBe(3);
    expect(hasAnyFilter(f)).toBe(true);
    expect(hasAnyFilter(parseNoteFilters({ sort: "title" }))).toBe(false);
  });
});

describe("buildNoteWhere", () => {
  const now = new Date("2026-12-02T23:00:00Z"); // 3 Dec in Sydney

  it("always scopes to the owner and excludes deleted notes", () => {
    expect(buildNoteWhere("u1", parseNoteFilters({}), now)).toEqual({
      userId: "u1",
      deletedAt: null,
    });
  });

  it("adds each filter as an AND clause", () => {
    const where = buildNoteWhere(
      "u1",
      parseNoteFilters({ q: "anz", stage: "LEAD", type: "REVIEW", tag: "smsf", due: "1" }),
      now,
    );
    expect(where).toEqual({
      userId: "u1",
      deletedAt: null,
      AND: [
        {
          OR: [
            { title: { contains: "anz", mode: "insensitive" } },
            { contentText: { contains: "anz", mode: "insensitive" } },
          ],
        },
        { loanStage: "LEAD" },
        { noteType: "REVIEW" },
        { tags: { has: "smsf" } },
        { followUpAt: { lt: new Date("2026-12-03T13:00:00.000Z") } }, // before 4 Dec, Sydney
      ],
    });
  });
});

describe("buildNoteOrderBy", () => {
  it("puts pinned notes first with a stable tiebreaker", () => {
    expect(buildNoteOrderBy("updated")).toEqual([
      { pinned: "desc" },
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
  });

  it("sorts follow-ups soonest first with empty dates last", () => {
    expect(buildNoteOrderBy("followup")[1]).toEqual({
      followUpAt: { sort: "asc", nulls: "last" },
    });
  });
});
