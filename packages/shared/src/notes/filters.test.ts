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
      client: undefined,
      due: false,
      mine: false,
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
      client: undefined,
      due: true,
      mine: false,
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

const scope = { organisationId: "o1", userId: "u1" };

describe("buildNoteWhere", () => {
  const now = new Date("2026-12-02T23:00:00Z"); // 3 Dec in Sydney

  it("always scopes to the organisation and excludes deleted notes", () => {
    expect(buildNoteWhere(scope, parseNoteFilters({}), now)).toEqual({
      organisationId: "o1",
      deletedAt: null,
    });
  });

  it("adds each filter as an AND clause", () => {
    const where = buildNoteWhere(
      scope,
      parseNoteFilters({ q: "anz", stage: "LEAD", type: "REVIEW", tag: "smsf", due: "1" }),
      now,
    );
    expect(where).toEqual({
      organisationId: "o1",
      deletedAt: null,
      AND: [
        {
          OR: [
            { title: { contains: "anz", mode: "insensitive" } },
            { contentText: { contains: "anz", mode: "insensitive" } },
            { client: { name: { contains: "anz", mode: "insensitive" } } },
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

describe("client filter", () => {
  it("accepts a cuid client id and ignores anything else", () => {
    expect(parseNoteFilters({ client: "cmwzdoxp20000e9249ao6x6jh" }).client).toBe(
      "cmwzdoxp20000e9249ao6x6jh",
    );
    expect(parseNoteFilters({ client: "1 OR 1=1" }).client).toBeUndefined();
  });

  it("narrows by clientId", () => {
    const where = buildNoteWhere(scope, parseNoteFilters({ client: "cmwzdoxp20000e9249ao6x6jh" }));
    expect(where).toEqual({
      organisationId: "o1",
      deletedAt: null,
      AND: [{ clientId: "cmwzdoxp20000e9249ao6x6jh" }],
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

describe("created by me", () => {
  it("parses mine=1 and narrows to the signed-in author", () => {
    const f = parseNoteFilters({ mine: "1" });
    expect(f.mine).toBe(true);
    expect(parseNoteFilters({ mine: "yes" }).mine).toBe(false);
    expect(buildNoteWhere(scope, f)).toEqual({
      organisationId: "o1",
      deletedAt: null,
      AND: [{ userId: "u1" }],
    });
  });
});
