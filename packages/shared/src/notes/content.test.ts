import { describe, expect, it } from "vitest";

import {
  EMPTY_DOC,
  UNTITLED,
  displayTitle,
  isDocJson,
  matchSnippet,
  snippet,
  toPlainDoc,
} from "./content";

describe("isDocJson", () => {
  it("accepts Tiptap documents", () => {
    expect(isDocJson(EMPTY_DOC)).toBe(true);
    expect(isDocJson({ type: "doc" })).toBe(true);
    expect(isDocJson({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
  });

  it.each([null, undefined, "doc", [], { type: "paragraph" }, { type: "doc", content: "x" }])(
    "rejects %j",
    (value) => {
      expect(isDocJson(value)).toBe(false);
    },
  );
});

describe("displayTitle", () => {
  it("falls back for blank titles", () => {
    expect(displayTitle("")).toBe(UNTITLED);
    expect(displayTitle("   ")).toBe(UNTITLED);
  });
  it("trims real titles", () => {
    expect(displayTitle("  Fact find – Nguyen family ")).toBe("Fact find – Nguyen family");
  });
});

describe("snippet", () => {
  it("collapses whitespace and separates blocks (headings, list items) with a middle dot", () => {
    expect(snippet("Goals\n\n Client  wants a 30-year   loan")).toBe(
      "Goals · Client wants a 30-year loan",
    );
  });

  it("returns short text unchanged", () => {
    expect(snippet("Short note", 50)).toBe("Short note");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const text = "Discussed refinance options with ANZ and CBA including offset accounts";
    const s = snippet(text, 40);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(41);
    expect(text.startsWith(s.slice(0, -1))).toBe(true);
    expect(s.slice(0, -1).endsWith(" ")).toBe(false);
  });
});

describe("toPlainDoc", () => {
  it("converts null-prototype attrs (as ProseMirror creates) into plain objects", () => {
    const attrs = Object.create(null) as Record<string, unknown>;
    attrs.checked = true;
    const doc = { type: "doc", content: [{ type: "taskItem", attrs }] };
    const plain = toPlainDoc(doc);
    const plainAttrs = (plain.content?.[0] as { attrs: object }).attrs;
    expect(Object.getPrototypeOf(plainAttrs)).toBe(Object.prototype);
    expect(plain).toEqual({
      type: "doc",
      content: [{ type: "taskItem", attrs: { checked: true } }],
    });
  });
});

describe("matchSnippet", () => {
  const text = "Discussed refinance options with ANZ and CBA, including offset accounts and fees.";

  it("finds a case-insensitive match and keeps the original casing", () => {
    expect(matchSnippet(text, "anz", 200)).toEqual({
      before: "Discussed refinance options with ",
      match: "ANZ",
      after: " and CBA, including offset accounts and fees.",
    });
  });

  it("centres long text around the match with ellipses", () => {
    const long = `${"lorem ".repeat(60)}OFFSET${" ipsum".repeat(60)}`;
    const s = matchSnippet(long, "offset", 60)!;
    expect(s.match).toBe("OFFSET");
    expect(s.before.startsWith("…")).toBe(true);
    expect(s.after.endsWith("…")).toBe(true);
    expect((s.before + s.match + s.after).length).toBeLessThanOrEqual(62);
  });

  it("returns null for no match or an empty query", () => {
    expect(matchSnippet(text, "westpac")).toBeNull();
    expect(matchSnippet(text, "  ")).toBeNull();
  });
});
