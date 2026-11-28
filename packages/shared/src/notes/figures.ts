/**
 * Zod-free key-figure types and helpers for browser code (the Zod schema lives in
 * ./key-figures and re-exports these).
 */
import { computeLvr } from "../money";

/** Key loan figures captured against a note. All optional — brokers fill in what they know. */
export type KeyFigures = {
  loanAmount?: number | null;
  propertyValue?: number | null;
  /** Household gross annual income. */
  income?: number | null;
  /** Interest rate, % p.a. */
  rate?: number | null;
  lender?: string | null;
};

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
