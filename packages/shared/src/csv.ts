/**
 * CSV export helpers (RFC 4180) that are safe to open in Excel.
 *
 * Formula injection: a cell starting with = + - @ (or tab / carriage return) is executed as a
 * formula by Excel/Sheets — e.g. a client name of `=HYPERLINK("http://evil",...)`. We prefix such
 * cells with a single quote so they're shown as text (OWASP "CSV Injection" guidance).
 */

import { toIsoDate } from "./dates";

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/** A UTF-8 byte-order mark so Excel detects UTF-8 (names like "Nguyễn", "O’Brien"). */
export const UTF8_BOM = "﻿";

export type CsvValue = string | number | boolean | Date | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let s =
    value instanceof Date ? value.toISOString() : typeof value === "string" ? value : String(value);
  // Numbers are safe as-is (a negative number is data, not a formula).
  if (typeof value === "string" && FORMULA_TRIGGERS.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly CsvValue[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}

/** Safe file name like `brokernotes-notes-2026-11-28.csv` — dated by the broker's (Sydney) calendar, not UTC. */
export function csvFilename(kind: string, date: Date = new Date()): string {
  return `brokernotes-${kind}-${toIsoDate(date)}.csv`;
}
