import { describe, expect, it } from "vitest";

import { filterSlashItems, SLASH_ITEMS } from "./slash-items";

describe("slash command items", () => {
  it("shows everything for an empty query", () => {
    expect(filterSlashItems("")).toHaveLength(SLASH_ITEMS.length);
  });

  it("matches titles and broker keywords, best matches first", () => {
    expect(filterSlashItems("check")[0]?.id).toBe("checklist");
    expect(filterSlashItems("todo").map((i) => i.id)).toEqual(["checklist"]);
    expect(filterSlashItems("compare").map((i) => i.id)).toEqual(["table"]);
    const heads = filterSlashItems("HEAD").map((i) => i.id);
    expect(heads[0]).toBe("h2"); // "Heading" starts with it
    expect([...heads].sort()).toEqual(["h1", "h2", "h3"]);
    // "list" starts "Bulleted list"? no — but it's a keyword prefix for bullets, and contained in
    // "checklist" and "Numbered list": prefix matches rank first.
    expect(filterSlashItems("list")[0]?.id).toBe("bullets");
  });

  it("returns nothing for unknown commands", () => {
    expect(filterSlashItems("zzz")).toEqual([]);
  });
});
