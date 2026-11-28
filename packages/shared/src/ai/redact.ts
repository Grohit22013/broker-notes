/**
 * Removes sensitive identifiers before any note text leaves our server for an AI provider.
 * Free models may log prompts, so we strip what a broker must protect under the Privacy Act:
 * tax file numbers, Medicare numbers, card numbers, bank account details, phone numbers and
 * email addresses. Financial figures (loan amounts, rates, incomes) are kept — they're what the
 * analysis is for, and on their own they don't identify a person.
 */

export type RedactionCounts = Record<RedactionKind, number>;
type RedactionKind = "tfn" | "medicare" | "card" | "bank" | "phone" | "email";

export const PLACEHOLDER: Record<RedactionKind, string> = {
  tfn: "[TFN removed]",
  medicare: "[Medicare no. removed]",
  card: "[card no. removed]",
  bank: "[bank account removed]",
  phone: "[phone removed]",
  email: "[email removed]",
};

const digits = (s: string) => s.replace(/\D/g, "");

/** Luhn checksum — distinguishes real card numbers from other long digit runs. */
export function luhnValid(num: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return num.length > 0 && sum % 10 === 0;
}

/** ATO TFN check: weighted sum of the 9 digits is divisible by 11. */
export function tfnValid(num: string): boolean {
  if (!/^\d{9}$/.test(num)) return false;
  const w = [1, 4, 3, 7, 5, 8, 6, 9, 10];
  return [...num].reduce((s, d, i) => s + Number(d) * w[i]!, 0) % 11 === 0;
}

/** Medicare: 10 digits, first 2–9, digit 9 is a weighted checksum of the first 8. */
export function medicareValid(num: string): boolean {
  if (!/^[2-6]\d{9,10}$/.test(num)) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9];
  const sum = [...num.slice(0, 8)].reduce((s, d, i) => s + Number(d) * w[i]!, 0);
  return sum % 10 === Number(num[8]);
}

const SEP = "[\\s-]?";

const RULES: { kind: RedactionKind; re: RegExp; test?: (match: string) => boolean }[] = [
  { kind: "email", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  // BSB (xxx-xxx) followed by an account number, or "account/acc no" + digits.
  {
    kind: "bank",
    re: /\b\d{3}[\s-]\d{3}[\s,]+(?:acc(?:ount)?\.?\s*(?:no\.?|number)?\s*:?\s*)?\d{5,10}\b/gi,
  },
  { kind: "bank", re: /\b(?:acc(?:ount)?\.?\s*(?:no\.?|number|#)\s*:?\s*)\d{5,10}\b/gi },
  // Card numbers: 13–19 digits with optional separators, Luhn-valid.
  {
    kind: "card",
    re: new RegExp(`\\b\\d(?:${SEP}\\d){12,18}\\b`, "g"),
    test: (m) => luhnValid(digits(m)),
  },
  // Medicare: 10–11 digits (often 4 5 1 [1]).
  {
    kind: "medicare",
    re: new RegExp(`\\b\\d{4}${SEP}\\d{5}${SEP}\\d(?:${SEP}\\d)?\\b`, "g"),
    test: (m) => medicareValid(digits(m)),
  },
  // TFN: 9 digits (often 3 3 3), checksum-valid — or anything explicitly labelled TFN.
  { kind: "tfn", re: /\bTFN\s*:?\s*\d(?:[\s-]?\d){7,8}\b/gi },
  {
    kind: "tfn",
    re: new RegExp(`\\b\\d{3}${SEP}\\d{3}${SEP}\\d{3}\\b`, "g"),
    test: (m) => tfnValid(digits(m)),
  },
  // Australian phone numbers: mobiles 04xx xxx xxx, landlines (0x) xxxx xxxx, +61 forms.
  { kind: "phone", re: /(?:\+61[\s-]?|\b0)[2-478](?:[\s-]?\d){8}\b/g },
  { kind: "phone", re: /\(0[2-478]\)[\s-]?\d{4}[\s-]?\d{4}\b/g },
];

export function redact(text: string): { text: string; counts: RedactionCounts; total: number } {
  const counts: RedactionCounts = { tfn: 0, medicare: 0, card: 0, bank: 0, phone: 0, email: 0 };
  let out = text;
  for (const { kind, re, test } of RULES) {
    out = out.replace(re, (m) => {
      if (test && !test(m)) return m;
      counts[kind] += 1;
      return PLACEHOLDER[kind];
    });
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text: out, counts, total };
}
