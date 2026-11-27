import { describe, expect, it } from "vitest";

import { EMPTY_DOC } from "./content";
import {
  CONTENT_TEXT_MAX,
  TITLE_MAX,
  noteIdSchema,
  updateNoteMetaSchema,
  updateNoteSchema,
} from "./validation";

const id = "cmwzdoxp20000e9249ao6x6jh";
const valid = { id, title: "Discovery call", contentJson: EMPTY_DOC, contentText: "" };

describe("noteIdSchema", () => {
  it("accepts cuids and rejects anything else", () => {
    expect(noteIdSchema.safeParse(id).success).toBe(true);
    expect(noteIdSchema.safeParse("1; DROP TABLE").success).toBe(false);
    expect(noteIdSchema.safeParse("").success).toBe(false);
  });
});

describe("updateNoteSchema", () => {
  it("accepts a valid update (empty title allowed while drafting)", () => {
    expect(updateNoteSchema.safeParse(valid).success).toBe(true);
    expect(updateNoteSchema.safeParse({ ...valid, title: "" }).success).toBe(true);
  });

  it("rejects non-document content", () => {
    const r = updateNoteSchema.safeParse({ ...valid, contentJson: { type: "paragraph" } });
    expect(r.success).toBe(false);
  });

  it("enforces title and text limits", () => {
    expect(updateNoteSchema.safeParse({ ...valid, title: "x".repeat(TITLE_MAX + 1) }).success).toBe(
      false,
    );
    expect(
      updateNoteSchema.safeParse({ ...valid, contentText: "x".repeat(CONTENT_TEXT_MAX + 1) })
        .success,
    ).toBe(false);
  });

  it("rejects oversized JSON payloads", () => {
    const big = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(600_000) }] }],
    };
    const r = updateNoteSchema.safeParse({ ...valid, contentJson: big });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("This note is too large to save");
  });
});

describe("updateNoteMetaSchema", () => {
  it("accepts a partial update and normalises tags", () => {
    const r = updateNoteMetaSchema.parse({ id, tags: ["Refinance", "refinance", " SMSF "] });
    expect(r.tags).toEqual(["Refinance", "SMSF"]);
    expect(r.noteType).toBeUndefined();
  });

  it("allows clearing stage and follow-up with null", () => {
    const r = updateNoteMetaSchema.parse({ id, loanStage: null, followUpDate: null });
    expect(r.loanStage).toBeNull();
    expect(r.followUpDate).toBeNull();
  });

  it("rejects unknown enums and impossible dates", () => {
    expect(updateNoteMetaSchema.safeParse({ id, loanStage: "MAYBE" }).success).toBe(false);
    expect(updateNoteMetaSchema.safeParse({ id, followUpDate: "2026-02-30" }).success).toBe(false);
  });
});
