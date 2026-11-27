/** "Jane van der Berg" → "JB"; "jane" → "J". Used for avatar badges. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

const LOCALE = "en-AU";
const TIME_ZONE = "Australia/Sydney";

/** Australian date + time, e.g. "28/11/2026, 3:05 pm". */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/**
 * Human-friendly relative time: "just now", "5 minutes ago", "yesterday".
 * Older than a week falls back to the AU date (dd/mm/yyyy).
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 60 * 60) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 60 * 60 * 24) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 60 * 60 * 24 * 7) return relative.format(Math.round(seconds / 86400), "day");
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** Short AU date for badges, e.g. "3 Dec" (adds the year when it isn't the current one). */
export function formatShortDate(date: Date, now: Date = new Date()): string {
  const sameYear =
    new Intl.DateTimeFormat(LOCALE, { year: "numeric", timeZone: TIME_ZONE }).format(date) ===
    new Intl.DateTimeFormat(LOCALE, { year: "numeric", timeZone: TIME_ZONE }).format(now);
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: TIME_ZONE,
  }).format(date);
}
