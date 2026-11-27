/**
 * AUD money helpers. Brokers type amounts the way they say them — "850k", "$1.2m",
 * "1,250,000" — so parsing is forgiving; storage is plain whole/decimal numbers.
 */

export const MONEY_MAX = 100_000_000; // $100m — anything above is a typo for a home loan

/** "850k" → 850000, "$1.2m" → 1200000, "1,250,000.50" → 1250000.5. Returns null if not a valid amount. */
export function parseMoney(input: string): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, "")
    .replace(/^aud/, "");
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1_000 : 1);
  if (!Number.isFinite(n) || n < 0 || n > MONEY_MAX) return null;
  return Math.round(n * 100) / 100;
}

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

/** 850000 → "$850,000" */
export function formatAud(n: number): string {
  return aud.format(n);
}

/** 1200000 → "$1.2m", 850000 → "$850k" — compact form for badges. */
export function formatAudCompact(n: number): string {
  if (n >= 1_000_000) return `$${trimZeros((n / 1_000_000).toFixed(2))}m`;
  if (n >= 1_000) return `$${trimZeros((n / 1_000).toFixed(1))}k`;
  return formatAud(n);
}

const trimZeros = (s: string) => s.replace(/\.?0+$/, "");

/** Loan-to-value ratio as a percentage, 1 decimal place. Null when it can't be computed. */
export function computeLvr(
  loanAmount?: number | null,
  propertyValue?: number | null,
): number | null {
  if (!loanAmount || !propertyValue || propertyValue <= 0) return null;
  return Math.round((loanAmount / propertyValue) * 1000) / 10;
}

/** "6.49" / "6.49%" → 6.49. Interest rates 0–30%. */
export function parseRate(input: string): number | null {
  const s = input.trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 30 ? Math.round(n * 100) / 100 : null;
}
