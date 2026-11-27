/**
 * Date-only helpers in the broker's time zone (Australia/Sydney, DST-aware).
 *
 * Follow-up dates are calendar days ("call back on 3 Dec"), not instants. We store them as
 * the instant of local midnight on that day, so they display as the right date and
 * "due today / overdue" comparisons line up with the broker's day — not the server's (UTC).
 */
export const BROKER_TIME_ZONE = "Australia/Sydney";

export type YMD = { year: number; month: number; day: number };

const ymdFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar date of `date` in the given time zone. */
export function zonedYmd(date: Date, timeZone = BROKER_TIME_ZONE): YMD {
  const parts = ymdFormatter(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Offset (ms) of `timeZone` from UTC at the given instant, e.g. +11h for AEDT. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant;
}

/** The UTC instant of local midnight at the start of the given calendar day. */
export function zonedMidnight({ year, month, day }: YMD, timeZone = BROKER_TIME_ZONE): Date {
  const utcGuess = Date.UTC(year, month - 1, day);
  // Two passes handle days where the offset changes (DST transitions).
  let instant = utcGuess - zoneOffsetMs(utcGuess, timeZone);
  instant = utcGuess - zoneOffsetMs(instant, timeZone);
  return new Date(instant);
}

export function startOfZonedDay(date: Date, timeZone = BROKER_TIME_ZONE): Date {
  return zonedMidnight(zonedYmd(date, timeZone), timeZone);
}

export function startOfNextZonedDay(date: Date, timeZone = BROKER_TIME_ZONE): Date {
  const { year, month, day } = zonedYmd(date, timeZone);
  // Date.UTC normalises day overflow (e.g. 31 Dec + 1 → 1 Jan).
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return zonedMidnight(
    { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() },
    timeZone,
  );
}

/** "2026-12-03" → YMD, or null if not a real calendar date. */
export function parseIsoDate(value: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Stored follow-up instant → "2026-12-03" for <input type="date">. */
export function toIsoDate(date: Date, timeZone = BROKER_TIME_ZONE): string {
  const { year, month, day } = zonedYmd(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type FollowUpState = "overdue" | "today" | "upcoming";

export function followUpState(followUpAt: Date, now: Date = new Date()): FollowUpState {
  const today = startOfZonedDay(now);
  if (followUpAt < today) return "overdue";
  if (followUpAt < startOfNextZonedDay(now)) return "today";
  return "upcoming";
}
