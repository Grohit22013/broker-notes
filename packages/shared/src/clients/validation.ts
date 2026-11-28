import { z } from "zod";

export const CLIENT_NAME_MAX = 120;
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const clientIdSchema = z.cuid({ error: "Invalid client" });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const clientSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(CLIENT_NAME_MAX, `Name must be ${CLIENT_NAME_MAX} characters or fewer`),
  email: optionalText(254)
    .transform((v) => v?.toLowerCase() ?? null)
    .refine((v) => v === null || z.email().safeParse(v).success, {
      error: "Enter a valid email address",
    }),
  phone: optionalText(30).refine((v) => !v || /^[0-9+()\-\s]{6,30}$/.test(v), {
    error: "Enter a valid phone number",
  }),
  /** The adviser looking after this client (a member of the same brokerage), or null. */
  assignedAdviserId: z
    .union([z.cuid({ error: "Choose an adviser" }), z.literal("")])
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

export type ClientInput = z.input<typeof clientSchema>;
export type ClientData = z.output<typeof clientSchema>;

/** Which of our fields each CSV column maps to. */
export type ColumnMapping = { name: string | null; email: string | null; phone: string | null };

const NAME_HEADERS = ["name", "full name", "client", "client name", "borrower"];
const EMAIL_HEADERS = ["email", "e-mail", "email address"];
const PHONE_HEADERS = ["phone", "mobile", "phone number", "mobile number", "contact number"];

/** Guesses the mapping from common header names (case/space-insensitive). */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const find = (candidates: string[]) =>
    headers.find((h) => candidates.includes(h.trim().toLowerCase().replace(/\s+/g, " "))) ?? null;
  return { name: find(NAME_HEADERS), email: find(EMAIL_HEADERS), phone: find(PHONE_HEADERS) };
}

export type ImportRowResult =
  | { row: number; status: "valid"; data: ClientData }
  | { row: number; status: "duplicate"; data: ClientData; reason: string }
  | { row: number; status: "invalid"; reason: string };

/**
 * Validates mapped CSV rows. Duplicates (by email, case-insensitive) are detected both within
 * the file and against the broker's existing clients. Row numbers are 1-based, excluding the header.
 */
export function validateImportRows(
  rows: readonly Record<string, string>[],
  mapping: ColumnMapping,
  existingEmails: ReadonlySet<string>,
): ImportRowResult[] {
  const seen = new Set<string>();
  return rows.map((raw, i) => {
    const row = i + 1;
    const parsed = clientSchema.safeParse({
      name: mapping.name ? (raw[mapping.name] ?? "") : "",
      email: mapping.email ? raw[mapping.email] : undefined,
      phone: mapping.phone ? raw[mapping.phone] : undefined,
    });
    if (!parsed.success) {
      return { row, status: "invalid", reason: parsed.error.issues[0]?.message ?? "Invalid row" };
    }
    const email = parsed.data.email;
    if (email && existingEmails.has(email)) {
      return {
        row,
        status: "duplicate",
        data: parsed.data,
        reason: "Client with this email already exists",
      };
    }
    if (email && seen.has(email)) {
      return { row, status: "duplicate", data: parsed.data, reason: "Email repeated in this file" };
    }
    if (email) seen.add(email);
    return { row, status: "valid", data: parsed.data };
  });
}

export function summariseImport(results: readonly ImportRowResult[]) {
  return {
    valid: results.filter((r) => r.status === "valid").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    invalid: results.filter((r) => r.status === "invalid").length,
  };
}
