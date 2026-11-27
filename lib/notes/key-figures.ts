import { z } from "zod";

import { MONEY_MAX, computeLvr } from "@/lib/money";

/** Key loan figures captured against a note. All optional — brokers fill in what they know. */
export const keyFiguresSchema = z.object({
  loanAmount: z.number().min(0).max(MONEY_MAX).nullable().optional(),
  propertyValue: z.number().min(0).max(MONEY_MAX).nullable().optional(),
  /** Household gross annual income. */
  income: z.number().min(0).max(MONEY_MAX).nullable().optional(),
  /** Interest rate, % p.a. */
  rate: z.number().min(0).max(30).nullable().optional(),
  lender: z.string().trim().max(60).nullable().optional(),
});

export type KeyFigures = z.infer<typeof keyFiguresSchema>;

/** Reads key figures from the DB JSON column; anything malformed is dropped, not trusted. */
export function parseKeyFigures(value: unknown): KeyFigures {
  const r = keyFiguresSchema.safeParse(value ?? {});
  return r.success ? clean(r.data) : {};
}

/** Removes null/empty entries so stored JSON stays small and "is anything set?" is easy. */
export function clean(f: KeyFigures): KeyFigures {
  const out: KeyFigures = {};
  for (const [k, v] of Object.entries(f) as [keyof KeyFigures, unknown][]) {
    if (v === null || v === undefined || v === "") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function hasKeyFigures(f: KeyFigures): boolean {
  return Object.keys(clean(f)).length > 0;
}

export function lvrOf(f: KeyFigures): number | null {
  return computeLvr(f.loanAmount, f.propertyValue);
}

/** Common Australian lenders, offered as suggestions (free text is still allowed). */
export const LENDERS = [
  "ANZ",
  "CBA",
  "NAB",
  "Westpac",
  "Macquarie",
  "ING",
  "St.George",
  "Bankwest",
  "Suncorp",
  "BOQ",
  "AMP",
  "Bank Australia",
  "Pepper Money",
  "Liberty",
  "La Trobe Financial",
] as const;
