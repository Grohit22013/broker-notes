import { describe, expect, it } from "vitest";

import { draftOffer, parseLocalDraft, type LocalDraft } from "./drafts";
import { buildNoteWhere, filtersToSearchParams, parseNoteFilters } from "./filters";
import { getTemplate, noteFromTemplate } from "./templates";

const doc = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const now = new Date("2026-11-28T10:00:00Z");
const draft = (over: Partial<LocalDraft> = {}): LocalDraft => ({
  title: "Fact find",
  contentJson: doc("unsaved words"),
  baseRevision: 3,
  savedAt: "2026-11-28T09:59:00Z",
  ...over,
});
const server = { title: "Fact find", contentJson: doc("saved words"), revision: 3 };

describe("draftOffer", () => {
  it("offers a draft that differs from the server copy", () => {
    expect(draftOffer(draft(), server, now)).toEqual({ offer: true, stale: false });
  });

  it("flags drafts taken before someone else saved", () => {
    expect(draftOffer(draft(), { ...server, revision: 5 }, now)).toEqual({
      offer: true,
      stale: true,
    });
  });

  it("stays quiet when nothing would be recovered or the draft is too old", () => {
    expect(draftOffer(null, server, now)).toEqual({ offer: false });
    expect(draftOffer(draft({ contentJson: server.contentJson }), server, now)).toEqual({
      offer: false,
    });
    expect(draftOffer(draft({ savedAt: "2026-11-01T00:00:00Z" }), server, now)).toEqual({
      offer: false,
    });
  });
});

describe("parseLocalDraft", () => {
  it("accepts a well-formed draft and rejects anything else", () => {
    expect(parseLocalDraft(JSON.stringify(draft()))).toEqual(draft());
    expect(parseLocalDraft(null)).toBeNull();
    expect(parseLocalDraft("{not json")).toBeNull();
    expect(parseLocalDraft(JSON.stringify({ ...draft(), contentJson: { type: "x" } }))).toBeNull();
    expect(parseLocalDraft(JSON.stringify({ ...draft(), baseRevision: "3" }))).toBeNull();
  });
});

describe("favourites and drafts filters", () => {
  it("round-trips through the URL and narrows the query", () => {
    const f = parseNoteFilters({ fav: "1", drafts: "1" });
    expect([f.favourite, f.drafts]).toEqual([true, true]);
    const qs = filtersToSearchParams(f);
    expect([qs.get("fav"), qs.get("drafts")]).toEqual(["1", "1"]);
    expect(buildNoteWhere({ organisationId: "o", userId: "u" }, f)).toMatchObject({
      AND: [{ favourites: { some: { userId: "u" } } }, { status: "DRAFT" }],
    });
  });
});

describe("new templates", () => {
  it("adds lender update and client meeting templates with checklists", () => {
    expect(getTemplate("lender-update")?.noteType).toBe("CONDITIONS");
    const meeting = noteFromTemplate("client-meeting", "Nguyen family");
    expect(meeting.title).toBe("Client meeting – Nguyen family");
    expect(JSON.stringify(meeting.contentJson)).toContain("taskList");
  });
});
