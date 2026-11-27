import { describe, expect, it } from "vitest";

import { guessMapping, summariseImport, validateImportRows } from "./clients/validation";
import { csvCell, csvFilename, toCsv, UTF8_BOM } from "./csv";
import { computeLvr, formatAud, formatAudCompact, parseMoney, parseRate } from "./money";
import { isDocJson } from "./notes/content";
import { canEditContent, lockedFieldIn } from "./notes/finalise";
import { hasKeyFigures, lvrOf, parseKeyFigures } from "./notes/key-figures";
import { TEMPLATES, getTemplate, noteFromTemplate } from "./notes/templates";

describe("money", () => {
  it.each([
    ["850000", 850_000],
    ["850,000", 850_000],
    ["$850k", 850_000],
    ["1.2m", 1_200_000],
    ["AUD 95,000", 95_000],
    [" 1,250,000.50 ", 1_250_000.5],
  ])("parses %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "1.2.3", "5b", "200m"])("rejects %s", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("formats AUD", () => {
    expect(formatAud(850_000)).toBe("$850,000");
    expect(formatAudCompact(1_200_000)).toBe("$1.2m");
    expect(formatAudCompact(850_000)).toBe("$850k");
  });

  it("computes LVR to one decimal place", () => {
    expect(computeLvr(680_000, 850_000)).toBe(80);
    expect(computeLvr(722_500, 850_000)).toBe(85);
    expect(computeLvr(500_000, 0)).toBeNull();
    expect(computeLvr(undefined, 850_000)).toBeNull();
  });

  it("parses rates 0–30%", () => {
    expect(parseRate("6.49")).toBe(6.49);
    expect(parseRate("6.49%")).toBe(6.49);
    expect(parseRate("45")).toBeNull();
    expect(parseRate("six")).toBeNull();
  });
});

describe("key figures", () => {
  it("keeps valid fields and drops malformed / empty ones", () => {
    const f = parseKeyFigures({ loanAmount: 680000, propertyValue: 850000, rate: 99, lender: "" });
    expect(f).toEqual({});
    const g = parseKeyFigures({ loanAmount: 680000, propertyValue: 850000, lender: "ANZ" });
    expect(g).toEqual({ loanAmount: 680000, propertyValue: 850000, lender: "ANZ" });
    expect(lvrOf(g)).toBe(80);
    expect(hasKeyFigures(g)).toBe(true);
    expect(hasKeyFigures(parseKeyFigures(null))).toBe(false);
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Smith, "Jo"')).toBe('"Smith, ""Jo"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it.each(['=HYPERLINK("http://evil")', "+61 400", "-2+3", "@SUM(A1)", "\tcmd"])(
    "neutralises formula injection in %j",
    (value) => {
      expect(csvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );

  it("leaves negative numbers alone and builds a BOM + CRLF document", () => {
    expect(csvCell(-5)).toBe("-5");
    const out = toCsv(["Name", "Amount"], [["O’Brien", 850000]]);
    expect(out.startsWith(UTF8_BOM)).toBe(true);
    expect(out).toBe(`${UTF8_BOM}Name,Amount\r\nO’Brien,850000\r\n`);
    expect(csvFilename("notes", new Date("2026-11-28T03:00:00Z"))).toBe(
      "brokernotes-notes-2026-11-28.csv",
    );
  });
});

describe("client import", () => {
  it("guesses column mapping from common headers", () => {
    expect(guessMapping(["Full Name", "E-mail", "Mobile", "Notes"])).toEqual({
      name: "Full Name",
      email: "E-mail",
      phone: "Mobile",
    });
  });

  it("validates rows, flags duplicates in-file and against existing clients", () => {
    const rows = [
      { Name: "Asha Patel", Email: "ASHA@example.com", Phone: "0400 111 222" },
      { Name: "", Email: "nobody@example.com", Phone: "" },
      { Name: "Asha P (dupe)", Email: "asha@example.com", Phone: "" },
      { Name: "Existing", Email: "old@example.com", Phone: "" },
      { Name: "Bad email", Email: "not-an-email", Phone: "" },
      { Name: "No email", Email: "", Phone: "" },
    ];
    const results = validateImportRows(
      rows,
      { name: "Name", email: "Email", phone: "Phone" },
      new Set(["old@example.com"]),
    );
    expect(results.map((r) => r.status)).toEqual([
      "valid",
      "invalid",
      "duplicate",
      "duplicate",
      "invalid",
      "valid",
    ]);
    expect(results[0]).toMatchObject({
      data: { email: "asha@example.com", phone: "0400 111 222" },
    });
    expect(summariseImport(results)).toEqual({ valid: 2, duplicates: 2, invalid: 2 });
  });
});

describe("finalise rules", () => {
  it("locks content and record fields, keeps workflow fields editable", () => {
    expect(canEditContent("DRAFT")).toBe(true);
    expect(canEditContent("FINALISED")).toBe(false);
    expect(lockedFieldIn("FINALISED", ["followUpDate", "tags", "pinned", "loanStage"])).toBeNull();
    expect(lockedFieldIn("FINALISED", ["tags", "keyFigures"])).toBe("keyFigures");
    expect(lockedFieldIn("FINALISED", ["noteType"])).toBe("noteType");
    expect(lockedFieldIn("DRAFT", ["noteType", "clientId", "keyFigures"])).toBeNull();
  });
});

describe("templates", () => {
  it("every template builds a valid document and has a unique id", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(isDocJson(t.build())).toBe(true);
  });

  it("fills the client's name into the title, or drops the placeholder", () => {
    expect(noteFromTemplate("fact-find", "Nguyen family").title).toBe("Fact find – Nguyen family");
    expect(noteFromTemplate("fact-find").title).toBe("Fact find");
    expect(noteFromTemplate("fact-find").noteType).toBe("FACT_FIND");
  });

  it("falls back to a blank general note for unknown ids", () => {
    const n = noteFromTemplate("nope");
    expect(n.noteType).toBe("GENERAL");
    expect(n.title).toBe("");
    expect(getTemplate("blank")).toBeNull();
  });

  it("the lender rationale template asks why alternatives were rejected (RG 273)", () => {
    const json = JSON.stringify(getTemplate("lender-rationale")!.build());
    expect(json).toContain("best interests");
    expect(json).toContain("Why other options were not recommended");
  });
});
