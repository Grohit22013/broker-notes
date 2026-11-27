import { describe, expect, it } from "vitest";

import { MAX_TAGS, MAX_TAG_LENGTH, cleanTag, normalizeTags, parseTagInput } from "./tags";

describe("tags", () => {
  it("cleans whitespace and caps length", () => {
    expect(cleanTag("  first   home  buyer ")).toBe("first home buyer");
    expect(cleanTag("x".repeat(50))).toHaveLength(MAX_TAG_LENGTH);
  });

  it("drops empties and case-insensitive duplicates, keeping the first spelling", () => {
    expect(normalizeTags(["Refinance", "refinance", " ", "FHOG", "REFINANCE"])).toEqual([
      "Refinance",
      "FHOG",
    ]);
  });

  it("keeps at most MAX_TAGS", () => {
    const many = Array.from({ length: 15 }, (_, i) => `tag-${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });

  it("splits comma / newline input", () => {
    expect(normalizeTags(parseTagInput("refinance, investor\nSMSF,,"))).toEqual([
      "refinance",
      "investor",
      "SMSF",
    ]);
  });
});
