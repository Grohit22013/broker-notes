import { describe, expect, it } from "vitest";

import { buildNoteWhere, filtersToSearchParams, parseNoteFilters } from "../notes/filters";
import { lockedFieldIn } from "../notes/finalise";
import { canManageCases, canMoveCaseStage } from "../orgs/roles";

import {
  CASE_STAGES,
  OPEN_CASE_STAGES,
  caseReferenceSequence,
  caseStageIndex,
  formatCaseReference,
} from "./taxonomy";
import {
  caseFiltersSchema,
  createCaseSchema,
  detailFieldsIn,
  updateCaseSchema,
} from "./validation";

const CLIENT = "cmwzdoxp20000e9249ao6x6jh";

describe("case taxonomy", () => {
  it("has the nine research stages in pipeline order, two of them closed", () => {
    expect(CASE_STAGES.map((s) => s.value)).toEqual([
      "ENQUIRY",
      "FACT_FIND",
      "RESEARCH",
      "RECOMMENDATION",
      "LODGED",
      "ASSESSMENT",
      "APPROVED",
      "SETTLED",
      "CLOSED",
    ]);
    expect(OPEN_CASE_STAGES).toHaveLength(7);
    expect(caseStageIndex("LODGED")).toBe(4);
  });

  it("formats and parses references", () => {
    expect(formatCaseReference(2026, 7)).toBe("HL-2026-0007");
    expect(formatCaseReference(2026, 12345)).toBe("HL-2026-12345");
    expect(caseReferenceSequence("HL-2026-0042", 2026)).toBe(42);
    expect(caseReferenceSequence("HL-2025-0042", 2026)).toBeNull();
    expect(caseReferenceSequence("nonsense", 2026)).toBeNull();
  });
});

describe("case validation", () => {
  it("creates with sensible defaults and normalised text", () => {
    expect(
      createCaseSchema.parse({
        clientId: CLIENT,
        type: "REFINANCE",
        lender: "  ",
        loanAmount: 600000,
      }),
    ).toMatchObject({
      clientId: CLIENT,
      type: "REFINANCE",
      stage: "ENQUIRY",
      lender: null,
      loanAmount: 600000,
    });
    expect(createCaseSchema.safeParse({ clientId: CLIENT, type: "MOON_BASE" }).success).toBe(false);
    expect(
      createCaseSchema.safeParse({ clientId: CLIENT, type: "PURCHASE", loanAmount: -1 }).success,
    ).toBe(false);
  });

  it("never lets an update move a case to another client, and rejects empty updates", () => {
    expect(updateCaseSchema.parse({ stage: "LODGED", clientId: "x" })).toEqual({ stage: "LODGED" });
    expect(updateCaseSchema.safeParse({}).success).toBe(false);
  });

  it("separates progress (stage) from details", () => {
    expect(detailFieldsIn({ stage: "LODGED" })).toEqual([]);
    expect(detailFieldsIn({ stage: "LODGED", lender: "ANZ", loanAmount: undefined })).toEqual([
      "lender",
    ]);
  });

  it("reads list filters leniently", () => {
    expect(caseFiltersSchema.parse({})).toEqual({ q: "", status: "open", mine: false });
    expect(caseFiltersSchema.parse({ stage: "nope", status: "x", mine: "1" })).toMatchObject({
      stage: undefined,
      status: "open",
      mine: true,
    });
  });
});

describe("cases in permissions and notes", () => {
  it("lets everyone move stages but only admins/advisers edit details", () => {
    const cm = { id: "c", role: "CASE_MANAGER" as const };
    expect(canMoveCaseStage(cm)).toBe(true);
    expect(canManageCases(cm)).toBe(false);
    expect(canManageCases({ id: "a", role: "ADVISER" })).toBe(true);
  });

  it("filters notes by case and keeps the case link locked once finalised", () => {
    const f = parseNoteFilters({ case: CLIENT });
    expect(filtersToSearchParams(f).get("case")).toBe(CLIENT);
    expect(buildNoteWhere({ organisationId: "o", userId: "u" }, f)).toMatchObject({
      AND: [{ caseId: CLIENT }],
    });
    expect(lockedFieldIn("FINALISED", ["caseId"])).toBe("caseId");
  });
});
