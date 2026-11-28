/**
 * Month-grid maths for the calendar panel. Pure and Zod-free (used in the browser).
 * Weeks start on Monday, as Australian calendars usually do.
 */
import { parseIsoDate } from "./dates";

export type CalendarDay = { date: string; day: number; inMonth: boolean };

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Six Monday-first weeks covering the month (padding days from the months either side). */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  const start = Date.UTC(year, month - 1, 1 - lead);
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const t = new Date(start + (w * 7 + d) * 86_400_000);
      const [y, m, day] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
      week.push({ date: iso(y, m, day), day, inMonth: m === month });
    }
    weeks.push(week);
  }
  return weeks;
}

/** First and last dates shown in that month's grid (what to fetch). */
export function gridRange(year: number, month: number): { from: string; to: string } {
  const g = monthGrid(year, month);
  return { from: g[0]![0]!.date, to: g[5]![6]!.date };
}

/** The month before/after, as { year, month }. */
export function shiftMonth(year: number, month: number, by: number) {
  const t = new Date(Date.UTC(year, month - 1 + by, 1));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
}

/** "2026-12" → { year, month }, or null. */
export function parseYearMonth(value: string | undefined | null) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m || !parseIsoDate(`${m[1]}-${m[2]}-01`)) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** The longest range one calendar request may cover (a 6-week grid plus slack). */
export const CALENDAR_MAX_DAYS = 62;
