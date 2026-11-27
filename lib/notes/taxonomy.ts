/**
 * Broker vocabulary for note types and loan stages.
 * Mirrors the Prisma enums (checked at compile time in `taxonomy.server.ts`) without importing
 * @prisma/client, so client components can use it without bundling Prisma.
 */

export const NOTE_TYPES = [
  { value: "DISCOVERY", label: "Discovery call" },
  { value: "FACT_FIND", label: "Fact find" },
  { value: "LENDER_RATIONALE", label: "Lender rationale" },
  { value: "CONDITIONS", label: "Conditions" },
  { value: "SETTLEMENT", label: "Settlement" },
  { value: "REVIEW", label: "Review" },
  { value: "GENERAL", label: "General" },
] as const;

export type NoteTypeValue = (typeof NOTE_TYPES)[number]["value"];

/** Simplified Australian home-loan pipeline, in order. Tone drives the badge colour. */
export const LOAN_STAGES = [
  { value: "LEAD", label: "Lead", tone: "slate" },
  { value: "PRE_APPROVAL", label: "Pre-approval", tone: "sky" },
  { value: "APPLICATION", label: "Application", tone: "indigo" },
  { value: "CONDITIONAL", label: "Conditional", tone: "amber" },
  { value: "UNCONDITIONAL", label: "Unconditional", tone: "teal" },
  { value: "SETTLED", label: "Settled", tone: "emerald" },
  { value: "REVIEW", label: "Review", tone: "violet" },
] as const;

export type LoanStageValue = (typeof LOAN_STAGES)[number]["value"];
export type StageTone = (typeof LOAN_STAGES)[number]["tone"];

export const NOTE_TYPE_VALUES = NOTE_TYPES.map((t) => t.value) as [
  NoteTypeValue,
  ...NoteTypeValue[],
];
export const LOAN_STAGE_VALUES = LOAN_STAGES.map((s) => s.value) as [
  LoanStageValue,
  ...LoanStageValue[],
];

export function noteTypeLabel(value: NoteTypeValue): string {
  return NOTE_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function loanStage(value: LoanStageValue) {
  return LOAN_STAGES.find((s) => s.value === value) ?? LOAN_STAGES[0];
}

export const SORT_OPTIONS = [
  { value: "updated", label: "Last edited" },
  { value: "created", label: "Date created" },
  { value: "followup", label: "Follow-up date" },
  { value: "title", label: "Title (A–Z)" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];
