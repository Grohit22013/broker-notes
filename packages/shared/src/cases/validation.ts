import { z } from "zod";

import { MONEY_MAX } from "../money";

import { CASE_STAGE_VALUES, CASE_TYPE_VALUES } from "./taxonomy";

export const caseIdSchema = z.cuid({ error: "Invalid case" });

const money = z
  .number({ error: "Enter an amount" })
  .min(0, "Amounts can't be negative")
  .max(MONEY_MAX, "That amount is too large")
  .nullable()
  .optional();

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((v) => v || null)
    .nullable()
    .optional();

const adviserId = z
  .union([z.cuid({ error: "Choose an adviser" }), z.literal("")])
  .transform((v) => v || null)
  .nullable()
  .optional();

/** Fields everyone may change (case managers track progress). */
export const CASE_PROGRESS_FIELDS = ["stage"] as const;

export const createCaseSchema = z.object({
  clientId: z.cuid({ error: "Choose a client" }),
  type: z.enum(CASE_TYPE_VALUES, { error: "Choose a loan type" }),
  stage: z.enum(CASE_STAGE_VALUES).default("ENQUIRY"),
  lender: optionalText(60, "Lender"),
  lenderReference: optionalText(40, "Lender reference"),
  loanAmount: money,
  propertyValue: money,
  assignedAdviserId: adviserId,
});

/** Partial update. The client can't change (a case belongs to one client for life). */
export const updateCaseSchema = createCaseSchema
  .omit({ clientId: true })
  .partial()
  .extend({ stage: z.enum(CASE_STAGE_VALUES).optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "Nothing to change" });

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Lenient list filters (from the URL). */
export const caseFiltersSchema = z.object({
  q: z.preprocess(first, z.string().trim().max(100).catch("")).default(""),
  stage: z.preprocess(first, z.enum(CASE_STAGE_VALUES).optional().catch(undefined)),
  client: z.preprocess(first, z.cuid().optional().catch(undefined)),
  /** "open" (default), "all", or only settled/closed. */
  status: z.preprocess(first, z.enum(["open", "all", "done"]).catch("open")).default("open"),
  /** Only cases assigned to the signed-in member. */
  mine: z.preprocess(first, z.literal("1").optional().catch(undefined)).transform((v) => v === "1"),
});

export type CreateCaseInput = z.input<typeof createCaseSchema>;
export type CreateCaseData = z.output<typeof createCaseSchema>;
export type UpdateCaseData = z.output<typeof updateCaseSchema>;
export type CaseFilters = z.output<typeof caseFiltersSchema>;

/** Which updated fields need more than "move the stage" rights. */
export function detailFieldsIn(update: Record<string, unknown>): string[] {
  return Object.keys(update).filter(
    (k) => update[k] !== undefined && !(CASE_PROGRESS_FIELDS as readonly string[]).includes(k),
  );
}
