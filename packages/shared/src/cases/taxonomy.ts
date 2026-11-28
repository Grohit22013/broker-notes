/**
 * Mortgage cases: one client's loan deal moving through the pipeline. Zod-free, so client
 * components can import it. The nine stages follow the product research (enquiry → completion),
 * in Australian terms (lodgement, formal approval, settlement).
 */
export const CASE_STAGES = [
  { value: "ENQUIRY", label: "Enquiry", tone: "slate", hint: "First contact and goals" },
  { value: "FACT_FIND", label: "Fact find", tone: "sky", hint: "Income, expenses, deposit" },
  { value: "RESEARCH", label: "Research", tone: "indigo", hint: "Lenders and products compared" },
  {
    value: "RECOMMENDATION",
    label: "Recommendation",
    tone: "violet",
    hint: "Best-interests recommendation made",
  },
  { value: "LODGED", label: "Lodged", tone: "blue", hint: "Application lodged with the lender" },
  {
    value: "ASSESSMENT",
    label: "Assessment",
    tone: "amber",
    hint: "Credit assessment and valuation",
  },
  { value: "APPROVED", label: "Approved", tone: "teal", hint: "Formal approval / loan offer" },
  { value: "SETTLED", label: "Settled", tone: "emerald", hint: "Loan settled" },
  { value: "CLOSED", label: "Closed", tone: "zinc", hint: "Withdrawn, declined or archived" },
] as const;

export type CaseStageValue = (typeof CASE_STAGES)[number]["value"];
export type CaseStageTone = (typeof CASE_STAGES)[number]["tone"];
export const CASE_STAGE_VALUES = CASE_STAGES.map((s) => s.value) as [
  CaseStageValue,
  ...CaseStageValue[],
];

/** Stages where the deal is still in progress (shown in the dashboard pipeline). */
export const OPEN_CASE_STAGES = CASE_STAGE_VALUES.filter(
  (s) => s !== "SETTLED" && s !== "CLOSED",
) as CaseStageValue[];

export function caseStage(value: CaseStageValue) {
  return CASE_STAGES.find((s) => s.value === value) ?? CASE_STAGES[0];
}

export function caseStageIndex(value: CaseStageValue): number {
  return CASE_STAGE_VALUES.indexOf(value);
}

export const CASE_TYPES = [
  { value: "FIRST_HOME", label: "First home purchase" },
  { value: "PURCHASE", label: "Home purchase" },
  { value: "REFINANCE", label: "Refinance" },
  { value: "INVESTMENT", label: "Investment loan" },
  { value: "TOP_UP", label: "Top-up / equity release" },
  { value: "CONSTRUCTION", label: "Construction loan" },
  { value: "PRODUCT_SWITCH", label: "Product switch / repricing" },
] as const;

export type CaseTypeValue = (typeof CASE_TYPES)[number]["value"];
export const CASE_TYPE_VALUES = CASE_TYPES.map((t) => t.value) as [
  CaseTypeValue,
  ...CaseTypeValue[],
];

export function caseTypeLabel(value: CaseTypeValue): string {
  return CASE_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** Case references read like "HL-2026-0007": prefix, year, per-brokerage sequence. */
export const CASE_REFERENCE_PREFIX = "HL";

export function formatCaseReference(year: number, sequence: number): string {
  return `${CASE_REFERENCE_PREFIX}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** The sequence number of a reference for `year`, or null if it isn't one. */
export function caseReferenceSequence(reference: string, year: number): number | null {
  const m = new RegExp(`^${CASE_REFERENCE_PREFIX}-${year}-(\\d{4,})$`).exec(reference);
  return m ? Number(m[1]) : null;
}
